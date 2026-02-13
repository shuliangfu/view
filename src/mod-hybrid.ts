/**
 * @module @dreamer/view/hybrid
 * @description
 * 客户端 Hybrid 入口：createRoot、render、hydrate，不含 renderToString、generateHydrationScript。
 * 服务端用主包或 @dreamer/view/stream 出 HTML，客户端用本入口调用 hydrate() 激活，体积介于 core 与全量之间。
 *
 * @example
 * // 服务端：renderToString(() => <App />) + generateHydrationScript({ scriptSrc: "/client.js" })
 * // 客户端 bundle（从本入口）：hydrate(() => <App />, document.getElementById("root")!);
 */

export {
  createSignal,
  getCurrentEffect,
  isSignalGetter,
  setCurrentEffect,
} from "./signal.ts";
export { createEffect, createMemo, onCleanup } from "./effect.ts";
export { createRoot, hydrate, render } from "./runtime-hybrid.ts";
export type {
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
export { isDOMEnvironment } from "./types.ts";
export type { EffectDispose } from "./types.ts";
