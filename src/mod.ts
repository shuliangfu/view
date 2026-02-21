/**
 * 轻量响应式模板引擎主入口，仅导出核心 API，按需从子路径导入以减小主包体积。
 *
 * @module @dreamer/view
 * @packageDocumentation
 *
 * **响应式：** createSignal、createEffect、createMemo、onCleanup、untrack、getCurrentEffect、setCurrentEffect、isSignalGetter
 *
 * **渲染：** createRoot、render、mount、renderToString、hydrate、generateHydrationScript、createReactiveRoot、createReactiveRootHydrate
 *
 * **环境：** getDocument、isDOMEnvironment
 *
 * **类型：** HydrationScriptOptions、EffectDispose、MountOptions、Root、SignalGetter、SignalSetter、SignalTuple、VNode
 *
 * **按需子路径：** ./store、./reactive、./boundary、./directive、./resource、./context、./compiler、./stream、./router、./types、./jsx-runtime
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
export { createEffect, createMemo, onCleanup, untrack } from "./effect.ts";
export { getDocument } from "./globals.ts";
export {
  createReactiveRoot,
  createReactiveRootHydrate,
  createRoot,
  generateHydrationScript,
  hydrate,
  mount,
  render,
  renderToString,
} from "./runtime.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
export type {
  EffectDispose,
  MountOptions,
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
export { isDOMEnvironment } from "./types.ts";
