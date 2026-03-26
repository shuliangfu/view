/**
 * 边界组件：Suspense（异步边界）与 ErrorBoundary（错误边界）。条件渲染请使用 v-if / v-else。
 *
 * @module @dreamer/view/boundary
 * @packageDocumentation
 *
 * **导出组件：** Suspense、ErrorBoundary
 *
 * **导出函数：** isErrorBoundary、getErrorBoundaryFallback（供编译态 try/catch 或 dom 层使用）
 *
 * **全量编译：** ErrorBoundary 接收 children 为无参 getter `() => slot` 或 (parent)=>void；slot 常为 `() => () => (parent)=>void`，运行时先 **剥壳** 再经 {@link wrapMountFnSlotWithTrackedReactiveInsert} 挂 **内层** `insertReactive`（在 fragment 上执行 MountFn，使其中 signal 读能订阅），否则外层 MountFn 在 `untrack` 中执行会 **漏订阅**、错误边界无法在 signal 更新后落 fallback。Suspense 接收 **children 为无参 getter** `() => slot`，返回 (parent)=>void，内部 `insert(..., () => resolved ?? fallback)`。
 *
 * **与「要不要手写 `() =>`」的关系：**
 * - **`RoutePage` 已加载的页面**：内层 `createEffect` 每次重跑都会再次调用 `default()`（经 `pageDefaultToMountFn`），你在页面函数里读的任意 signal（含写在 JSX 里的 `sig.value`）都会让该 effect 订阅并在变化时 **整段重建 VNode**。因此 **ErrorBoundary 下可直接写 `<Child x={sig.value} />`**，不必为了跟 signal 而再包一层 `{() => …}`。
 * - **非路由、或 MountFn/VNode 只构建一次且父级永不重跑视图函数**：子树仍是快照，要跟 signal 只能：**无参 getter children**、**子组件函数体内读 signal**、或 **自行用 `insertReactive` 包一整段**；框架无法在不重算视图的前提下凭空刷新 VNode props。
 *
 * @example
 * <ErrorBoundary fallback={(e) => <div>Error: {e.message}</div>}>
 *   <Suspense fallback={<Spinner />}>{resource()}</Suspense>
 * </ErrorBoundary>
 */

import { isMountFn, markMountFn } from "./compiler/insert.ts";
import { createReactiveInsertFragment } from "./compiler/insert-reactive-siblings.ts";
import { mountVNodeTree } from "./compiler/vnode-mount.ts";
import { isEmptyChild, isVNodeLike } from "./dom/shared.ts";
import { createEffect } from "./effect.ts";
import type { SignalRef } from "./signal.ts";
import { createSignal, isSignalGetter } from "./signal.ts";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { VNode } from "./types.ts";
import {
  insert,
  insertReactive,
  type InsertValueWithMount,
} from "./runtime.ts";

function valueOf<T>(v: T | (() => T)): T {
  return typeof v === "function" ? (v as () => T)() : v;
}

/** 防止病态递归 `() => () => …` 无限剥壳 */
const PEEL_DEFERRED_SLOT_MAX_DEPTH = 64;

/**
 * 全量编译下 ErrorBoundary 的 slot 常为 `() => () => (parent)=>void`：连续无参箭头，`isMountFn` 认不出，
 * `insertReactive` 会走 toNodeForInsert 误插空文本，真实 MountFn 若在其他路径被调用则错误仍冒泡到控制台。
 * 在包装前逐层调用 `length === 0` 且非 signal getter 的函数，直到得到 MountFn、VNode 或非函数。
 *
 * @param slot - `fn()` 的原始返回值
 * @returns 剥壳后的可挂载形态
 */
function peelDeferredSlotValue(slot: unknown): unknown {
  let s = slot;
  for (let d = 0; d < PEEL_DEFERRED_SLOT_MAX_DEPTH; d++) {
    if (typeof s !== "function") break;
    const f = s as (...args: unknown[]) => unknown;
    if (f.length !== 0) break;
    if (isSignalGetter(s)) break;
    s = (s as () => unknown)();
  }
  return s;
}

/**
 * 将单参 MountFn 挂到 **内层** `insertReactive`：getter 内在 fragment 上同步执行 `inner`，使其中对 signal 的读
 * 登记到该内层 effect（外层对 MountFn 的 `insertReactive` 调用在 `untrack` 中，否则会漏订阅，signal 变后子树不刷新、错误边界不落 fallback）。
 *
 * @param inner - 剥壳后的 DOM 挂载函数
 * @param props - 用于取 fallback
 */
