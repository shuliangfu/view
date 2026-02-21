/**
 * @module @dreamer/view/dom/reconcile
 * @description
 * 协调与 patch 逻辑：reconcileKeyedChildren、reconcileChildren、patchNode、patchRoot。
 * 由 element.ts 注入 createElement、appendDynamicChild 等依赖后使用，避免 element 单文件过大。
 * @internal 仅由 element.ts 使用，不对外导出
 */

import { CONTEXT_SCOPE_TYPE } from "../context.ts";
import {
  KEYED_WRAPPER_ATTR,
  V_FOR_ATTR,
  V_IF_ATTR,
  V_IF_GROUP_ATTR,
  V_ONCE_FROZEN_ATTR,
} from "../constants.ts";
import { hasDirective } from "../directive.ts";
import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import { applyProps } from "./props.ts";
import type { IfContext } from "./shared.ts";
import { createDynamicSpan, isFragment as checkFragment } from "./shared.ts";
import {
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./unmount.ts";

/** 与 element 中 ChildItem 一致：静态 VNode 或动态 getter */
export type ChildItem = VNode | (() => unknown);

/** 与 element 中 ExpandedRoot 一致 */
export type ExpandedRoot = VNode | ChildItem[];

/** SVG 命名空间，与 element 中一致，用于 patch 时 resolve 子命名空间 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** 协调/patch 所需依赖，由 element 注入以避免循环依赖 */
export type ReconcileDeps = {
  createElement: (
    vnode: VNode,
    parentNamespace: string | null,
    ifContext: IfContext,
  ) => Node;
  createVIfGroupPlaceholder: (
    group: VNode[],
    parentNamespace: string | null,
    ifContext: IfContext,
  ) => Element;
  normalizeChildren: (raw: unknown) => ChildItem[];
  resolveNamespace: (
    tag: string,
    parentNamespace: string | null,
  ) => string | null;
  appendChildren: (
    parent: Element | DocumentFragment,
    rawChildren: unknown,
    parentNamespace: string | null,
    ifContext?: IfContext,
  ) => void;
  appendDynamicChild: (
    parent: Element | DocumentFragment,
    getter: () => unknown,
    parentNamespace: string | null,
    ifContext?: IfContext,
  ) => void;
};

/** 从 ChildItem 取 key，供 keyed 协调时与旧列表对齐 */
function getItemKey(item: ChildItem, index: number): string {
  if (isSignalGetter(item) || typeof item === "function") return `@${index}`;
  const k = (item as VNode).key;
  return k != null ? String(k) : `@${index}`;
}

/** 判断 ChildItem 列表是否包含任意带 key 的 VNode，供 element 的 appendDynamicChild 使用 */
export function hasAnyKey(items: ChildItem[]): boolean {
  for (const x of items) {
    if (!isSignalGetter(x) && (x as VNode).key != null) return true;
  }
  return false;
}

/**
 * 收集从 startIndex 起的连续 vIf / vElseIf / vElse 节点（用于一组用一个 effect 响应式渲染）
 * 首项必须为带 getter 的 vIf，否则返回空数组。供 element 的 appendChildren 使用。
 */
export function collectVIfGroup(
  list: ChildItem[],
  startIndex: number,
): VNode[] {
  const first = list[startIndex];
  if (first == null || isSignalGetter(first)) return [];
  const v0 = first as VNode;
  const props = v0.props;
  if (props == null || typeof props !== "object") return [];
  const vIfRaw = props["vIf"] ?? props["v-if"];
  const isReactiveVIf = typeof vIfRaw === "function" || isSignalGetter(vIfRaw);
  if (!hasDirective(props, "vIf") || !isReactiveVIf) return [];

  const group: VNode[] = [v0];
  for (let i = startIndex + 1; i < list.length; i++) {
    const it = list[i];
    if (isSignalGetter(it)) break;
    const v = it as VNode;
    const vProps = v.props;
    if (vProps == null) break;
    if (hasDirective(vProps, "vElseIf") || hasDirective(vProps, "vElse")) {
      group.push(v);
    } else {
      break;
    }
  }
  return group;
}

/**
 * 计算 expanded 子项对应的 DOM 子节点个数（与 appendChildren 一致：v-if 组占 1 个，getter 占 1 个，其余每项 1 个）。
 * 供 reconcileChildren 删除多余节点、按「DOM 槽位」对齐。
 */
function getExpectedDomCount(
  items: ChildItem[],
  collectGroup: (list: ChildItem[], i: number) => VNode[],
): number {
  let count = 0;
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (typeof item === "function" || isSignalGetter(item)) {
      count++;
      i++;
      continue;
    }
    const vnode = item as VNode;
    const props = vnode.props;
    const vIfRaw = props?.["vIf"] ?? props?.["v-if"];
    const isDynamicVIf = props && hasDirective(props, "vIf") &&
      (typeof vIfRaw === "function" || isSignalGetter(vIfRaw));
    if (isDynamicVIf) {
      const group = collectGroup(items, i);
      if (group.length > 0) {
        count++;
        i += group.length;
        continue;
      }
    }
    count++;
    i++;
  }
  return count;
}

