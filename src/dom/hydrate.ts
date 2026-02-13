/**
 * View 模板引擎 — 在已有 DOM 上 hydrate
 *
 * 复用 container 内子节点，与 vnode 树一一对应并挂上 props/effect
 */

import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import {
  getVElseIfValue,
  getVElseShow,
  getVIfValue,
  hasDirective,
  hasStructuralDirective,
} from "../directive.ts";
import type { IfContext } from "./shared.ts";
import { createDynamicSpan, isFragment } from "./shared.ts";
import { appendDynamicChild, normalizeChildren } from "./element.ts";
import { applyProps } from "./props.ts";
import { runDirectiveUnmountOnChildren } from "./unmount.ts";

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
  const props = vnode.props;
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
 * 在已有 DOM 容器上执行完整 hydrate。
 * 复用 container 内已有子节点，与 vnode 树一一对应，并挂上 props、指令与响应式绑定。
 * 通常由 runtime 的 hydrate() 在检测到容器已有服务端渲染内容时调用。
 *
 * @param container - 已有 SSR 子节点的 DOM 容器
 * @param vnode - 与 SSR 输出对应的根 VNode（与服务端 renderToString 使用同一组件树）
 */
export function hydrateElement(container: Element, vnode: VNode): void {
  const nodes = Array.from(container.childNodes);
  hydrateFromList(nodes, 0, vnode, null);
}
