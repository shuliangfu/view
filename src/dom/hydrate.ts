/**
 * @module @dreamer/view/dom/hydrate
 * @description
 * View 模板引擎 — 在已有 DOM 上 hydrate。复用 container 内子节点，与 vnode 树一一对应并挂上 props/effect。
 *
 * **本模块导出：**
 * - `hydrateElement(container, vnode)`：在已有 DOM 上激活，与 vnode 一一对应并挂上 props/effect
 * - `hydrateFromExpanded(container, expanded)`：基于已展开树 hydrate，不执行组件，首屏 effect 只跑一次
 */

import { KEY_VIEW_DEV } from "../constants.ts";
import {
  getVElseIfValue,
  getVElseShow,
  getVIfValue,
  hasDirective,
  hasStructuralDirective,
} from "../directive.ts";
import { getGlobal } from "../globals.ts";
import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import type { ChildItem, ExpandedRoot } from "./element.ts";
import { appendDynamicChild, normalizeChildren } from "./element.ts";
import { applyProps } from "./props.ts";
import type { IfContext } from "./shared.ts";
import { createDynamicSpan, isFragment } from "./shared.ts";
import { runDirectiveUnmountOnChildren } from "./unmount.ts";

/** 开发环境下收集 vnode 树的节点描述（tag/key）用于与 DOM 对比；ifContext 会随 vIf/vElse/vElseIf 更新以与 hydrateFromList 一致 */
function collectExpected(
  vnode: VNode,
  out: string[],
  ifContext?: IfContext,
): void {
  if (typeof vnode === "function") {
    out.push("<dynamic>");
    return;
  }
  const props = vnode.props;
  if (props == null || typeof props !== "object") return;
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return;
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext?.lastVIf) return;
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return;
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasStructuralDirective(props) === "vIf" && !getVIfValue(props)) {
    if (ifContext) ifContext.lastVIf = false;
    return;
  }
  if (hasStructuralDirective(props) === "vIf" && ifContext) {
    ifContext.lastVIf = true;
  }
  if (isFragment(vnode)) {
    const ctx = ifContext ?? { lastVIf: true };
    const children = normalizeChildren(vnode.props.children ?? vnode.children);
    for (const c of children) {
      if (isSignalGetter(c)) out.push("<dynamic>");
      else collectExpected(c as VNode, out, ctx);
    }
    return;
  }
  if (typeof vnode.type === "function") {
    const result = vnode.type(vnode.props);
    if (result == null) return;
    const list = Array.isArray(result) ? result : [result];
    for (const n of list) collectExpected(n, out, ifContext);
    return;
  }
  const tag = vnode.type as string;
  const key = vnode.key != null ? `:key=${String(vnode.key)}` : "";
  out.push(tag === "#text" ? "#text" : `${tag}${key}`);
  if (tag === "#text") return;
  const rawChildren = props.children ?? vnode.children;
  if (isSignalGetter(rawChildren)) {
    out.push("<dynamic>");
    return;
  }
  const ctx = ifContext ?? { lastVIf: true };
  const childList = normalizeChildren(rawChildren);
  for (const item of childList) {
    if (isSignalGetter(item)) out.push("<dynamic>");
    else collectExpected(item as VNode, out, ctx);
  }
}

/** 从已展开树收集节点描述（不执行组件），用于与 DOM 对比 */
function collectExpectedFromExpanded(
  expanded: ExpandedRoot,
  out: string[],
  ifContext?: IfContext,
): void {
  if (Array.isArray(expanded)) {
    const ctx = ifContext ?? { lastVIf: true };
    for (const item of expanded) {
      if (typeof item === "function") out.push("<dynamic>");
      else collectExpectedFromExpandedItem(item as VNode, out, ctx);
    }
    return;
  }
  collectExpectedFromExpandedItem(expanded as VNode, out, ifContext);
}

