/**
 * @module @dreamer/view/compiler
 * @description
 * 编译优化：对 JSX/TS 源码做静态提升（static hoisting）与常量折叠（constant folding），减少运行时创建静态节点的开销。依赖 TypeScript 编译器 API（npm:typescript），仅在使用本模块时加载。
 *
 * **本模块导出：**
 * - `optimize(code, fileName?)`：对源码执行优化，返回优化后的代码字符串
 * - `createOptimizePlugin(filter?, readFile?)`：返回可在 esbuild 中使用的 onLoad 插件，对匹配文件执行 optimize
 * - 类型：`OnLoadArgs`（esbuild onLoad 回调参数）
 *
 * **使用场景：** 构建时对 View 组件源码做优化，或通过 esbuild 插件在打包时自动优化。
 *
 * @example
 * import { optimize, createOptimizePlugin } from "jsr:@dreamer/view/compiler";
 * const out = optimize(sourceCode, "App.tsx");
 * // 或 esbuild: plugins: [createOptimizePlugin(/\.tsx$/)]
 */

import { readTextFile } from "@dreamer/runtime-adapter";
import ts from "npm:typescript@5.9";

const factory = ts.factory;

/**
 * 创建数字字面量节点。TS API 要求负数用 createPrefixUnaryExpression(-, literal) 表示，不能传负值给 createNumericLiteral。
 */
function createNumericLiteralSafe(
  value: number,
): ts.NumericLiteral | ts.PrefixUnaryExpression {
  if (value < 0) {
    return factory.createPrefixUnaryExpression(
      ts.SyntaxKind.MinusToken,
      factory.createNumericLiteral(-value),
    );
  }
  return factory.createNumericLiteral(value);
}

/**
 * 常量折叠：将二元/一元表达式中的字面量在编译期求值
 */
function foldConstants(
  context: ts.TransformationContext,
): ts.Transformer<ts.SourceFile> {
  function visit(node: ts.Node): ts.Node {
    if (ts.isBinaryExpression(node)) {
      const left = node.left;
      const right = node.right;
      const op = node.operatorToken.kind;
      if (ts.isNumericLiteral(left) && ts.isNumericLiteral(right)) {
        const a = Number((left as ts.NumericLiteral).text);
        const b = Number((right as ts.NumericLiteral).text);
        let value: number | undefined;
        switch (op) {
          case ts.SyntaxKind.PlusToken:
            value = a + b;
            break;
          case ts.SyntaxKind.MinusToken:
            value = a - b;
            break;
          case ts.SyntaxKind.AsteriskToken:
            value = a * b;
            break;
          case ts.SyntaxKind.SlashToken:
            value = b === 0 ? undefined : a / b;
            break;
          case ts.SyntaxKind.PercentToken:
            value = b === 0 ? undefined : a % b;
            break;
          case ts.SyntaxKind.LessThanToken:
            return a < b ? factory.createTrue() : factory.createFalse();
          case ts.SyntaxKind.GreaterThanToken:
            return a > b ? factory.createTrue() : factory.createFalse();
          case ts.SyntaxKind.LessThanEqualsToken:
            return a <= b ? factory.createTrue() : factory.createFalse();
          case ts.SyntaxKind.GreaterThanEqualsToken:
            return a >= b ? factory.createTrue() : factory.createFalse();
          case ts.SyntaxKind.EqualsEqualsToken:
          case ts.SyntaxKind.EqualsEqualsEqualsToken:
            return a === b ? factory.createTrue() : factory.createFalse();
          case ts.SyntaxKind.ExclamationEqualsToken:
          case ts.SyntaxKind.ExclamationEqualsEqualsToken:
            return a !== b ? factory.createTrue() : factory.createFalse();
          default:
            break;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
          return createNumericLiteralSafe(value);
        }
      }
      if (
        ts.isStringLiteral(left) && ts.isStringLiteral(right) &&
        op === ts.SyntaxKind.PlusToken
      ) {
        return factory.createStringLiteral(
          (left as ts.StringLiteral).text + (right as ts.StringLiteral).text,
        );
      }
    }
    if (ts.isPrefixUnaryExpression(node)) {
      const operand = node.operand;
      const op = node.operator;
      if (ts.isNumericLiteral(operand)) {
        const v = Number((operand as ts.NumericLiteral).text);
        if (op === ts.SyntaxKind.MinusToken) {
          return createNumericLiteralSafe(-v);
        }
        if (op === ts.SyntaxKind.PlusToken) {
          return factory.createNumericLiteral(v);
        }
      }
    }
    return ts.visitEachChild(node, visit, context);
  }
  return (sf: ts.SourceFile) => ts.visitNode(sf, visit) as ts.SourceFile;
}

/**
 * 判断对象字面量的属性是否全部为“静态”（字面量或静态 jsx 调用），用于静态提升
 */
