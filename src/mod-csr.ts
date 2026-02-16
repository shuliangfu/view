/**
 * @module @dreamer/view/csr
 * @description
 * 仅 CSR 的轻量入口：createSignal、createEffect、createRoot、render、mount，不含 renderToString / hydrate / generateHydrationScript。
 * 不需要 SSR 或 hydrate 时从此入口引入可得到更小的 bundle。
 * mount(container, fn, options?) 支持选择器与 Element，始终 render；容器查不到时可 noopIfNotFound 静默返回。
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
