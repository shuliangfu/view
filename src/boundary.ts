/**
 * @dreamer/view/boundary — 按需导入
 *
 * 仅保留 Suspense、ErrorBoundary。条件/列表渲染请用指令：v-if / v-else / v-else-if / v-for。
 * Suspense 支持 Promise 子节点；ErrorBoundary 捕获子树错误。
 */

import { createEffect } from "./effect.ts";
import { createSignal, markSignalGetter } from "./signal.ts";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { VNode } from "./types.ts";

function valueOf<T>(v: T | (() => T)): T {
  return typeof v === "function" ? (v as () => T)() : v;
}

/** ErrorBoundary 组件引用，供 dom 做 try/catch 时识别 */
export function isErrorBoundary(
  component: (props: Record<string, unknown>) => VNode | VNode[] | null,
): boolean {
  return component === ErrorBoundary;
}

/** 从 ErrorBoundary 的 props 中取 fallback 函数：(error) => VNode */
export function getErrorBoundaryFallback(
  props: Record<string, unknown>,
): (error: unknown) => VNode {
  const fb = props.fallback;
  if (typeof fb === "function") return fb as (error: unknown) => VNode;
  const vnode: VNode = (fb != null && typeof fb === "object" && "type" in fb)
    ? fb as VNode
    : { type: "#text", props: { nodeValue: String(fb) }, children: [] };
  return () => vnode;
}

/**
 * 错误边界：捕获子树渲染中的错误，显示 fallback(error)
 * 仅捕获子组件执行或子 VNode 创建时的同步错误。
 */
export function ErrorBoundary(props: {
  fallback: (error: unknown) => VNode;
  children?: VNode | VNode[] | (() => VNode | VNode[]);
}): VNode | VNode[] | null {
  return (props.children ?? null) as VNode | VNode[] | null;
}

/**
 * 异步边界：children 为 Promise<VNode> 或 getter 返回 Promise 时先显示 fallback，resolve 后显示内容
 * 与 createResource 配合：resource().loading 时显示 fallback，有 data 时显示内容
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
