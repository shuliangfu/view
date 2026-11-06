/**
 * @module mod
 * @description @dreamer/view **3.0** main entry — CSR **core** barrel (Strategy A landed).
 *
 * **Breaking (3.0):** no longer re-exports router / form / resource integrations.
 * Import those from `@dreamer/view/router`, `/form`, `/resource`.
 * Migration: `docs/en-US/MIGRATION-3.0.md` · `docs/zh-CN/MIGRATION-3.0.md`.
 *
 * Still exports: reactivity, scheduler, mount/hydrate, insert/props/template,
 * control-flow, Suspense/lazy/Dynamic, portal, HMR helpers.
 *
 * Prefer focused subpaths when possible:
 * ```ts
 * import { createSignal } from "@dreamer/view/reactivity";
 * import { mount, For } from "@dreamer/view/csr";
 * import { createRouter, mountWithRouter } from "@dreamer/view/router";
 * import { createForm } from "@dreamer/view/form";
 * import { createResource } from "@dreamer/view/resource";
 * ```
 *
 * Compatible core import (3.0):
 * `import { createSignal, createRef, mount, For, Suspense, createPortal } from "@dreamer/view"`
 * SSR: `renderToString` / streams from `@dreamer/view/ssr` only.
 */

export * from "./reactivity/context.ts";
export * from "./reactivity/effect.ts";
export * from "./reactivity/lifecycle.ts";
export * from "./reactivity/memo.ts";
/** {@link createMemo} 的别名，与编译器 SSR 模式 `memo` 导入一致。 */
export { createMemo as memo } from "./reactivity/memo.ts";
export * from "./reactivity/owner.ts";
export * from "./reactivity/selector.ts";
export * from "./reactivity/signal.ts";
export * from "./reactivity/store.ts";
export { VIEW_MATCH_KEY } from "./types.ts";
export type {
  InsertCurrent,
  InsertValue,
  JSXElementType,
  JSXRenderable,
  MaybeAccessor,
  RefObject,
  ShowChildren,
  SwitchChild,
  ViewMatchDescriptor,
  ViewRefObject,
  ViewSignalTagged,
  ViewSlot,
  ViewTransparentProviderMeta,
  VNode,
} from "./types.ts";

// Runtime
export * from "./runtime/browser.ts";
export * from "./runtime/component.ts";
export { createRef, getDocument, scheduleFunctionRef } from "./runtime/dom.ts";
/** 判别 Signal、解包多层 Signal；供组件库使用，与 `insert` 对函数/Signal 的判定一致 */
export { isSignal, readAccessor, unwrap } from "./runtime/utils.ts";
export * from "./runtime/control-flow.ts";
export {
  ErrorBoundary,
  For,
  Index,
  Match,
  Portal,
  Show,
  Switch,
} from "./runtime/control-flow.ts";
export * from "./runtime/hmr.ts";
export * from "./runtime/hydration.ts";
export * from "./runtime/insert.ts";
export { setAttribute, setProperty, spread } from "./runtime/props.ts";
export * from "./runtime/suspense.ts";
export * from "./runtime/template.ts";

/** 命令式 Portal：`createPortal(render, container)`，与声明式 {@link Portal} 互补（弹窗/toast 等） */
export { createPortal, type CreatePortalRoot } from "./runtime/portal.ts";

// Scheduler
export * from "./scheduler/batch.ts";
export * from "./scheduler/priority.ts";
