/**
 * 客户端 Hybrid 入口：含 createRoot、render、hydrate、mount，不含 renderToString、generateHydrationScript。体积介于 csr 与主包之间。
 *
 * @module @dreamer/view/hybrid
 * @packageDocumentation
 *
 * **导出：** createSignal、createEffect、createMemo、onCleanup、createRoot、render、hydrate、mount、getCurrentEffect、setCurrentEffect、isSignalGetter、isDOMEnvironment；类型同 csr
 *
 * 服务端用主包或 stream 出 HTML，客户端用本入口激活。mount 有子节点则 hydrate，否则 render。
 *
 * @example
 * mount("#root", () => <App />);  // 有 SSR 内容则 hydrate，否则 render
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
  createReactiveRootHydrate,
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