/** 单条 ChildItem / VNode 的预期结构收集（已展开树中无组件，不调用 type） */
function collectExpectedFromExpandedItem(
  item: ChildItem,
  out: string[],
  ifContext?: IfContext,
): void {
  if (typeof item === "function") {
    out.push("<dynamic>");
    return;
  }
  const vnode = item as VNode;
  const props = vnode.props;
  if (props == null || typeof props !== "object") return;
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return;
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext?.lastVIf) return;
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return;
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasStructuralDirective(props) === "vIf" && !getVIfValue(props)) {
    if (ifContext) ifContext.lastVIf = false;
    return;
  }
  if (hasStructuralDirective(props) === "vIf" && ifContext) {
    ifContext.lastVIf = true;
  }
  if (isFragment(vnode)) {
    const ctx = ifContext ?? { lastVIf: true };
    const children = normalizeChildren(vnode.props.children ?? vnode.children);
    for (const c of children) {
      if (isSignalGetter(c)) out.push("<dynamic>");
      else collectExpectedFromExpandedItem(c as ChildItem, out, ctx);
    }
    return;
  }
  const tag = vnode.type as string;
  const key = vnode.key != null ? `:key=${String(vnode.key)}` : "";
  out.push(tag === "#text" ? "#text" : `${tag}${key}`);
  if (tag === "#text") return;
  const rawChildren = props.children ?? vnode.children;
  if (isSignalGetter(rawChildren)) {
    out.push("<dynamic>");
    return;
  }
  const ctx = ifContext ?? { lastVIf: true };
  const childList = normalizeChildren(rawChildren);
  for (const child of childList) {
    if (isSignalGetter(child)) out.push("<dynamic>");
    else collectExpectedFromExpandedItem(child as ChildItem, out, ctx);
  }
}

/** 开发环境下对比「已展开树」与 DOM 结构，不一致时 console.warn（不执行组件） */
function warnHydrationMismatchFromExpanded(
  container: Element,
  expanded: ExpandedRoot,
): void {
  if (!getGlobal<boolean>(KEY_VIEW_DEV)) return;
  const expected: string[] = [];
  collectExpectedFromExpanded(expanded, expected);
  const actual: string[] = [];
  collectActual(Array.from(container.childNodes), actual);
  if (
    expected.length !== actual.length ||
    expected.some((e, i) => actual[i] !== e)
  ) {
    const path = container.id
      ? `#${container.id}`
      : (container.getAttribute?.("class")?.slice(0, 30) ?? "container");
    console.warn(
      `[View] Hydration mismatch at ${path}: expected ${expected.length} nodes (e.g. ${
        expected.slice(0, 5).join(", ")
      }${expected.length > 5 ? "..." : ""}), got ${actual.length} (e.g. ${
        actual.slice(0, 5).join(", ")
      }${
        actual.length > 5 ? "..." : ""
      }). Ensure server-rendered HTML matches the client component tree (e.g. same keys, same conditional branches).`,
    );
  }
}

/** 从 DOM 节点列表收集描述（tag/key） */
function collectActual(nodes: Node[], out: string[]): void {
  for (const n of nodes) {
    if (n.nodeType === 3) {
      out.push("#text");
      continue;
    }
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    const tag = (el.nodeName || "").toLowerCase();
    const key = el.getAttribute?.("data-key");
    out.push(key != null ? `${tag}:key=${key}` : tag);
    const childNodes = Array.from(el.childNodes);
    if (childNodes.length) collectActual(childNodes, out);
  }
}

/** 开发环境下对比预期与实际节点结构，不一致时 console.warn 并附带路径 */
function warnHydrationMismatch(container: Element, vnode: VNode): void {
  if (!getGlobal<boolean>(KEY_VIEW_DEV)) return;
  const expected: string[] = [];
  collectExpected(vnode, expected);
  const actual: string[] = [];
  collectActual(Array.from(container.childNodes), actual);
  if (
    expected.length !== actual.length ||
    expected.some((e, i) => actual[i] !== e)
  ) {
    const path = container.id
      ? `#${container.id}`
      : (container.getAttribute?.("class")?.slice(0, 30) ?? "container");
    console.warn(
      `[View] Hydration mismatch at ${path}: expected ${expected.length} nodes (e.g. ${
        expected.slice(0, 5).join(", ")
      }${expected.length > 5 ? "..." : ""}), got ${actual.length} (e.g. ${
        actual.slice(0, 5).join(", ")
      }${
        actual.length > 5 ? "..." : ""
      }). Ensure server-rendered HTML matches the client component tree (e.g. same keys, same conditional branches).`,
    );
  }
}

/**
 * 完整 hydrate：复用已有 DOM 节点，与 vnode 一一对应并挂上 props/effect
 * 返回消费的节点数（用于游标推进）
 */
