/**
 * @dreamer/view 构建脚本
 *
 * 读取 deno.json 的 exports，使用 esbuild 将每个发布导出编译为 ESM，
 * 并生成 .d.ts 类型声明，输出到 dist/ 目录，便于 CDN 或非 JSR 环境使用。
 *
 * 运行：deno run -A build.ts
 */

import * as esbuild from "npm:esbuild@0.24.2";
import * as ts from "npm:typescript@5.9";

/** 当前包根目录（build.ts 所在目录即 view/） */
const ROOT = new URL(".", import.meta.url).pathname.replace(/\/$/, "");

/** 简单路径拼接，避免额外依赖 */
function join(...parts: string[]): string {
  return parts
    .filter((p) => p != null && p !== "")
    .join("/")
    .replace(/\/+/g, "/");
}

/** 从 deno.json 读取的 exports 类型 */
interface ExportsMap {
  [subpath: string]: string;
}

/**
 * 读取 view/deno.json 中的 exports 字段
 */
async function loadExports(): Promise<ExportsMap> {
  const path = join(ROOT, "deno.json");
  const content = await Deno.readTextFile(path);
  const json = JSON.parse(content) as { exports?: ExportsMap };
  if (!json.exports || typeof json.exports !== "object") {
    throw new Error("deno.json 中缺少 exports 或格式不正确");
  }
  return json.exports;
}

/**
 * 将导出键转为 dist 文件名（不含扩展名）
 * "." -> "index"，"./store" -> "store"
 */
function exportKeyToBasename(exportKey: string): string {
  if (exportKey === ".") return "index";
  return exportKey.replace(/^\.\//, "");
}

/**
 * 单次构建：一个入口打成一个 ESM 文件
 * @param externals 该入口需要 external 的模块（如 compiler 依赖 npm:typescript，不打进 bundle）
 */
async function buildOne(
  entryKey: string,
  entryPath: string,
  outBasename: string,
  externals: string[] = [],
): Promise<void> {
  const entryAbsolute = entryPath.startsWith("/")
    ? entryPath
    : join(ROOT, entryPath);
  const outfile = join(ROOT, "dist", `${outBasename}.js`);

  await esbuild.build({
    entryPoints: [entryAbsolute],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "@dreamer/view",
    sourcemap: true,
    minify: true,
    external: externals.length > 0 ? externals : undefined,
    // 保持 @dreamer/view 子路径在打包时的解析指向同包内文件
    alias: {
      "@dreamer/view": join(ROOT, "src", "mod.ts"),
      "@dreamer/view/jsx-runtime": join(ROOT, "src", "jsx-runtime.ts"),
      "@dreamer/view/store": join(ROOT, "src", "store.ts"),
      "@dreamer/view/reactive": join(ROOT, "src", "reactive.ts"),
      "@dreamer/view/router": join(ROOT, "src", "router.ts"),
      "@dreamer/view/context": join(ROOT, "src", "context.ts"),
      "@dreamer/view/resource": join(ROOT, "src", "resource.ts"),
      "@dreamer/view/boundary": join(ROOT, "src", "boundary.ts"),
      "@dreamer/view/directive": join(ROOT, "src", "directive.ts"),
      "@dreamer/view/stream": join(ROOT, "src", "stream.ts"),
      "@dreamer/view/compiler": join(ROOT, "src", "compiler.ts"),
    },
  });
}

/**
 * 生成 .d.ts 类型声明（除 compiler 外，compiler 依赖 npm:typescript 由 tsc 单独处理会失败，改用手写声明）
 */
function emitDeclarations(exports: ExportsMap): void {
  const distDir = join(ROOT, "dist");
  const srcDir = join(ROOT, "src");
  /** 排除 compiler，其 import "npm:typescript@5.9" 会导致 tsc 解析失败 */
  const entryPaths = Object.entries(exports)
    .filter(([k]) => k !== "./compiler")
    .map(([, p]) => (p.startsWith("/") ? p : join(ROOT, p)));

  const options: ts.CompilerOptions = {
    declaration: true,
    declarationMap: true,
    emitDeclarationOnly: true,
    outDir: distDir,
    rootDir: srcDir,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: "@dreamer/view",
    skipLibCheck: true,
    strict: true,
  };

  const program = ts.createProgram(entryPaths, options);
  const emitResult = program.emit();

  if (emitResult.diagnostics?.length) {
    const msg = ts.formatDiagnosticsWithColorAndContext(emitResult.diagnostics, {
      getCanonicalFileName: (s) => s,
      getCurrentDirectory: () => ROOT,
      getNewLine: () => "\n",
    });
    console.error(msg);
    throw new Error("Declaration emit 报错");
  }

  /** 主入口 src/mod.ts -> dist/mod.d.ts，需改名为 index.d.ts 与 index.js 对应 */
  const modDts = join(distDir, "mod.d.ts");
  const indexDts = join(distDir, "index.d.ts");
  try {
    Deno.renameSync(modDts, indexDts);
  } catch {
    // 可能已不存在或已改名，忽略
  }
  const modMap = join(distDir, "mod.d.ts.map");
  const indexMap = join(distDir, "index.d.ts.map");
  try {
    Deno.renameSync(modMap, indexMap);
  } catch {
    // 同上
  }

  /** compiler 手写声明（因依赖 npm:typescript，不参与 tsc emit） */
  const compilerDts = `/** @dreamer/view/compiler — 类型声明（compiler 依赖 TypeScript 运行时，此处仅声明对外 API） */
export type OnLoadArgs = { path: string; namespace?: string };
export function optimize(code: string, fileName?: string): string;
export function createOptimizePlugin(
  filter?: RegExp,
  readFile?: (path: string) => Promise<string>,
): { name: string; setup: (build: unknown) => void };
`;
  Deno.writeTextFileSync(join(distDir, "compiler.d.ts"), compilerDts);
}

/**
 * 主流程：创建 dist 目录，按 exports 逐个编译 JS，再生成 .d.ts
 */
async function main(): Promise<void> {
  const exports = await loadExports();
  await Deno.mkdir(join(ROOT, "dist"), { recursive: true });

  const entries = Object.entries(exports);
  console.log(`[build] 共 ${entries.length} 个导出待编译\n`);

  /** 需要 external 的入口（不把依赖打进 bundle，由运行时提供） */
  const entryExternals: Record<string, string[]> = {
    "./compiler": ["npm:typescript@5.9"],
  };

  for (const [key, entryPath] of entries) {
    const basename = exportKeyToBasename(key);
    const outName = `${basename}.js`;
    const externals = entryExternals[key] ?? [];
    await Deno.stdout.write(
      new TextEncoder().encode(`[build] ${key} -> dist/${outName} ... `),
    );
    try {
      await buildOne(key, entryPath, basename, externals);
      console.log("ok");
    } catch (e) {
      console.log("fail");
      throw e;
    }
  }

  console.log("[build] 生成 .d.ts 类型声明 ... ");
  emitDeclarations(exports);
  console.log("ok\n[build] 全部完成，产物在 dist/ 目录（.js + .js.map + .d.ts）");
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
