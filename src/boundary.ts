/**
 * 边界组件：Suspense（异步边界）与 ErrorBoundary（错误边界）。条件/列表渲染请使用指令 v-if、v-else、v-for。
 *
 * @module @dreamer/view/boundary
 * @packageDocumentation
 *
 * **导出组件：** Suspense、ErrorBoundary
 *
 * **导出函数：** isErrorBoundary、getErrorBoundaryFallback（供 dom 层使用）
 *
 * @example
 * <ErrorBoundary fallback={(e) => <div>Error: {e.message}</div>}>
 *   <Suspense fallback={<Spinner />}>{resource()}</Suspense>
 * </ErrorBoundary>
 */

import { createEffect } from "./effect.ts";
import { createSignal, markSignalGetter } from "./signal.ts";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { VNode } from "./types.ts";
import { createTextVNode } from "./dom/shared.ts";

function valueOf<T>(v: T | (() => T)): T {
  return typeof v === "function" ? (v as () => T)() : v;
}

/** 稳定标识：code-split 下各 chunk 的 ErrorBoundary 引用不同，用 Symbol 判断以便跨 bundle 识别 */
const ERROR_BOUNDARY_MARKER = Symbol.for("view.errorBoundary");

/**
 * 判断给定组件是否为 ErrorBoundary。
 * 供 dom 层在渲染组件时做 try/catch，若为 ErrorBoundary 则捕获错误并渲染 fallback。
 * 使用 Symbol.for("view.errorBoundary") 标识，保证 code-split 时 chunk 内的 ErrorBoundary 也能被识别。
 *
 * @param component - 组件函数
 * @returns 若为 ErrorBoundary 则为 true
 */
export function isErrorBoundary(
  component: (props: Record<string, unknown>) => VNode | VNode[] | null,
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
 * 从 ErrorBoundary 的 props 中取出 fallback，并规范为 (error) => VNode 函数。
 * fallback 可为函数或 VNode/原始值（将转为文本 VNode）。
 *
 * @param props - ErrorBoundary 的 props
 * @returns 接收 error 并返回 VNode 的函数
 */
export function getErrorBoundaryFallback(
  props: Record<string, unknown>,
): (error: unknown) => VNode {
  const fb = props.fallback;
  if (typeof fb === "function") return fb as (error: unknown) => VNode;
  const vnode: VNode = (fb != null && typeof fb === "object" && "type" in fb)
    ? fb as VNode
    : createTextVNode(fb);
  return () => vnode;
}

/**
 * 错误边界组件：捕获子树渲染中的同步错误，并渲染 fallback(error)。
 * 仅捕获子组件执行或子 VNode 创建时抛出的错误；事件回调等异步错误需自行处理。
 *
 * @param props.fallback - 接收错误并返回要显示的 VNode 的函数
 * @param props.children - 子节点（可能为 VNode、数组或 getter）
 * @returns 仅返回 children（占位），实际捕获与 fallback 渲染由 dom 层在 createElement 时完成
 */
export function ErrorBoundary(props: {
  fallback: (error: unknown) => VNode;
  children?: VNode | VNode[] | (() => VNode | VNode[]);
}): VNode | VNode[] | null {
  return (props.children ?? null) as VNode | VNode[] | null;
}
(ErrorBoundary as unknown as Record<symbol, unknown>)[ERROR_BOUNDARY_MARKER] =
  true;

/**
 * 异步边界组件：当 children 为 Promise 或 getter 返回 Promise 时，先显示 fallback，resolve 后显示内容。
 * 可与 createResource 配合：resource().loading 时显示 fallback，有 data 时显示内容。
 *
 * @param props.fallback - 等待期间显示的 VNode 或返回 VNode 的函数
 * @param props.children - 子节点：VNode、getter 或 Promise<VNode>
 * @returns 包装为 Fragment 的 getter，在 effect 中根据 Promise 状态切换 fallback/内容
 */
export function Suspense(props: {
  fallback: VNode | (() => VNode);
  children: VNode | (() => VNode) | (() => Promise<VNode>) | Promise<VNode>;
}): VNode {
  const [resolved, setResolved] = createSignal<VNode | null>(null);
  /** 每次 effect 运行递增；dispose 时置为 -1，Promise 回调仅当 gen === generation 时才 setResolved，避免 unmount 后或旧 run 的 promise 误更新 */
  let generation = 0;
  createEffect(() => {
    const gen = ++generation;
    const c = valueOf(props.children);
    if (c != null && typeof (c as Promise<unknown>).then === "function") {
      (c as Promise<VNode>).then((v) => {
        if (gen === generation) setResolved(v ?? null);
      });
    } else {
      setResolved((c as VNode) ?? null);
    }
    return () => {
      generation = -1;
    };
  });
  const getter = () => resolved() ?? valueOf(props.fallback);
  return jsx(Fragment, { children: markSignalGetter(getter) });
}