const defaultIfContext: IfContext = { lastVIf: true };

/**
 * 根据注入的依赖创建协调与 patch 函数，供 element 使用。
 * 返回 reconcileKeyedChildren、reconcileChildren、patchRoot。
 */
export function createReconcile(deps: ReconcileDeps): {
  reconcileKeyedChildren: (
    container: Element,
    oldItems: ChildItem[],
    items: ChildItem[],
    parentNamespace: string | null,
    ifContext?: IfContext,
  ) => void;
  reconcileChildren: (
    parent: Element | DocumentFragment,
    oldItems: ChildItem[],
    newItems: ChildItem[],
    parentNamespace: string | null,
    ifContext: IfContext,
  ) => void;
  patchRoot: (
    container: Element,
    mounted: Node,
    lastExpanded: ExpandedRoot,
    newExpanded: ExpandedRoot,
  ) => void;
} {
  const {
    createElement,
    createVIfGroupPlaceholder,
    normalizeChildren,
    resolveNamespace,
    appendChildren,
    appendDynamicChild,
  } = deps;

  /**
   * 按 key 协调列表：复用已有 DOM 节点（同 key 时 patch 子节点而非整节点替换），减少重挂
   */
  function reconcileKeyedChildren(
    container: Element,
    oldItems: ChildItem[],
    items: ChildItem[],
    parentNamespace: string | null,
    ifContext?: IfContext,
  ): void {
    const doc = (globalThis as { document: Document }).document;
    const keyToWrapper = new Map<string, Element>();
    for (const child of Array.from(container.children)) {
      const key = (child as Element).getAttribute?.("data-key");
      if (key != null) keyToWrapper.set(key, child as Element);
    }
    const keyToOldItem = new Map<string, ChildItem>();
    for (let i = 0; i < oldItems.length; i++) {
      keyToOldItem.set(getItemKey(oldItems[i], i), oldItems[i]);
    }
    const resultNodes: Node[] = [];
    const ctx = ifContext ?? { lastVIf: true };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (isSignalGetter(item)) {
        const wrap = createDynamicSpan(doc);
        appendDynamicChild(wrap, item as () => unknown, parentNamespace, ctx);
        resultNodes.push(wrap);
        continue;
      }
      const v = item as VNode;
      const key = getItemKey(v, i);
      const wrapper = keyToWrapper.get(key);
      const oldItem = keyToOldItem.get(key);
      const canPatch = wrapper?.firstChild != null &&
        oldItem != null &&
        !isSignalGetter(oldItem) &&
        typeof oldItem !== "function";
      if (wrapper && canPatch) {
        keyToWrapper.delete(key);
        patchNode(
          wrapper.firstChild as Node,
          oldItem as VNode,
          v,
          parentNamespace,
          ctx,
        );
        resultNodes.push(wrapper);
      } else if (wrapper) {
        keyToWrapper.delete(key);
        runDirectiveUnmountOnChildren(wrapper);
        wrapper.replaceChildren(createElement(v, parentNamespace, ctx));
        resultNodes.push(wrapper);
      } else {
        const newWrapper = doc.createElement("span");
        newWrapper.setAttribute(KEYED_WRAPPER_ATTR, "");
        newWrapper.setAttribute("data-key", key);
        newWrapper.appendChild(createElement(v, parentNamespace, ctx));
        resultNodes.push(newWrapper);
      }
    }
    for (const w of keyToWrapper.values()) runDirectiveUnmount(w);
    container.replaceChildren(...resultNodes);
  }

  /**
   * 单节点 patch：同类型同 key 则更新 props 并协调子节点，否则替换
   */
  function patchNode(
    dom: Node,
    oldV: VNode,
    newV: VNode,
    parentNamespace: string | null,
    ifContext: IfContext,
  ): void {
    if (checkFragment(oldV) && checkFragment(newV)) {
      const parent = dom.parentNode as Element | null;
      if (!parent) return;
      const oldChildren = normalizeChildren(
        oldV.props?.children ?? oldV.children ?? [],
      );
      const newChildren = normalizeChildren(
        newV.props?.children ?? newV.children ?? [],
      );
      reconcileChildren(
        parent,
        oldChildren,
        newChildren,
        parentNamespace,
        ifContext,
      );
      return;
    }
    if (
      oldV.type === CONTEXT_SCOPE_TYPE &&
      newV.type === CONTEXT_SCOPE_TYPE
    ) {
      const parent = dom.parentNode;
      if (!parent) return;
      const next = createElement(newV, parentNamespace, ifContext);
      parent.replaceChild(next, dom);
      runDirectiveUnmount(dom);
      return;
    }
    if (oldV.type === "#text" && newV.type === "#text") {
      const newVal = String(
        (newV.props as { nodeValue?: unknown }).nodeValue ?? "",
      );
      if (dom.nodeValue !== newVal) dom.nodeValue = newVal;
      return;
    }

    if (oldV.type !== newV.type || String(oldV.key) !== String(newV.key)) {
      const parent = dom.parentNode;
      if (!parent) return;
      const next = createElement(newV, parentNamespace, ifContext);
      parent.replaceChild(next, dom);
      runDirectiveUnmount(dom);
      return;
    }

    if (typeof newV.type === "function") {
      const parent = dom.parentNode;
      if (!parent) return;
      const next = createElement(newV, parentNamespace, ifContext);
      parent.replaceChild(next, dom);
      runDirectiveUnmount(dom);
      return;
    }

    if (newV.props && hasDirective(newV.props, "vOnce")) {
      const elOnce = dom.nodeType === 1 ? (dom as Element) : null;
      if (elOnce?.hasAttribute?.(V_ONCE_FROZEN_ATTR)) return;
    }

    if (typeof newV.type === "string" && newV.type !== "#text") {
      const nodeType = dom.nodeType;
      const isElementOrFragment = nodeType === 1 || nodeType === 11;
      if (!isElementOrFragment) {
        const parent = dom.parentNode;
        if (!parent) return;
        const next = createElement(newV, parentNamespace, ifContext);
        parent.replaceChild(next, dom);
        runDirectiveUnmount(dom);
        return;
      }
      const el = dom as Element;
      if (
        el.hasAttribute?.(V_FOR_ATTR) ||
        el.hasAttribute?.(V_IF_ATTR) ||
        el.hasAttribute?.(V_IF_GROUP_ATTR)
      ) {
        return;
      }
      applyProps(el, newV.props);
      const oldChildren = normalizeChildren(
        oldV.props?.children ?? oldV.children ?? [],
      );
      const newChildren = normalizeChildren(
        newV.props?.children ?? newV.children ?? [],
      );
      const ns = resolveNamespace(newV.type as string, parentNamespace);
      reconcileChildren(
        el,
        oldChildren,
        newChildren,
        ns ?? (newV.type === "svg" ? SVG_NS : null),
        ifContext,
      );
      if (newV.props && hasDirective(newV.props, "vOnce")) {
        (dom as Element).setAttribute?.(V_ONCE_FROZEN_ATTR, "");
      }
    }
  }

  /**
   * 协调两棵子项列表到父节点上：按「DOM 槽位」对齐（v-if 组占一槽），同槽则 patch，否则替换/插入
   */
  function reconcileChildren(
    parent: Element | DocumentFragment,
    oldItems: ChildItem[],
    newItems: ChildItem[],
    parentNamespace: string | null,
    ifContext: IfContext,
  ): void {
    const doc = (globalThis as { document: Document }).document;
    const expectedDomCount = getExpectedDomCount(newItems, collectVIfGroup);

    for (let i = parent.childNodes.length - 1; i >= expectedDomCount; i--) {
      const node = parent.childNodes[i];
      runDirectiveUnmount(node);
      parent.removeChild(node);
    }

    let i = 0;
    let domIndex = 0;
    while (i < newItems.length) {
      const newItem = newItems[i];
      const oldItem = oldItems[i];
      const existing = parent.childNodes[domIndex] as Node | undefined;

      const group = collectVIfGroup(newItems, i);
      if (group.length > 0) {
        const node = createVIfGroupPlaceholder(
          group,
          parentNamespace,
          ifContext,
        );
        if (!existing) {
          if (domIndex < parent.childNodes.length) {
            parent.insertBefore(node, parent.childNodes[domIndex]);
          } else {
            parent.appendChild(node);
          }
        } else {
          runDirectiveUnmount(existing);
          parent.replaceChild(node, existing);
        }
        domIndex++;
        i += group.length;
        continue;
      }

      if (i >= oldItems.length || !existing) {
        const node = isSignalGetter(newItem) || typeof newItem === "function"
          ? (() => {
            const span = createDynamicSpan(doc);
            appendDynamicChild(
              span,
              newItem as () => unknown,
              parentNamespace,
              ifContext,
            );
            return span;
          })()
          : createElement(newItem as VNode, parentNamespace, ifContext);
        if (domIndex < parent.childNodes.length) {
          parent.insertBefore(node, parent.childNodes[domIndex]);
        } else {
          parent.appendChild(node);
        }
        domIndex++;
        i++;
        continue;
      }

      const newIsGetter = isSignalGetter(newItem) ||
        typeof newItem === "function";
      const oldIsGetter = isSignalGetter(oldItem) ||
        typeof oldItem === "function";
      if (newIsGetter || oldIsGetter) {
        if (newIsGetter && oldIsGetter && oldItem === newItem) {
          domIndex++;
          i++;
          continue;
        }
        runDirectiveUnmount(existing);
        parent.replaceChild(
          newIsGetter
            ? (() => {
              const span = createDynamicSpan(doc);
              appendDynamicChild(
                span,
                newItem as () => unknown,
                parentNamespace,
                ifContext,
              );
              return span;
            })()
            : createElement(newItem as VNode, parentNamespace, ifContext),
          existing,
        );
        domIndex++;
        i++;
        continue;
      }

      if (existing && (existing as Node).nodeType === 1) {
        const el = existing as Element;
        if (el.hasAttribute?.(V_FOR_ATTR) || el.hasAttribute?.(V_IF_ATTR)) {
          runDirectiveUnmount(existing);
          const node = createElement(
            newItem as VNode,
            parentNamespace,
            ifContext,
          );
          parent.replaceChild(node, existing);
          domIndex++;
          i++;
          continue;
        }
      }

      patchNode(
        existing,
        oldItem as VNode,
        newItem as VNode,
        parentNamespace,
        ifContext,
      );
      domIndex++;
      i++;
    }
  }

  /**
   * 根协调：用新展开树对已有 DOM 做增量 patch，不整树替换
   */
  function patchRoot(
    container: Element,
    mounted: Node,
    lastExpanded: ExpandedRoot,
    newExpanded: ExpandedRoot,
  ): void {
    if (Array.isArray(lastExpanded) && Array.isArray(newExpanded)) {
      const frag = mounted as DocumentFragment;
      const parent: Element | DocumentFragment = frag.childNodes.length === 0
        ? container
        : frag;
      reconcileChildren(
        parent,
        lastExpanded,
        newExpanded,
        null,
        defaultIfContext,
      );
      return;
    }

    if (!Array.isArray(lastExpanded) && !Array.isArray(newExpanded)) {
      patchNode(mounted, lastExpanded, newExpanded, null, defaultIfContext);
      return;
    }

    const doc = (globalThis as { document: Document }).document;
    runDirectiveUnmount(mounted);
    const next = Array.isArray(newExpanded)
      ? (() => {
        const frag = doc.createDocumentFragment();
        appendChildren(frag, newExpanded, null, defaultIfContext);
        return frag;
      })()
      : createElement(newExpanded, null, defaultIfContext);
    container.replaceChild(next, mounted);
  }

  return {
    reconcileKeyedChildren,
    reconcileChildren,
    patchRoot,
  };
}
