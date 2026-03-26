/**
 * **Hybrid 客户端**入口：含 `createRoot`、`render`、`mount` 与完整 Signal/Effect API，**不含** `renderToString`、`generateHydrationScript`。包体积介于 `@dreamer/view/csr` 与主入口之间。
 *
 * 全编译场景下模板内的 `insert` 由编译器注入（通常从 `@dreamer/view/compiler` 导入）；手写挂载函数若需 `insert`，请从 `@dreamer/view` 或 `@dreamer/view/compiler` 另行导入。
 *
 * @module @dreamer/view/hybrid
 * @packageDocumentation
 *
 * **导出：** `createSignal`、`createEffect`、`createRenderEffect`、`createMemo`、`children`、`createDeferred`、`createReaction`、`catchError`、`on`、`onCleanup`、`onMount`、`createRoot`、`render`、`mount`、`getCurrentEffect`、`setCurrentEffect`、`isSignalGetter`、`isSignalRef`、`unwrapSignalGetterValue`、`createResource`、`lazy`、`mapArray`、`isDOMEnvironment`
 *
 * **类型：** `MountOptions`、`Root`、`SignalRef`、`SignalGetter`、`SignalSetter`、`SignalTuple`、`VNode`、`EffectDispose`（与 csr 一致）
 *
 * @example
 * ```ts
 * import { mount, createSignal } from "jsr:@dreamer/view/hybrid";
 * const n = createSignal(0);
 * mount("#root", (el) => {
 *   el.textContent = String(n.value);
 * });
 * ```
 */

export * from "./client-exports.ts";
export { createRoot, mount, render } from "./runtime-csr.ts";
