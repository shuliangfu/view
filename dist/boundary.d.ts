/**
 * @dreamer/view/boundary — 按需导入
 *
 * 仅保留 Suspense、ErrorBoundary。条件/列表渲染请用指令：v-if / v-else / v-else-if / v-for。
 * Suspense 支持 Promise 子节点；ErrorBoundary 捕获子树错误。
 */
import type { VNode } from "./types.ts";
/** ErrorBoundary 组件引用，供 dom 做 try/catch 时识别 */
export declare function isErrorBoundary(component: (props: Record<string, unknown>) => VNode | VNode[] | null): boolean;
/** 从 ErrorBoundary 的 props 中取 fallback 函数：(error) => VNode */
export declare function getErrorBoundaryFallback(props: Record<string, unknown>): (error: unknown) => VNode;
/**
 * 错误边界：捕获子树渲染中的错误，显示 fallback(error)
 * 仅捕获子组件执行或子 VNode 创建时的同步错误。
 */
export declare function ErrorBoundary(props: {
    fallback: (error: unknown) => VNode;
    children?: VNode | VNode[] | (() => VNode | VNode[]);
}): VNode | VNode[] | null;
/**
 * 异步边界：children 为 Promise<VNode> 或 getter 返回 Promise 时先显示 fallback，resolve 后显示内容
 * 与 createResource 配合：resource().loading 时显示 fallback，有 data 时显示内容
 */
export declare function Suspense(props: {
    fallback: VNode | (() => VNode);
    children: VNode | (() => VNode) | (() => Promise<VNode>) | Promise<VNode>;
}): VNode;
//# sourceMappingURL=boundary.d.ts.map