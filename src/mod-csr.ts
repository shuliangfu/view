/**
 * 仅 CSR 的轻量入口：不含 renderToString、hydrate、generateHydrationScript，bundle 更小。
 *
 * @module @dreamer/view/csr
 * @packageDocumentation
 *
 * **导出：** createSignal、createEffect、createMemo、onCleanup、createRoot、render、mount、getCurrentEffect、setCurrentEffect、isSignalGetter、isDOMEnvironment；类型 MountOptions、Root、SignalGetter、SignalSetter、SignalTuple、VNode、EffectDispose
 *
 * mount(container, fn, options?) 支持选择器与 Element，始终 render；noopIfNotFound 时容器查不到则静默返回。
 *
 * @example
 * import { createSignal, mount } from "jsr:@dreamer/view/csr";
 * mount("#root", () => <div>{count()}</div>);
 */

export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  setCurrentEffect,
} from "./signal.ts";
export { createEffect, createMemo, onCleanup } from "./effect.ts";
export {
  createReactiveRoot,
  createRoot,
  mount,
  render,
} from "./runtime-csr.ts";
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
