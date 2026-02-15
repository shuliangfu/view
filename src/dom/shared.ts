/**
 * @module @dreamer/view/dom/shared
 * @description
 * View 模板引擎 — DOM 层共享类型与工具。Fragment、IfContext、SSROptions、isFragment、isVNodeLike 等，供 element / stringify / hydrate 复用。
 *
 * **本模块导出：**
 * - `FragmentType`、`isFragment(vnode)`、`IfContext`、`SSROptions`、`isVNodeLike(x)`、`isEmptyChild(value)`、`createTextVNode(value)`、`createDynamicSpan(doc)`
 */

import type { VNode } from "../types.ts";

/**
 * 判断子节点是否为空（不参与渲染）。
 * 对 null、undefined、false、"" 返回 true，其余返回 false。
 * 用于 normalizeChildren / normalizeChildrenForSSR 中统一过滤，避免渲染出 "false" 或空字符串占位。
 *
 * @param value - 子节点值
 * @returns 若为空则 true，否则 false
 */
export function isEmptyChild(value: unknown): boolean {
  return value == null || value === false || value === "";
}

/**
 * Fragment 的 type 标记 Symbol。
 * 用于表示「不创建真实 DOM 节点、仅包裹子节点」的虚拟节点。
 */
export const FragmentType = Symbol.for("view.fragment");

/**
 * 判断给定 VNode 是否为 Fragment 节点（type 为 FragmentType 或字符串 "Fragment"）。
 *
 * @param vnode - 待检测的 VNode
 * @returns 若为 Fragment 则为 true
 */
export function isFragment(vnode: VNode): boolean {
  return vnode.type === FragmentType || (vnode.type as unknown) === "Fragment";
}

/**
 * v-if / v-else / v-else-if 兄弟链的上下文。
 * 用于 vElse 判断「上一个 vIf 是否为 false」以决定是否渲染。
 */
export type IfContext = { lastVIf: boolean };

/**
 * SSR 渲染选项。
 * allowRawHtml 为 false 时，dangerouslySetInnerHTML 将输出转义文本（更安全）。
 * 默认服务端与客户端一致，允许原始 HTML；若需禁止可传 allowRawHtml: false。
 */
export type SSROptions = { allowRawHtml?: boolean };

/**
 * 判断给定值是否形如 VNode（对象且含 type、props 属性）。
 *
 * @param x - 待检测的值
 * @returns 若形如 VNode 则为 true
 */
export function isVNodeLike(x: unknown): boolean {
  return typeof x === "object" && x !== null && "type" in x && "props" in x;
}

/**
 * 创建文本类型的 VNode（type 为 "#text"，props.nodeValue 为字符串化后的 value）。
 *
 * @param value - 文本内容（会被转为字符串）
 * @returns 文本 VNode
 */
export function createTextVNode(value: unknown): VNode {
  return {
    type: "#text",
    props: { nodeValue: String(value) },
    children: [],
  };
}

/**
 * 创建带 data-view-dynamic 属性的 span 占位元素，用于动态子节点（如 signal getter）的挂载容器。
 *
 * @param doc - Document 实例
 * @returns 新创建的 span 元素
 */
export function createDynamicSpan(doc: Document): Element {
  const el = doc.createElement("span");
  el.setAttribute("data-view-dynamic", "");
  return el;
}