function isStaticObjectLiteral(node: ts.ObjectLiteralExpression): boolean {
  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) return false;
    if (ts.isShorthandPropertyAssignment(prop)) return false;
    if (ts.isPropertyAssignment(prop)) {
      const init = prop.initializer;
      if (
        ts.isNumericLiteral(init) || ts.isStringLiteral(init) ||
        init.kind === ts.SyntaxKind.TrueKeyword ||
        init.kind === ts.SyntaxKind.FalseKeyword
      ) continue;
      if (ts.isObjectLiteralExpression(init) && isStaticObjectLiteral(init)) {
        continue;
      }
      if (ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (
            !ts.isNumericLiteral(el) && !ts.isStringLiteral(el) &&
            el.kind !== ts.SyntaxKind.TrueKeyword &&
            el.kind !== ts.SyntaxKind.FalseKeyword
          ) return false;
        }
        continue;
      }
      return false;
    }
  }
  return true;
}

/**
 * 判断调用是否为 jsx/jsxs 且参数为静态（可提升）
 */
function isStaticJsxCall(node: ts.CallExpression): boolean {
  const name = ts.isIdentifier(node.expression)
    ? node.expression.text
    : ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name.text
    : "";
  if (name !== "jsx" && name !== "jsxs") return false;
  if (node.arguments.length < 2) return false;
  const [tag, props] = node.arguments;
  if (!ts.isStringLiteral(tag) && !ts.isNoSubstitutionTemplateLiteral(tag)) {
    return false;
  }
  if (!ts.isObjectLiteralExpression(props)) return false;
  return isStaticObjectLiteral(props);
}

/** 为静态节点生成唯一变量名 */
let hoistId = 0;
function nextHoistId(): string {
  return `__view_hoist_${hoistId++}`;
}

/**
 * 静态提升：将静态 jsx() 调用提取为模块顶层的常量
 */
function staticHoist(
  context: ts.TransformationContext,
): ts.Transformer<ts.SourceFile> {
  const hoisted: ts.VariableStatement[] = [];

  function visit(node: ts.Node): ts.Node {
    if (ts.isCallExpression(node) && isStaticJsxCall(node)) {
      const id = nextHoistId();
      hoisted.push(
        factory.createVariableStatement(
          [factory.createModifier(ts.SyntaxKind.ConstKeyword)],
          factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(id, undefined, undefined, node)],
            ts.NodeFlags.Const,
          ),
        ),
      );
      return factory.createIdentifier(id);
    }
    return ts.visitEachChild(node, visit, context);
  }

  return (sf: ts.SourceFile) => {
    hoistId = 0;
    hoisted.length = 0;
    const visited = ts.visitEachChild(sf, visit, context);
    if (hoisted.length === 0) return visited;
    const list = [...hoisted, ...visited.statements];
    return factory.updateSourceFile(
      visited,
      list,
      visited.isDeclarationFile,
      visited.referencedFiles,
      visited.typeReferenceDirectives,
      visited.hasNoDefaultLib,
    );
  };
}

/**
 * 对源码执行常量折叠与静态提升，返回优化后的代码字符串。
 *
 * @param code - 源文件内容（可为 TS/JSX）
 * @param fileName - 文件名，用于 SourceMap 与诊断，默认 "source.tsx"
 * @returns 优化后的源码字符串
 */
export function optimize(code: string, fileName = "source.tsx"): string {
  const sf = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const result = ts.transform(sf, [foldConstants, staticHoist]);
  const out = result.transformed[0] as ts.SourceFile;
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printFile(out);
}

/**
 * esbuild onLoad 回调的参数（createOptimizePlugin 内部使用）。
 * @property path - 当前加载的文件路径
 * @property namespace - 可选的 namespace
 */
export type OnLoadArgs = { path: string; namespace?: string };

/** 兼容 esbuild Plugin 的 setup 入参（onLoad 为两参：options + callback） */
type EsbuildPluginBuild = {
  onLoad(
    options: { filter: RegExp; namespace?: string },
    callback: (args: OnLoadArgs) => Promise<{ contents: string }>,
  ): void;
};

/**
 * 创建可在 esbuild 中使用的 transform 插件：对匹配的文件执行 optimize（常量折叠与静态提升）。
 * 默认使用 @dreamer/runtime-adapter 的 readTextFile，兼容 Deno / Bun；可传入自定义 readFile。
 *
 * @param filter - 正则，匹配需要优化的文件路径，默认 /\.(tsx?|jsx?)$/
 * @param readFile - 可选，自定义读文件函数 (path) => Promise<string>
 * @returns esbuild 插件对象 { name, setup }，在 build.onLoad 中对匹配文件执行 optimize 后返回 contents
 */
export function createOptimizePlugin(
  filter: RegExp = /\.(tsx?|jsx?)$/,
  readFile?: (path: string) => Promise<string>,
): { name: string; setup: (build: EsbuildPluginBuild) => void } {
  const load = readFile ?? ((path: string) => readTextFile(path));
  return {
    name: "view-optimize",
    setup(build: EsbuildPluginBuild) {
      build.onLoad({ filter }, async (args: OnLoadArgs) => {
        const code = await load(args.path).catch(() => "");
        const out = optimize(code, args.path);
        const loader = /\.tsx$|\.jsx$/i.test(args.path) ? "tsx" : "ts";
        return { contents: out, loader };
      });
    },
  };
}