function wrapMountFnSlotWithTrackedReactiveInsert(
  inner: (parent: Node) => void,
  props: {
    fallback: (error: unknown) => ErrorBoundaryInsertValue;
  },
): ErrorBoundaryInsertValue {
  return markMountFn((parent: Node) => {
    insertReactive(parent, () => {
      const frag = createReactiveInsertFragment();
      try {
        inner(frag);
      } catch (e) {
        return getErrorBoundaryFallback(props)(e);
      }
      return frag;
    });
  });
}

/**
 * 无参 children getter 可能返回「延迟执行」的单参 MountFn（全量编译下 JSX 常如此）：同步抛错发生在
 * `insertReactive` 调用该 MountFn 时，而非 getter 求值时，故须在 MountFn 内再 try/catch 才能显示 fallback。
 * VNode 同理：`mountVNodeTree` 在 effect 内执行，错误会逃逸到调度器。
 *
 * @param slot - getter 的同步返回值（MountFn、VNode、数组、文本等）
 * @param props - ErrorBoundary props（用于取 fallback）
 * @returns 可交给 `insertReactive` 的下一帧内容
 */
function wrapReactiveSlotForErrorBoundary(
  slot: unknown,
  props: {
    fallback: (error: unknown) => ErrorBoundaryInsertValue;
  },
): ErrorBoundaryInsertValue {
  const peeled = peelDeferredSlotValue(slot);
  if (isEmptyChild(peeled)) return "";
  if (isVNodeLike(peeled)) {
    const tree = peeled as VNode;
    return markMountFn((parent: Node) => {
      try {
        mountVNodeTree(parent, tree);
      } catch (e) {
        insert(parent, getErrorBoundaryFallback(props)(e));
      }
    });
  }
  if (isMountFn(peeled)) {
    return wrapMountFnSlotWithTrackedReactiveInsert(peeled, props);
  }
  if (Array.isArray(peeled)) {
    return peeled.map((item) => {
      const itemPeeled = peelDeferredSlotValue(item);
      if (isMountFn(itemPeeled)) {
        return wrapMountFnSlotWithTrackedReactiveInsert(itemPeeled, props);
      }
      return itemPeeled;
    }) as unknown as ErrorBoundaryInsertValue;
  }
  /**
   * 单测/旧手写 slot 可能返回未打标的 `(parent)=>void`；包一层 try/catch 并 markMountFn，避免 insertReactive 拒识。
   * （业务 slot 不应传入 `expandedRowRender(record)` 这类单参回调，否则会误当 MountFn 调用。）
   */
  if (
    typeof peeled === "function" &&
    (peeled as (p: unknown) => unknown).length === 1 &&
    !isSignalGetter(peeled as () => unknown)
  ) {
    return wrapMountFnSlotWithTrackedReactiveInsert(
      peeled as (p: Node) => void,
      props,
    );
  }
  return peeled as ErrorBoundaryInsertValue;
}

/** 编译态下 fallback 的返回值，与主包 insert 接受的 InsertValueWithMount 一致 */
export type ErrorBoundaryInsertValue = InsertValueWithMount;

/** 稳定标识：code-split 下各 chunk 的 ErrorBoundary 引用不同，用 Symbol 判断以便跨 bundle 识别 */
const ERROR_BOUNDARY_MARKER = Symbol.for("view.errorBoundary");

/**
 * 判断给定组件是否为 ErrorBoundary。
 * 供编译态 try/catch 或 dom 层在渲染组件时做 try/catch，若为 ErrorBoundary 则捕获错误并渲染 fallback。
 * 使用 Symbol.for("view.errorBoundary") 标识，保证 code-split 时 chunk 内的 ErrorBoundary 也能被识别。
 *
 * @param component - 组件函数（可为 (props)=>VNode 或 (props)=>(parent)=>void）
 * @returns 若为 ErrorBoundary 则为 true
 */
export function isErrorBoundary(
  component: (props: Record<string, unknown>) => unknown,
): boolean {
  return (
    component === ErrorBoundary ||
    (component != null &&
      (component as unknown as Record<symbol, unknown>)[
          ERROR_BOUNDARY_MARKER
        ] === true)
  );
}

/**
 * 将 fallback 原始值转为可被 insert(parent, x) 接受的值。
 * 编译态下 fallback 非函数时不再使用 createTextVNode，直接返回可插入的原始值或挂载函数。
 *
 * @param fb - fallback 原始值（函数、Node、string、number、null、undefined 等）
 * @returns InsertValue（(parent)=>void | string | number | Node | null | undefined）
 */
function toErrorBoundaryInsertValue(fb: unknown): InsertValueWithMount {
  if (typeof fb === "function" && fb.length === 1) {
    return fb as (parent: Node) => void;
  }
  if (fb == null) return String(fb);
  if (typeof fb === "string" || typeof fb === "number") return fb;
  if (
    typeof fb === "object" &&
    "nodeType" in fb &&
    typeof (fb as Node).nodeType === "number"
  ) {
    return fb as Node;
  }
  return String(fb);
}

