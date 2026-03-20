/**
 * 边界组件：Suspense（异步边界）与 ErrorBoundary（错误边界）。条件/列表渲染请使用指令 v-if、v-else、v-for。
 *
 * @module @dreamer/view/boundary
 * @packageDocumentation
 *
 * **导出组件：** Suspense、ErrorBoundary
 *
 * **导出函数：** isErrorBoundary、getErrorBoundaryFallback（供编译态 try/catch 或 dom 层使用）
 *
 * **全量编译：** ErrorBoundary 接收 children 为 (parent)=>void；Suspense 接收 **children 为无参 getter** `() => slot`（由编译器从 slot JSX/表达式生成），返回 (parent)=>void，内部 `insert(..., () => resolved ?? fallback)`；解析结果与 fallback 仍可为 VNode（由 insertReactive 展开）。
 *
 * @example
 * <ErrorBoundary fallback={(e) => <div>Error: {e.message}</div>}>
 *   <Suspense fallback={<Spinner />}>{resource()}</Suspense>
 * </ErrorBoundary>
 */

import { createEffect } from "./effect.ts";
import { createSignal } from "./signal.ts";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { VNode } from "./types.ts";
import { insert, type InsertValueWithMount } from "./runtime.ts";

function valueOf<T>(v: T | (() => T)): T {
  return typeof v === "function" ? (v as () => T)() : v;
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
 * 错误边界组件（编译态）：捕获子树渲染中的同步错误，并渲染 fallback(error)。
 * 接收 children 为 (parent)=>void（由编译器在 <ErrorBoundary> 处传入），返回 (parent)=>void 并在内部 try/catch。
 * 仅捕获子组件执行时抛出的错误；事件回调等异步错误需自行处理。
 *
 * @param props.fallback - 接收错误并返回要显示内容的函数，或原始值/Node（将转为可插入值）
 * @param props.children - 子节点挂载函数 (parent)=>void（编译态下由编译器传入）
 * @returns (parent)=>void：执行时 try children(parent)，catch 时 insert(parent, fallback(error))
 */
export function ErrorBoundary(props: {
  fallback: (error: unknown) => ErrorBoundaryInsertValue;
  children?: (parent: Node) => void;
}): (parent: Node) => void {
  const children = props.children;
  const mount = (parent: Node): void => {
    try {
      if (typeof children === "function") children(parent);
    } catch (e) {
      insert(parent, getErrorBoundaryFallback(props)(e));
    }
  };
  return mount;
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
      return fn;
    }
  }
  return v as VNode;
}

/**
 * 将 Suspense 的「已解析内容」写入 `createSignal` 的 setter。
 *
 * `createSignal` 的 setter 约定：若传入值为 `function`，则视为 `(prev) => next` 的更新函数，并以当前 state 调用一次。
 * 已解析内容本身可为单参 MountFn `(parent)=>void`；若直接 `setResolved(mountFn)` 会把 MountFn 误判为 updater，
 * 执行 `mountFn(null)` 抛错，随后 Promise 链 `.catch` 会 `setResolved(null)`，界面永远停在 fallback（与控制台 appendChild on null 一致）。
 * 因此必须通过 updater 形态写入：`(prev) => value`，由 setter 调用后得到真正的下一状态。
 *
 * @param set - `createSignal` 返回的 setter
 * @param value - 规范后的 VNode、MountFn 或 null
 */
function setSuspenseResolvedState(
  set: (
    next:
      | SuspenseResolvedContent
      | ((prev: SuspenseResolvedContent) => SuspenseResolvedContent),
  ) => void,
  value: SuspenseResolvedContent,
): void {
  set((_prev: SuspenseResolvedContent) => value);
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
  const [resolved, setResolved] = createSignal<SuspenseResolvedContent>(null);
  /**
   * 单调 epoch：cleanup 时递增，使旧 Promise 回调与当前 effect 代数不一致时放弃 setResolved。
   * 旧实现用 `generation = -1` 再 `++generation`，导致多轮后 gen 恒为 0、竞态与「一直 fallback」更难排查。
   */
  let epoch = 0;
  createEffect(() => {
    const myEpoch = ++epoch;
    const c = readSuspenseChildSource(props.children);
    if (c != null && typeof (c as Promise<unknown>).then === "function") {
      void (c as Promise<unknown>)
        .then((v) => {
          if (myEpoch !== epoch) return;
          setSuspenseResolvedState(
            setResolved,
            normalizeSuspenseResolvedValue(v),
          );
        })
        .catch(() => {
          if (myEpoch !== epoch) return;
          setSuspenseResolvedState(setResolved, null);
        });
    } else {
      setSuspenseResolvedState(
        setResolved,
        normalizeSuspenseResolvedValue(c),
      );
    }
    return () => {
      epoch++;
    };
  });
  return (parent: Node) => {
    insert(parent, () => resolved() ?? valueOf(props.fallback));
  };
}
