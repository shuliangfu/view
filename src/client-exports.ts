/**
 * **客户端瘦入口**共用的子导出聚合（文件 `client-exports.ts`）：`createSignal`、Effect/Resource、`<For>`/`<Show>`/`<Switch>`/`<Dynamic>` 与常用类型。
 *
 * 由 `@dreamer/view/csr`、`@dreamer/view/hybrid` 与 `@dreamer/view/compiled`（在 `createRef`、挂载与 SSR 相关导出之外）复用，
 * 避免三处维护重复列表；公开符号与拆分前分别手写导出时一致。
 *
 * @internal 请勿作为稳定子路径直接导入；请使用上述正式入口。
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
export {
  catchError,
  children,
  createDeferred,
  createEffect,
  createMemo,
  createReaction,
  createRenderEffect,
  on,
  onCleanup,
  onMount,
} from "./effect.ts";
export type { CreateDeferredOptions, OnOptions } from "./effect.ts";
export { createResource, lazy, mapArray } from "./resource.ts";
export type {
  CreateResourceOptions,
  LazyComponentModule,
  ResourceResult,
} from "./resource.ts";
export { For, Index } from "./for.ts";
export type { ForProps, ListEachInput } from "./for.ts";
export { Show } from "./show.ts";
export type { ShowProps, ShowWhenInput } from "./show.ts";
export { Match, Switch } from "./switch-match.ts";
export type { SwitchMatchCase, SwitchProps } from "./switch-match.ts";
export { Dynamic } from "./dynamic.ts";
export type { DynamicProps } from "./dynamic.ts";
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
