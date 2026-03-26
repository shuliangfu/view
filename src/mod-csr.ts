/**
 * **仅 CSR** 的轻量入口：不含 `renderToString`、`hydrate`、`generateHydrationScript`，便于缩小浏览器 bundle。
 *
 * `mount(container, fn, options?)` 支持 CSS 选择器或 `Element`；`fn` 为 `(container) => void`，只执行一次。
 * 全编译场景下由编译器注入 `insert`；若手写挂载逻辑需要 `insert`，请从 `@dreamer/view` 或 `@dreamer/view/compiler` 额外导入（本入口不导出 `insert`）。
 *
 * @module @dreamer/view/csr
 * @packageDocumentation
 *
 * **导出：** `createSignal`、`createEffect`、`createRenderEffect`、`createMemo`、`children`、`createDeferred`、`createReaction`、`catchError`、`on`、`onCleanup`、`onMount`、`createRoot`、`render`、`mount`、`getCurrentEffect`、`setCurrentEffect`、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`、`createResource`、`lazy`、`mapArray`、`isDOMEnvironment`
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

export * from "./client-exports.ts";
export { createRoot, mount, render } from "./runtime-csr.ts";
