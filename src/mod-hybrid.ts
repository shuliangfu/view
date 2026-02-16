/**
 * @module @dreamer/view/hybrid
 * @description
 * 客户端 Hybrid 入口：createRoot、render、hydrate、mount，不含 renderToString、generateHydrationScript。
 * 服务端用主包或 @dreamer/view/stream 出 HTML，客户端用本入口激活，体积介于 core 与全量之间。
 * mount(container, fn, options?) 支持选择器与 Element，有子节点则 hydrate 否则 render；容器查不到时可 noopIfNotFound。
 *
 * @example
 * // 服务端：renderToString(() => <App />) + generateHydrationScript({ scriptSrc: "/client.js" })
 * // 客户端：mount("#root", () => <App />);  // 有 SSR 内容则 hydrate，否则 render
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
  hydrate,
  mount,
  render,
} from "./runtime-hybrid.ts";
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
