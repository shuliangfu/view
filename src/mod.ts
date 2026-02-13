/**
 * @module @dreamer/view
 * @description
 * 轻量响应式模板引擎主入口，仅导出核心 API，按需从子路径导入以减小主包体积。
 *
 * **本模块导出：**
 * - 响应式：`createSignal`、`createEffect`、`createMemo`、`onCleanup`、`getCurrentEffect`、`setCurrentEffect`、`isSignalGetter`
 * - 渲染：`createRoot`、`render`、`renderToString`、`hydrate`、`generateHydrationScript`
 * - 类型：`HydrationScriptOptions`、`EffectDispose`、`Root`、`SignalGetter`、`SignalSetter`、`SignalTuple`、`VNode`、`isDOMEnvironment`
 *
 * **JSX：** 在 deno.json / tsconfig 中设置 `jsxImportSource: "@dreamer/view"`，并从 `@dreamer/view/jsx-runtime` 解析 jsx/jsxs/Fragment。
 *
 * **按需子路径：** `@dreamer/view/store`、`@dreamer/view/reactive`、`@dreamer/view/boundary`、`@dreamer/view/directive`、`@dreamer/view/resource`、`@dreamer/view/context`、`@dreamer/view/compiler`、`@dreamer/view/stream`、`@dreamer/view/router`
 *
 * @example
 * import { createSignal, createEffect, render } from "jsr:@dreamer/view";
 * const [count, setCount] = createSignal(0);
 * render(() => <div>{count()}</div>, document.getElementById("root")!);
 */

export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  setCurrentEffect,
} from "./signal.ts";
export { createEffect, createMemo, onCleanup } from "./effect.ts";
export {
  createRoot,
  generateHydrationScript,
  hydrate,
  render,
  renderToString,
} from "./runtime.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
export type {
  EffectDispose,
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
export { isDOMEnvironment } from "./types.ts";