/**
 * 从 ErrorBoundary 的 props 中取出 fallback，并规范为 (error) => ErrorBoundaryInsertValue。
 * 编译态下供 try/catch 后 insert(parent, getErrorBoundaryFallback(props)(e)) 使用。
 * fallback 可为函数 (error)=>InsertValue，或原始值/Node（将转为可插入值，不再使用 VNode）。
 *
 * @param props - ErrorBoundary 的 props
 * @returns 接收 error 并返回 ErrorBoundaryInsertValue 的函数
 */
export function getErrorBoundaryFallback(
  props: Record<string, unknown>,
): (error: unknown) => ErrorBoundaryInsertValue {
  const fb = props.fallback;
  if (typeof fb === "function") {
    return fb as (error: unknown) => ErrorBoundaryInsertValue;
  }
  const value = toErrorBoundaryInsertValue(fb);
  return () => value;
}

/**
 * `jsxs`/多余空白可能把唯一子节点收成单元素数组，避免误判为非 function。
 *
 * @param ch - props.children
 */
function normalizeErrorBoundaryChildrenProp(ch: unknown): unknown {
  if (Array.isArray(ch) && ch.length === 1) return ch[0];
  return ch;
}

/**
 * 错误边界组件：捕获子树中的**同步**错误，并渲染 fallback(error)。
 *
 * - **编译态**：children 多为单参 **`(parent)=>void`**。
 * - **手写 jsx-runtime**：children 可为 **`VNode`**（与 `mountWithRouter` 根同理），内部 `mountVNodeTree` + try/catch。
 * - **响应式子树（可选）**：children 为**无参函数** **`() => slot`** 时用 **`insertReactive`**，在 getter 内 try/catch，signal 更新后重跑 getter。
 *   在 **`RoutePage` 页面 default** 中通常不必手写：页面函数本身已在 effect 内按依赖重跑并生成新 VNode；getter 适用于 **父级不会重跑视图**、仍要让边界内子树随 signal 更新的挂载点。
 *
 * 仅捕获同步渲染路径中的错误；事件回调、Promise 等异步错误需自行处理。
 *
 * @param props.fallback - 接收错误并返回要显示内容的函数，或原始值/Node（将转为可插入值）
 * @param props.children - `(parent)=>void` | `() => unknown`（VNode/MountFn/文本等）| `VNode`
 * @returns (parent)=>void
 */
export function ErrorBoundary(props: {
  fallback: (error: unknown) => ErrorBoundaryInsertValue;
  children?: unknown;
}): (parent: Node) => void {
  const children = normalizeErrorBoundaryChildrenProp(props.children);
  const mountImpl = (parent: Node): void => {
    if (typeof children === "function") {
      const fn = children as (...args: unknown[]) => unknown;
      /**
       * 无参：视为「每次依赖追踪下重新求 slot」（与 Suspense 的 `() => slot` 一致），
       * 同步抛错在 getter 内 catch 并返回 fallback 可挂载值。
       */
      if (fn.length === 0) {
        insertReactive(parent, () => {
          try {
            const x = (fn as () => unknown)();
            return wrapReactiveSlotForErrorBoundary(x, props);
          } catch (e) {
            return getErrorBoundaryFallback(props)(e);
          }
        });
        return;
      }
      try {
        (fn as (p: Node) => void)(parent);
      } catch (e) {
        insert(parent, getErrorBoundaryFallback(props)(e));
      }
      return;
    }
    try {
      if (isVNodeLike(children)) {
        mountVNodeTree(parent, children);
      }
    } catch (e) {
      insert(parent, getErrorBoundaryFallback(props)(e));
    }
  };
  return markMountFn(mountImpl);
}
(ErrorBoundary as unknown as Record<symbol, unknown>)[ERROR_BOUNDARY_MARKER] =
  true;

/**
 * 读取 Suspense 的异步源：编译产物为无参函数 `() => slot`；手写可仍传 VNode 或 Promise（不传 getter）。
 *
 * @param childrenProp - props.children
 * @returns slot 求值结果（VNode、Promise、数组等）
 */
function readSuspenseChildSource(childrenProp: unknown): unknown {
  if (childrenProp == null) return undefined;
  if (
    typeof childrenProp === "function" &&
    (childrenProp as (...args: unknown[]) => unknown).length === 0
  ) {
    return (childrenProp as () => unknown)();
  }
  return childrenProp;
}

