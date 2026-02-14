/**
 * @module @dreamer/view/csr
 * @description
 * 仅 CSR 的轻量入口：createSignal、createEffect、createRoot、render，不含 renderToString / hydrate / generateHydrationScript。
 * 不需要 SSR 或 hydrate 时从此入口引入可得到更小的 bundle。
 *
 * @example
 * import { createSignal, render } from "jsr:@dreamer/view/csr";
 * render(() => <div>{count()}</div>, document.getElementById("root")!);
 */

export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  setCurrentEffect,
} from "./signal.ts";
export { createEffect, createMemo, onCleanup } from "./effect.ts";
export { createReactiveRoot, createRoot, render } from "./runtime-csr.ts";
export type {
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
export { isDOMEnvironment } from "./types.ts";
export type { EffectDispose } from "./types.ts";
