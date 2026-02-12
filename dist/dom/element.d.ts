/**
 * View 模板引擎 — 将 VNode 转为浏览器 DOM 节点
 *
 * 支持 v-if / v-else / v-for / v-show / v-text / v-html / v-once、Fragment、keyed 列表、动态子节点
 */
import type { VNode } from "../types.ts";
import type { IfContext } from "./shared.ts";
/** 规范化 children 的返回项：VNode 或 signal getter（用于动态子节点） */
export type ChildItem = VNode | (() => unknown);
/**
 * 规范化 children：可能是单个 VNode、数组、signal getter、普通函数（动态子节点）、或原始值（转成文本 VNode）
 * 返回项为 VNode 或 getter/函数，供 createElement 区分静态子与动态子；单次遍历收集减少 flatMap 中间数组
 */
export declare function normalizeChildren(children: unknown): ChildItem[];
/**
 * 挂载“动态子节点”：用 createEffect 根据 getter 的当前值创建并替换子内容
 * 若子项带 key 则做 keyed 协调以复用 DOM
 */
export declare function appendDynamicChild(parent: Element | DocumentFragment, getter: () => unknown, parentNamespace: string | null, ifContext?: IfContext): void;
/**
 * 将 VNode 转为浏览器 DOM 节点（或 DocumentFragment）
 *
 * 错误处理：组件执行时若抛出错误，被 ErrorBoundary 包裹的会捕获并渲染 fallback；
 * 其余错误会冒泡，调用方需自行 try/catch 或保证组件不抛错。
 *
 * @param parentNamespace 父级命名空间（如 SVG_NS），用于正确创建 svg 内子元素
 * @param ifContext 可选，用于 v-else：同一批兄弟中上一个 v-if 的结果
 */
export declare function createElement(vnode: VNode, parentNamespace?: string | null, ifContext?: IfContext): Node;
/** 展开后的根：单节点或片段子项列表（用于根协调，避免整树替换） */
export type ExpandedRoot = VNode | ChildItem[];
/**
 * 仅展开组件为子节点，不求值 getter；用于根协调时得到可 diff 的树。
 * 返回单节点或片段子项数组（ChildItem[]）。
 */
export declare function expandVNode(vnode: VNode): ExpandedRoot;
/**
 * 根据展开根创建 DOM（单节点用 createElement，片段用 appendChildren）；供 createRoot 首次挂载使用
 */
export declare function createNodeFromExpanded(expanded: ExpandedRoot): Node;
/**
 * 根协调：用新展开树 patch 已有 DOM，不整树替换，保证表单等不重挂、不丢焦点
 */
export declare function patchRoot(container: Element, mounted: Node, lastExpanded: ExpandedRoot, newExpanded: ExpandedRoot): void;
//# sourceMappingURL=element.d.ts.map