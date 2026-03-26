/**
 * **JSX → 运行时挂载代码**的编译器：将 TSX 中的 JSX 转为对 `insert` / `createElement` / `insertReactive` 等的调用，供 `view-cli` build/dev 或自建构建链路使用。
 *
 * 仅用于**构建期**；产物依赖 `@dreamer/view/compiler`（或配置的 `insertImportPath`）中的运行时 API。
 *
 * @module @dreamer/view/jsx-compiler
 * @packageDocumentation
 *
 * **导出：** `compileSource`、`CompileSourceOptions`、`jsxToRuntimeFunction`、`JsxToRuntimeFunctionOptions`
 */

export {
  collectScopedSignalsAndShadows,
  expressionReadsReactiveBinding,
  expressionReferencesPropsLikeParameter,
  isCreateSignalCall,
  jsxExpressionMayHoistToInsertWithDeps,
} from "./dependency-graph.ts";
export {
  compileSource,
  type CompileSourceOptions,
  jsxToRuntimeFunction,
  type JsxToRuntimeFunctionOptions,
} from "./transform.ts";
