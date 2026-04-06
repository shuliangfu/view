/**
 * @module compiler
 * @description 编译器主入口 - JSX 转换和编译配置。
 *
 * **支持的功能：**
 * - ✅ compileSource() - 编译源码
 * - ✅ transformJSX() - JSX 转换
 * - ✅ 代码分析 (analyzer)
 * - ✅ 路径生成 (path-gen)
 * - ✅ 编译选项配置 (hydration, hmr, ssr 等)
 *
 * **核心机制：**
 * - TypeScript 转换器集成
 * - JSX 到运行时函数的转换
 * - 编译时优化
 *
 * **范围说明：**
 * - 完整流水线、Source Map、增量编译与诊断体验由 CLI/构建层与本入口组合演进，不在此单文件承诺「一次性补齐」。
 *
 * @usage
 * const result = compileSource(sourceCode, options)
 */

import ts from "typescript";
import { transformJSX } from "./transformer.ts";

export * from "./analyzer.ts";
export * from "./path-gen.ts";
export * from "./transformer.ts";

export interface CompileOptions {
  insertImportPath?: string;
  hydration?: boolean;
  generate?: "dom" | "ssr";
  hmr?: boolean;
}

/**
 * 编译源码。
 * 将 JSX 转换为高效的运行时代码。
 */
export function compileSource(
  source: string,
  fileName: string,
  options: CompileOptions = {},
): string {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );

  const result = ts.transform(sourceFile, [(ctx) =>
    transformJSX(ctx, {
      hydration: options.hydration,
      generate: options.generate,
      hmr: options.hmr,
    })]);
  const transformedSourceFile = result.transformed[0] as ts.SourceFile;

  const printer = ts.createPrinter();
  const output = printer.printFile(transformedSourceFile);

  // 注入运行时导入
  const importPath = options.insertImportPath || "@dreamer/view";
  let runtimeImports = "";

  if (options.generate === "ssr") {
    runtimeImports = `import { memo } from "${importPath}";\n`;
  } else {
    // DOM 模式：与 transformer 产出的标识符对齐（template / walk / insert / setAttribute / setProperty / spread）
    const imports = [
      "template",
      "walk",
      "insert",
      "setAttribute",
      "setProperty",
      "spread",
    ];
    // 三元内联 JSX 会生成 memo(() => ...)，按需导入避免无谓依赖
    if (output.includes("memo(")) {
      imports.push("memo");
    }
    // 只有当产出代码中包含 createHMRProxy 时才导入它（HMR 包装 export const 组件）
    if (options.hmr && output.includes("createHMRProxy")) {
      imports.push("createHMRProxy");
    }
    runtimeImports = `import { ${imports.join(", ")} } from "${importPath}";\n`;

    if (options.hydration) {
      runtimeImports += `import { useHydratedNode } from "${importPath}";\n`;
    }
  }

  return runtimeImports + output;
}