function hydrateFromList(
  nodes: Node[],
  index: number,
  vnode: VNode,
  parentNamespace: string | null,
  ifContext?: IfContext,
): number {
  // 组件可能返回函数（动态槽），此时不能当作 VNode 递归；与 createElement 一致，用占位 + appendDynamicChild
  if (typeof vnode === "function") {
    const doc = (globalThis as { document: Document }).document;
    const wrap = createDynamicSpan(doc);
    if (nodes[index]) {
      (nodes[index] as Node).parentNode?.replaceChild(wrap, nodes[index]);
    }
    const ctx = ifContext ?? { lastVIf: true };
    appendDynamicChild(wrap, vnode as () => unknown, parentNamespace, ctx);
    return index + 1;
  }
  const props = vnode.props;
  if (props == null || typeof props !== "object") {
    return index;
  }
  const structural = hasStructuralDirective(props);
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return index;
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext && ifContext.lastVIf) return index;
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return index;
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vIf" && !getVIfValue(props)) {
    if (ifContext) ifContext.lastVIf = false;
    return index;
  }
  if (structural === "vIf" && ifContext) ifContext.lastVIf = true;

  if (isFragment(vnode)) {
    const ctx = ifContext ?? { lastVIf: true };
    const children = normalizeChildren(vnode.props.children ?? vnode.children);
    let i = index;
    for (const c of children) {
      if (isSignalGetter(c)) {
        const wrap = createDynamicSpan(
          (globalThis as { document: Document }).document,
        );
        if (nodes[i]) {
          (nodes[i] as Element).replaceWith?.(wrap) ??
            (nodes[i].parentNode?.appendChild(wrap));
        }
        appendDynamicChild(wrap, c as () => unknown, parentNamespace, ctx);
        i++;
      } else {
        i = hydrateFromList(nodes, i, c as VNode, parentNamespace, ctx);
      }
    }
    return i;
  }
  if (typeof vnode.type === "function") {
    const result = vnode.type(vnode.props);
    if (result == null) return index;
    const list = Array.isArray(result) ? result : [result];
    let i = index;
    for (const n of list) {
      i = hydrateFromList(nodes, i, n, parentNamespace, ifContext);
    }
    return i;
  }
  const tag = vnode.type as string;
  if (tag === "#text") {
    const text = nodes[index] as Text;
    if (text && text.nodeType === 3) {
      text.nodeValue = String(
        (vnode.props as { nodeValue?: unknown }).nodeValue ?? "",
      );
    }
    return index + 1;
  }
  const el = nodes[index] as Element;
  if (!el || el.nodeType !== 1) return index + 1;
  const elTag = (el.nodeName || "").toLowerCase();
  const wantTag = tag.toLowerCase();
  if (elTag !== wantTag) return index + 1;
  applyProps(el, props);
  const rawChildren = props.children ?? vnode.children;
  const ctx = ifContext ?? { lastVIf: true };
  if (isSignalGetter(rawChildren)) {
    runDirectiveUnmountOnChildren(el);
    el.replaceChildren();
    appendDynamicChild(el, rawChildren as () => unknown, parentNamespace, ctx);
    return index + 1;
  }
  const childList = Array.from(el.childNodes);
  const childItems = normalizeChildren(rawChildren);
  let next = 0;
  for (const item of childItems) {
    if (isSignalGetter(item)) {
      const wrap = createDynamicSpan(
        (globalThis as { document: Document }).document,
      );
      if (childList[next]) {
        (childList[next] as Node).parentNode?.replaceChild(
          wrap,
          childList[next],
        );
      }
      appendDynamicChild(wrap, item as () => unknown, parentNamespace, ctx);
      next++;
    } else {
      next = hydrateFromList(
        childList,
        next,
        item as VNode,
        parentNamespace,
        ctx,
      );
    }
  }
  return index + 1;
}

/**
 * 基于已展开树做 hydrate：与 DOM 一一对应并挂上 props/effect，不执行组件（避免组件树执行两次）。
 * 返回消费的节点下标，供根级遍历使用。
 */