/**
 * Suspense 解析完成后写入 signal 的内容：`insertReactive` 可展开 VNode，或单参 `(slot)=>void` 挂载函数。
 */
type SuspenseResolvedContent = VNode | ((slotParent: Node) => void) | null;

/**
 * 将 slot / Promise 结果规范为 VNode 或挂载函数。
 * 编译器产出的单参 MountFn 原样交给 `insertReactive`，由后者传入槽位父节点；不在此处再包 `slotRef`，
 * 以免与 `insertReactive` 记录的父节点不一致时出现双槽位（例如 textContent 呈 "mountedloading"）。
 *
 * @param v - 同步 slot 或 Promise 解析值
 */
function normalizeSuspenseResolvedValue(v: unknown): SuspenseResolvedContent {
  if (v == null) return null;
  if (Array.isArray(v)) {
    return jsx(Fragment, { children: v }) as VNode;
  }
  if (typeof v === "function") {
    const fn = v as (p: Node) => void;
    if (fn.length === 1) {
      return markMountFn(fn);
    }
  }
  return v as VNode;
}

/**
 * 将 Suspense 的「已解析内容」写入 `createSignal` 返回的 `SignalRef`。
 *
 * `SignalRef.value` 赋值约定：若传入值为 `function`，则视为 `(prev) => next` 的更新函数，并以当前 state 调用一次。
 * 已解析内容本身可为单参 MountFn `(parent)=>void`；若直接 `resolved.value = mountFn` 会把 MountFn 误判为 updater，
 * 执行 `mountFn(null)` 抛错，随后 Promise 链 `.catch` 会 `resolved.value = null`，界面永远停在 fallback（与控制台 appendChild on null 一致）。
 * 因此必须通过 updater 形态写入：`(prev) => value`，由 setter 调用后得到真正的下一状态。
 *
 * @param ref - `createSignal<SuspenseResolvedContent>(null)` 的返回值
 * @param value - 规范后的 VNode、MountFn 或 null
 */
function setSuspenseResolvedState(
  ref: SignalRef<SuspenseResolvedContent>,
  value: SuspenseResolvedContent,
): void {
  ref.value = (_prev: SuspenseResolvedContent) => value;
}

/**
 * 异步边界组件（编译态）：children 为 `() => slot`（编译器生成），slot 可为 Promise&lt;VNode&gt;、VNode 或子节点数组。
 * 先显示 fallback，Promise resolve 后显示内容；返回 `(parent)=>void` 与 ErrorBoundary 一致。
 * 手写测试可传 `children: VNode` 或 `Promise&lt;VNode&gt;`（非 getter）。
 *
 * @param props.fallback - 等待期间：VNode 或 `() => VNode`
 * @param props.children - 无参 getter（编译态）或 VNode / Promise（兼容手写）
 * @returns (parent)=>void
 */
export function Suspense(props: {
  fallback: VNode | (() => VNode);
  children?:
    | (() => unknown)
    | VNode
    /** 手写多为 Promise&lt;VNode&gt;；全量编译下 Promise 常解析为单参挂载函数；getter 返回 null/undefined 时显示 fallback */
    | Promise<VNode | ((slotParent: Node) => void)>
    | (() => Promise<VNode> | VNode | null | undefined)
    | null
    | undefined;
}): (parent: Node) => void {
  const resolved = createSignal<SuspenseResolvedContent>(null);
  /**
   * 用「本轮 effect 专属」存活标记淘汰旧 Promise 回调，避免与全局 epoch 比较在微任务顺序下误判：
   * `createEffect` 重跑由调度器入队微任务，`Promise.prototype.then` 回调也是微任务，二者交错时
   * `myEpoch !== epoch` 可能让**仍应生效**的 resolve 被跳过（examples Boundary 在切换 ErrorBoundary 后一直停在「加载中…」）。
   * cleanup 仅将**本闭包**的 `runAlive.v` 置 false，与新一代 effect 的标记无关。
   */
  createEffect(() => {
    const runAlive = { v: true };
    const c = readSuspenseChildSource(props.children);
    if (c != null && typeof (c as Promise<unknown>).then === "function") {
      void (c as Promise<unknown>)
        .then((v) => {
          if (!runAlive.v) return;
          setSuspenseResolvedState(
            resolved,
            normalizeSuspenseResolvedValue(v),
          );
        })
        .catch(() => {
          if (!runAlive.v) return;
          setSuspenseResolvedState(resolved, null);
        });
    } else {
      setSuspenseResolvedState(
        resolved,
        normalizeSuspenseResolvedValue(c),
      );
    }
    return () => {
      runAlive.v = false;
    };
  });
  return markMountFn((parent: Node) => {
    insert(parent, () => resolved.value ?? valueOf(props.fallback));
  });
}
