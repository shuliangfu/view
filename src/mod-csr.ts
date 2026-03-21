/**
 * **仅 CSR** 的轻量入口：不含 `renderToString`、`hydrate`、`generateHydrationScript`，便于缩小浏览器 bundle。
 *
 * `mount(container, fn, options?)` 支持 CSS 选择器或 `Element`；`fn` 为 `(container) => void`，只执行一次。
 * 全编译场景下由编译器注入 `insert`；若手写挂载逻辑需要 `insert`，请从 `@dreamer/view` 或 `@dreamer/view/compiler` 额外导入（本入口不导出 `insert`）。
 *
 * @module @dreamer/view/csr
 * @packageDocumentation
 *
 * **导出：** `createSignal`、`createEffect`、`createMemo`、`onCleanup`、`createRoot`、`render`、`mount`、`getCurrentEffect`、`setCurrentEffect`、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`、`isDOMEnvironment`
 *
 * **类型：** `MountOptions`、`Root`、`SignalRef`、`SignalGetter`、`SignalSetter`、`SignalTuple`、`VNode`、`EffectDispose`
 *
 * @example
 * ```ts
 * import { createSignal, mount } from "jsr:@dreamer/view/csr";
 * const count = createSignal(0);
 * mount("#root", (el) => { el.textContent = String(count.value); });
 * ```
 */

export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  isSignalRef,
  setCurrentEffect,
  unwrapSignalGetterValue,
} from "./signal.ts";
export type { SignalRef } from "./signal.ts";
export { createEffect, createMemo, onCleanup } from "./effect.ts";
export { createRoot, mount, render } from "./runtime-csr.ts";
export type {
  MountOptions,
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
export { isDOMEnvironment } from "./types.ts";
export type { EffectDispose } from "./types.ts";