function hydrateFromExpandedItem(
  nodes: Node[],
  index: number,
  item: ChildItem,
  parentNamespace: string | null,
  ifContext?: IfContext,
): number {
  if (typeof item === "function") {
    const doc = (globalThis as { document: Document }).document;
    const wrap = createDynamicSpan(doc);
    if (nodes[index]) {
      (nodes[index] as Node).parentNode?.replaceChild(wrap, nodes[index]);
    }
    const ctx = ifContext ?? { lastVIf: true };
    appendDynamicChild(wrap, item, parentNamespace, ctx);
    return index + 1;
  }
  const vnode = item as VNode;
  const props = vnode.props;
  if (props == null || typeof props !== "object") {
    return index;
  }
  const structural = hasStructuralDirective(props);
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return index;
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext?.lastVIf) return index;
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return index;
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vIf" && !getVIfValue(props)) {
    if (ifContext) ifContext.lastVIf = false;
    return index;
  }
  if (structural === "vIf" && ifContext) ifContext.lastVIf = true;

  if (isFragment(vnode)) {
    const ctx = ifContext ?? { lastVIf: true };
    const children = normalizeChildren(vnode.props.children ?? vnode.children);
    let i = index;
    for (const c of children) {
      if (isSignalGetter(c)) {
        const wrap = createDynamicSpan(
          (globalThis as { document: Document }).document,
        );
        if (nodes[i]) {
          (nodes[i] as Element).replaceWith?.(wrap) ??
            (nodes[i].parentNode?.appendChild(wrap));
        }
        appendDynamicChild(wrap, c as () => unknown, parentNamespace, ctx);
        i++;
      } else {
        i = hydrateFromExpandedItem(
          nodes,
          i,
          c as ChildItem,
          parentNamespace,
          ctx,
        );
      }
    }
    return i;
  }
  const tag = vnode.type as string;
  if (tag === "#text") {
    const text = nodes[index] as Text;
    if (text && text.nodeType === 3) {
      text.nodeValue = String(
        (vnode.props as { nodeValue?: unknown }).nodeValue ?? "",
      );
    }
    return index + 1;
  }
  const el = nodes[index] as Element;
  if (!el || el.nodeType !== 1) return index + 1;
  const elTag = (el.nodeName || "").toLowerCase();
  const wantTag = tag.toLowerCase();
  if (elTag !== wantTag) return index + 1;
  applyProps(el, props);
  const rawChildren = props.children ?? vnode.children;
  const ctx = ifContext ?? { lastVIf: true };
  if (isSignalGetter(rawChildren)) {
    runDirectiveUnmountOnChildren(el);
    el.replaceChildren();
    appendDynamicChild(el, rawChildren as () => unknown, parentNamespace, ctx);
    return index + 1;
  }
  const childList = Array.from(el.childNodes);
  const childItems = normalizeChildren(rawChildren);
  let next = 0;
  for (const childItem of childItems) {
    if (isSignalGetter(childItem)) {
      const wrap = createDynamicSpan(
        (globalThis as { document: Document }).document,
      );
      if (childList[next]) {
        (childList[next] as Element).parentNode?.replaceChild(
          wrap,
          childList[next],
        );
      }
      appendDynamicChild(
        wrap,
        childItem as () => unknown,
        parentNamespace,
        ctx,
      );
      next++;
    } else {
      next = hydrateFromExpandedItem(
        childList,
        next,
        childItem as ChildItem,
        parentNamespace,
        ctx,
      );
    }
  }
  return index + 1;
}

/**
 * 基于已展开树在已有 DOM 上 hydrate，不执行组件，保证首屏组件/effect 只跑一次。
 * 与 hydrateElement 语义一致，但调用方需先 expandVNode(vnode) 再传入 expanded。
 *
 * @param container - 已有 SSR 子节点的 DOM 容器
 * @param expanded - expandVNode(vnode) 的返回值
 */
export function hydrateFromExpanded(
  container: Element,
  expanded: ExpandedRoot,
): void {
  warnHydrationMismatchFromExpanded(container, expanded);
  const nodes = Array.from(container.childNodes);
  if (Array.isArray(expanded)) {
    let i = 0;
    for (const item of expanded) {
      i = hydrateFromExpandedItem(nodes, i, item, null);
    }
  } else {
    hydrateFromExpandedItem(nodes, 0, expanded as ChildItem, null);
  }
}

/**
 * 在已有 DOM 容器上执行完整 hydrate。
 * 复用 container 内已有子节点，与 vnode 树一一对应，并挂上 props、指令与响应式绑定。
 * 通常由 runtime 的 hydrate() 在检测到容器已有服务端渲染内容时调用。
 *
 * @param container - 已有 SSR 子节点的 DOM 容器
 * @param vnode - 与 SSR 输出对应的根 VNode（与服务端 renderToString 使用同一组件树）
 */
export function hydrateElement(container: Element, vnode: VNode): void {
  warnHydrationMismatch(container, vnode);
  const nodes = Array.from(container.childNodes);
  hydrateFromList(nodes, 0, vnode, null);
}
