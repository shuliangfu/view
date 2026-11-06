/**
 * @module csr
 * @description 客户端渲染子路径：`jsr:@dreamer/view/csr`。
 *
 * 聚合 CSR 常用 API（mount/hydrate/insert/props/控制流/懒加载/Suspense），
 * **不含** `@dreamer/view/ssr` 服务端实现与 router/form（按需另引）。
 *
 * @example
 * ```ts
 * import { createSignal, mount, For } from "@dreamer/view/csr";
 * // createSignal 从本路径再导出，便于单行 import 写小应用
 * ```
 */

// Reactivity（CSR 几乎总要）
export { createContext, useContext } from "./reactivity/context.ts";
export {
  createDeferred,
  createEffect,
  createRenderEffect,
  startTransition,
  useTransition,
} from "./reactivity/effect.ts";
export { onMount } from "./reactivity/lifecycle.ts";
export { createMemo, createMemo as memo } from "./reactivity/memo.ts";
export {
  cleanNode,
  createOwner,
  createRoot,
  getOwner,
  onCleanup,
  onError,
  runWithOwner,
} from "./reactivity/owner.ts";
export { createSelector } from "./reactivity/selector.ts";
export { createSignal, untrack } from "./reactivity/signal.ts";
export { createStore, produce, reconcile } from "./reactivity/store.ts";

// Scheduler
export { batch, flushPendingSync, schedule } from "./scheduler/batch.ts";
export { Priority, scheduleTask } from "./scheduler/priority.ts";

// Browser / DOM runtime
export { hydrate, mount } from "./runtime/browser.ts";
export type {
  HydrateOptions,
  HydrationMismatchMode,
} from "./runtime/hydration.ts";
export {
  getHydrationMismatches,
  isHydrating,
  resolveMismatchMode,
  stopHydration,
  useHydratedNode,
} from "./runtime/hydration.ts";
export { createRef, getDocument, scheduleFunctionRef } from "./runtime/dom.ts";
export { insert } from "./runtime/insert.ts";
export { setAttribute, setProperty, spread } from "./runtime/props.ts";
export { template, walk } from "./runtime/template.ts";
export { isSignal, readAccessor, unwrap } from "./runtime/utils.ts";
export { createPortal } from "./runtime/portal.ts";
export type { CreatePortalRoot } from "./runtime/portal.ts";

// Control flow + async UI
export {
  ErrorBoundary,
  For,
  Index,
  Match,
  Portal,
  Show,
  Switch,
} from "./runtime/control-flow.ts";
export { Dynamic, lazy, splitProps } from "./runtime/component.ts";
export {
  registerForSuspense,
  Suspense,
  useSuspense,
} from "./runtime/suspense.ts";
