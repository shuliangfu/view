/**
 * View 模板引擎 — 将 VNode 转为浏览器 DOM 节点
 *
 * 支持 v-if / v-else / v-for / v-show / v-once、Fragment、keyed 列表、动态子节点
 */

import { getErrorBoundaryFallback, isErrorBoundary } from "../boundary.ts";
import {
  CONTEXT_SCOPE_TYPE,
  getContextBinding,
  popContext,
  pushContext,
} from "../context.ts";
import {
  getDirectiveValue,
  getVElseIfValue,
  getVElseShow,
  getVForListAndFactory,
  getVIfValue,
  hasDirective,
  hasStructuralDirective,
  resolveVForFactory,
} from "../directive.ts";
import { createEffect } from "../effect.ts";
import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import { isDOMEnvironment } from "../types.ts";
import { applyProps } from "./props.ts";
import type { IfContext } from "./shared.ts";
import {
  createDynamicSpan,
  createTextVNode,
  isFragment as checkFragment,
  isVNodeLike,
} from "./shared.ts";
import {
  registerDirectiveUnmount,
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./unmount.ts";

/** SVG 命名空间，用于 createElementNS */
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * vIf/vElseIf/vElse 切换时 replaceChildren/appendChild 可能触发浏览器滚动锚定或焦点移动导致页面滚动。
 * 在更新 placeholder 前后保存并恢复滚动位置，避免用户感知到滚动。
 */
function preserveScrollAroundUpdate(update: () => void): void {
  const win = globalThis as {
    scrollX?: number;
    scrollY?: number;
    scrollTo?: (x: number, y: number) => void;
  };
  const x = typeof win.scrollX === "number" ? win.scrollX : 0;
  const y = typeof win.scrollY === "number" ? win.scrollY : 0;
  update();
  if (typeof win.scrollTo === "function") {
    requestAnimationFrame(() => win.scrollTo!(x, y));
  }
}

/**
 * 规范化后的子项类型：静态 VNode 或动态 getter（signal / 函数，在 effect 中求值并订阅）。
 */
export type ChildItem = VNode | (() => unknown);

const KEYED_WRAPPER_ATTR = "data-view-keyed";

/**
 * v-once：冻结 vnode（props/children 中 getter 求值一次），返回无 getter 的 vnode 供 createElement 只渲染一次
 */
function freezeVNodeForOnce(vnode: VNode): VNode {
  const props = vnode.props;
  const frozenProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "vOnce" || k === "v-once") continue;
    frozenProps[k] = isSignalGetter(v) ? getDirectiveValue(v) : v;
  }
  frozenProps.children = freezeChildrenForOnce(
    props.children ?? vnode.children,
  );
  return { type: vnode.type, props: frozenProps, key: vnode.key, children: [] };
}

function freezeChildrenForOnce(raw: unknown): unknown {
  if (isSignalGetter(raw)) {
    return freezeChildrenForOnce(getDirectiveValue(raw));
  }
  if (Array.isArray(raw)) {
    return raw.map((c) => freezeChildrenForOnce(c));
  }
  if (raw != null && typeof raw === "object" && "type" in raw) {
    return freezeVNodeForOnce(raw as VNode);
  }
  return raw;
}

/**
 * 解析当前元素的命名空间：在 svg 内或自身为 svg 时使用 SVG_NS
 */
function resolveNamespace(
  tag: string,
  parentNamespace: string | null,
): string | null {
  if (parentNamespace === SVG_NS) return SVG_NS;
  if (tag === "svg") return SVG_NS;
  return null;
}

/**
 * 规范化 children：支持单个 VNode、数组、signal getter、普通函数（动态子节点）或原始值（转为文本 VNode）。
 * 返回 ChildItem 数组，供 createElement 区分静态子节点与动态子节点。
 *
 * @param children - props.children 或 vnode.children（可能为任意合法子节点形式）
 * @returns 规范化后的子项数组（VNode 或 getter）
 */
export function normalizeChildren(children: unknown): ChildItem[] {
  if (children == null) return [];
  if (isSignalGetter(children)) {
    return [children as () => unknown];
  }
  /** 普通函数子节点（如 () => { const r = resource(); return r.data ? ... : ... }）按动态子节点处理，在 effect 中求值并订阅 */
  if (typeof children === "function") {
    return [children as () => unknown];
  }
  if (Array.isArray(children)) {
    const out: ChildItem[] = [];
    for (const c of children) {
      const items = normalizeChildren(c);
      for (const item of items) out.push(item);
    }
    return out;
  }
  if (isVNodeLike(children)) return [children as VNode];
  return [createTextVNode(children)];
}

/** 判断 ChildItem 列表是否包含任意带 key 的 VNode */
function hasAnyKey(items: ChildItem[]): boolean {
  for (const x of items) {
    if (!isSignalGetter(x) && (x as VNode).key != null) return true;
  }
  return false;
}

/**
 * 按 key 协调列表：复用已有 DOM 节点（同 key 仅更新内容），减少重挂
 */
function reconcileKeyedChildren(
  container: Element,
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
    const key = v.key != null ? String(v.key) : `@${i}`;
    let wrapper = keyToWrapper.get(key);
    if (wrapper) {
      keyToWrapper.delete(key);
      runDirectiveUnmountOnChildren(wrapper);
      wrapper.replaceChildren(createElement(v, parentNamespace, ctx));
      resultNodes.push(wrapper);
    } else {
      wrapper = doc.createElement("span");
      wrapper.setAttribute(KEYED_WRAPPER_ATTR, "");
      wrapper.setAttribute("data-key", key);
      wrapper.appendChild(createElement(v, parentNamespace, ctx));
      resultNodes.push(wrapper);
    }
  }
  runDirectiveUnmountOnChildren(container);
  container.replaceChildren(...resultNodes);
}

/**
 * 挂载动态子节点：用 createEffect 根据 getter 的当前值创建并替换子内容。
 * 若子项带 key 则做 keyed 协调以复用 DOM。
 *
 * @param parent - 挂载目标（Element 或 DocumentFragment）
 * @param getter - 返回子节点内容的 signal getter 或函数
 * @param parentNamespace - 父级命名空间（如 SVG），用于创建子元素
 * @param ifContext - 可选，v-else / v-else-if 的上下文
 */
export function appendDynamicChild(
  parent: Element | DocumentFragment,
  getter: () => unknown,
  parentNamespace: string | null,
  ifContext?: IfContext,
): void {
  const doc = (globalThis as { document: Document }).document;
  const placeholder = createDynamicSpan(doc);
  parent.appendChild(placeholder);

  const dispose = createEffect(() => {
    const value = getter();
    const items = normalizeChildren(value);
    const ctx = ifContext ?? { lastVIf: true };
    if (items.length > 0 && hasAnyKey(items)) {
      reconcileKeyedChildren(
        placeholder as Element,
        items,
        parentNamespace,
        ctx,
      );
      return;
    }
    const frag = doc.createDocumentFragment();
    for (const v of items) {
      if (isSignalGetter(v)) {
        const inner = createDynamicSpan(doc);
        frag.appendChild(inner);
        appendDynamicChild(inner, v as () => unknown, parentNamespace, ctx);
      } else {
        frag.appendChild(createElement(v as VNode, parentNamespace, ctx));
      }
    }
    runDirectiveUnmountOnChildren(placeholder);
    placeholder.replaceChildren(frag);
  });
  // 占位节点被 replaceChild/移除时 dispose effect，避免旧 effect 继续更新已脱离文档的节点
  registerDirectiveUnmount(placeholder as Element, dispose);
}

/**
 * 收集从 startIndex 起的连续 vIf / vElseIf / vElse 节点（用于一组用一个 effect 响应式渲染）
 * 首项必须为带 getter 的 vIf，否则返回空数组
 */
function collectVIfGroup(
  list: ChildItem[],
  startIndex: number,
): VNode[] {
  const first = list[startIndex];
  if (isSignalGetter(first)) return [];
  const v0 = first as VNode;
  const vIfRaw = v0.props["vIf"] ?? v0.props["v-if"];
  const isReactiveVIf = typeof vIfRaw === "function" || isSignalGetter(vIfRaw);
  if (!hasDirective(v0.props, "vIf") || !isReactiveVIf) return [];

  const group: VNode[] = [v0];
  for (let i = startIndex + 1; i < list.length; i++) {
    const it = list[i];
    if (isSignalGetter(it)) break;
    const v = it as VNode;
    if (hasDirective(v.props, "vElseIf") || hasDirective(v.props, "vElse")) {
      group.push(v);
    } else {
      break;
    }
  }
  return group;
}

/**
 * 创建 vIf/vElseIf/vElse 组的占位节点：单一 effect 内按顺序求值，渲染第一个为 true 的分支，保证 getter 被读、effect 能订阅
 */
function createVIfGroupPlaceholder(
  group: VNode[],
  parentNamespace: string | null,
  ifContext: IfContext,
): Element {
  const doc = (globalThis as { document: Document }).document;
  const placeholder = doc.createElement("span");
  placeholder.setAttribute("data-view-v-if-group", "");

  createEffect(() => {
    let showIndex = -1;
    for (let i = 0; i < group.length; i++) {
      const v = group[i];
      const props = v.props;
      if (i === 0) {
        if (getVIfValue(props)) {
          showIndex = i;
          break;
        }
      } else if (hasDirective(props, "vElse")) {
        showIndex = i;
        break;
      } else if (hasDirective(props, "vElseIf")) {
        if (getVElseIfValue(props)) {
          showIndex = i;
          break;
        }
      }
    }
    preserveScrollAroundUpdate(() => {
      runDirectiveUnmountOnChildren(placeholder);
      placeholder.replaceChildren();
      if (showIndex >= 0) {
        const chosen = group[showIndex];
        const stripProps = { ...chosen.props };
        delete stripProps.vIf;
        delete stripProps["v-if"];
        delete stripProps.vElseIf;
        delete stripProps["v-else-if"];
        delete stripProps.vElse;
        delete stripProps["v-else"];
        const next = createElement(
          { ...chosen, props: stripProps },
          parentNamespace,
          ifContext,
        );
        placeholder.appendChild(next);
      }
    });
  });

  return placeholder;
}

/**
 * 向父节点追加子节点；支持 children 为 signal getter 或数组中含 getter 的细粒度更新
 * ifContext 用于 v-else：同一批兄弟共享，记录上一个 v-if 的结果
 */
function appendChildren(
  parent: Element | DocumentFragment,
  rawChildren: unknown,
  parentNamespace: string | null,
  ifContext?: IfContext,
): void {
  if (!isDOMEnvironment()) return;

  const ctx = ifContext ?? { lastVIf: true };
  if (typeof rawChildren === "function" || isSignalGetter(rawChildren)) {
    appendDynamicChild(
      parent,
      rawChildren as () => unknown,
      parentNamespace,
      ctx,
    );
    return;
  }

  const list = normalizeChildren(rawChildren);
  let i = 0;
  while (i < list.length) {
    const item = list[i];
    if (typeof item === "function" || isSignalGetter(item)) {
      appendDynamicChild(parent, item as () => unknown, parentNamespace, ctx);
      i++;
      continue;
    }
    const vnode = item as VNode;
    const vIfRaw = vnode.props["vIf"] ?? vnode.props["v-if"];
    const isDynamicVIf = hasDirective(vnode.props, "vIf") &&
      (typeof vIfRaw === "function" || isSignalGetter(vIfRaw));
    if (isDynamicVIf) {
      const group = collectVIfGroup(list, i);
      if (group.length > 0) {
        parent.appendChild(
          createVIfGroupPlaceholder(group, parentNamespace, ctx),
        );
        i += group.length;
        continue;
      }
    }
    parent.appendChild(createElement(vnode, parentNamespace, ctx));
    i++;
  }
}

/**
 * 将 VNode 转为浏览器 DOM 节点（或 DocumentFragment）。
 * 支持原生标签、组件、Fragment、指令（v-if/v-else/v-for/v-once 等）与动态子节点。
 *
 * 错误处理：组件执行时若抛出错误，被 ErrorBoundary 包裹的会捕获并渲染 fallback；
 * 其余错误会冒泡，调用方需自行 try/catch 或保证组件不抛错。
 *
 * @param vnode - 要渲染的 VNode
 * @param parentNamespace - 父级命名空间（如 SVG_NS），用于正确创建 svg 内子元素
 * @param ifContext - 可选，用于 v-else：同一批兄弟中上一个 v-if 的结果
 * @returns 创建出的 DOM 节点或 DocumentFragment
 */
export function createElement(
  vnode: VNode,
  parentNamespace: string | null = null,
  ifContext?: IfContext,
): Node {
  const doc = (globalThis as { document: Document }).document;

  // ContextScope：在渲染 children 前后 pushContext/popContext，保证子组件 useContext 时栈有效
  if (vnode.type === CONTEXT_SCOPE_TYPE) {
    const scopeProps = vnode.props as {
      id: symbol;
      value: unknown;
      children: VNode | VNode[] | null;
    };
    pushContext(scopeProps.id, scopeProps.value);
    try {
      const ch = scopeProps.children;
      if (ch == null) return doc.createTextNode("");
      const nodes = Array.isArray(ch) ? ch : [ch];
      if (nodes.length === 0) return doc.createTextNode("");
      if (nodes.length === 1) {
        return createElement(nodes[0], parentNamespace, ifContext);
      }
      const frag = doc.createDocumentFragment();
      for (const n of nodes) {
        frag.appendChild(createElement(n, parentNamespace, ifContext));
      }
      return frag;
    } finally {
      popContext(scopeProps.id);
    }
  }

  if (checkFragment(vnode)) {
    const frag = doc.createDocumentFragment();
    const rawChildren = vnode.props.children ?? vnode.children;
    appendChildren(frag, rawChildren, parentNamespace, ifContext);
    return frag;
  }

  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props = vnode.props;
    const binding = getContextBinding(type, props);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result: VNode | VNode[] | null = type(props);
      if (result == null) return doc.createTextNode("");
      const nodes = Array.isArray(result) ? result : [result];
      if (nodes.length === 0) return doc.createTextNode("");
      if (isErrorBoundary(type)) {
        try {
          if (nodes.length === 1) {
            return createElement(nodes[0], parentNamespace, ifContext);
          }
          const frag = doc.createDocumentFragment();
          for (const n of nodes) {
            frag.appendChild(createElement(n, parentNamespace, ifContext));
          }
          return frag;
        } catch (e) {
          return createElement(getErrorBoundaryFallback(props)(e));
        }
      }
      if (nodes.length === 1) {
        return createElement(nodes[0], parentNamespace, ifContext);
      }
      const frag = doc.createDocumentFragment();
      for (const n of nodes) {
        frag.appendChild(createElement(n, parentNamespace, ifContext));
      }
      return frag;
    } finally {
      if (binding) popContext(binding.id);
    }
  }

  const tag = vnode.type as string;
  if (tag === "#text") {
    return doc.createTextNode(
      String((vnode.props as { nodeValue?: unknown }).nodeValue ?? ""),
    );
  }

  const props = vnode.props;
  const structural = hasStructuralDirective(props);

  // v-once：只渲染一次，冻结 props/children 中所有 getter 后递归，不建立 effect
  if (hasDirective(props, "vOnce")) {
    return createElement(
      freezeVNodeForOnce(vnode),
      parentNamespace,
      ifContext,
    );
  }

  // v-else：仅当上一个 v-if 为 false 时渲染
  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) {
      return doc.createTextNode("");
    }
    if (ifContext) ifContext.lastVIf = true;
  }

  // v-else-if：仅当上一个 v-if 为 false 时再判断本分支条件
  if (hasDirective(props, "vElseIf")) {
    if (ifContext && ifContext.lastVIf) {
      return doc.createTextNode("");
    }
    const elseIfShow = getVElseIfValue(props);
    if (!elseIfShow) {
      if (ifContext) ifContext.lastVIf = false;
      return doc.createTextNode("");
    }
    if (ifContext) ifContext.lastVIf = true;
  }

  // v-if：为 false 不渲染；为 getter 或普通无参函数时用 placeholder + effect 做动态显示/隐藏
  if (structural === "vIf") {
    const vIfRaw = props["vIf"] ?? props["v-if"];
    const isReactiveVIf = typeof vIfRaw === "function" ||
      isSignalGetter(vIfRaw);
    if (isReactiveVIf) {
      const placeholder = doc.createElement("span");
      placeholder.setAttribute("data-view-v-if", "");
      createEffect(() => {
        const show = getVIfValue(props);
        preserveScrollAroundUpdate(() => {
          runDirectiveUnmountOnChildren(placeholder);
          placeholder.replaceChildren();
          if (show) {
            const next = createElement(
              {
                ...vnode,
                props: { ...props, vIf: undefined, "v-if": undefined },
              },
              parentNamespace,
              ifContext,
            );
            placeholder.appendChild(next);
          }
        });
        if (ifContext) ifContext.lastVIf = show;
      });
      return placeholder;
    }
    if (!getVIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return doc.createTextNode("");
    }
    if (ifContext) ifContext.lastVIf = true;
  }

  // v-for：按 list 重复渲染；list 为 getter 或普通无参函数时用 placeholder + effect 动态更新
  if (structural === "vFor") {
    const rawChildren = props.children ?? vnode.children;
    const rawList = props["vFor"] ?? props["v-for"];
    const isReactiveVFor = typeof rawList === "function" ||
      isSignalGetter(rawList);
    if (isReactiveVFor) {
      const placeholder = doc.createElement("span");
      placeholder.setAttribute("data-view-v-for", "");
      const templateProps = { ...props, vFor: undefined, "v-for": undefined };
      const vForNs = resolveNamespace(tag, parentNamespace);
      const childNs = vForNs ?? (tag === "svg" ? SVG_NS : null);
      createEffect(() => {
        const resolved = typeof rawList === "function"
          ? (rawList as () => unknown)()
          : (rawList as () => unknown)();
        const list = Array.isArray(resolved) ? (resolved as unknown[]) : [];
        const len = Number.isFinite(Number(list.length))
          ? Math.max(0, Math.floor(Number(list.length)))
          : 0;
        // 支持 children 为工厂函数，或 expand 后的单元素数组 [factory]
        const factory = resolveVForFactory(rawChildren);
        const frag = doc.createDocumentFragment();
        for (let i = 0; i < len; i++) {
          const item = list[i];
          const childResult = factory(item, i);
          const childNodes = Array.isArray(childResult)
            ? childResult
            : [childResult];
          const first = childNodes[0] as VNode | undefined;
          const itemVnode: VNode = {
            type: tag,
            props: {
              ...templateProps,
              children: childNodes.length === 1 ? childNodes[0] : childNodes,
            },
            key: first?.key != null ? first.key : i,
          };
          frag.appendChild(createElement(itemVnode, childNs, ifContext));
        }
        runDirectiveUnmountOnChildren(placeholder);
        placeholder.replaceChildren(frag);
      });
      return placeholder;
    }
    const parsed = getVForListAndFactory(props, rawChildren);
    if (parsed) {
      const { list, factory } = parsed;
      const frag = doc.createDocumentFragment();
      const vForNs = resolveNamespace(tag, parentNamespace);
      const childNs = vForNs ?? (tag === "svg" ? SVG_NS : null);
      const templateProps = { ...props, vFor: undefined, "v-for": undefined };
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const childResult = factory(item, i);
        const childNodes = Array.isArray(childResult)
          ? childResult
          : [childResult];
        const first = childNodes[0] as VNode | undefined;
        const itemVnode: VNode = {
          type: tag,
          props: {
            ...templateProps,
            children: childNodes.length === 1 ? childNodes[0] : childNodes,
          },
          key: first?.key != null ? first.key : i,
        };
        frag.appendChild(createElement(itemVnode, childNs, ifContext));
      }
      return frag;
    }
  }

  const ns = resolveNamespace(tag, parentNamespace);
  const el = ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);
  if (vnode.key != null && vnode.key !== undefined) {
    el.setAttribute("data-key", String(vnode.key));
  }
  applyProps(el as Element, props);
  const rawChildren = props.children ?? vnode.children;
  appendChildren(
    el as Element,
    rawChildren,
    ns ?? (tag === "svg" ? SVG_NS : null),
    ifContext,
  );
  return el;
}

/**
 * 展开后的根：单个 VNode 或 Fragment 的子项数组（ChildItem[]）。
 * 用于 createRoot 的根协调，避免整树替换以保持表单等状态。
 */
export type ExpandedRoot = VNode | ChildItem[];

/**
 * 将 VNode 展开为「可 diff 的树」：仅展开组件与 Fragment，不求值 signal getter。
 * 用于根协调时与上次展开结果做 patch，得到最小 DOM 更新。
 *
 * @param vnode - 根 VNode
 * @returns 单个 VNode 或 ChildItem 数组（Fragment 子项）
 */
export function expandVNode(vnode: VNode): ExpandedRoot {
  if (checkFragment(vnode)) {
    const rawChildren = vnode.props.children ?? vnode.children;
    const list = normalizeChildren(rawChildren);
    const out: ChildItem[] = [];
    for (const item of list) {
      if (isSignalGetter(item) || typeof item === "function") {
        out.push(item as () => unknown);
      } else {
        const expanded = expandVNode(item as VNode);
        if (Array.isArray(expanded)) {
          out.push(...expanded);
        } else {
          out.push(expanded);
        }
      }
    }
    return out;
  }

  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props = vnode.props;
    const binding = getContextBinding(type, props);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result: VNode | VNode[] | null = type(props);
      if (result == null) {
        return createTextVNode("");
      }
      const nodes = Array.isArray(result) ? result : [result];
      if (nodes.length === 0) {
        return createTextVNode("");
      }
      if (isErrorBoundary(type)) {
        try {
          if (nodes.length === 1) return expandVNode(nodes[0] as VNode);
          const out: ChildItem[] = [];
          for (const n of nodes) {
            const e = expandVNode(n as VNode);
            if (Array.isArray(e)) out.push(...e);
            else out.push(e);
          }
          return out;
        } catch (e) {
          const fallbackVNode = getErrorBoundaryFallback(props)(e);
          return fallbackVNode && typeof fallbackVNode === "object" &&
              "type" in fallbackVNode
            ? expandVNode(fallbackVNode as VNode)
            : createTextVNode("");
        }
      }
      if (nodes.length === 1) return expandVNode(nodes[0] as VNode);
      const out: ChildItem[] = [];
      for (const n of nodes) {
        const e = expandVNode(n as VNode);
        if (Array.isArray(e)) out.push(...e);
        else out.push(e);
      }
      return out;
    } finally {
      if (binding) popContext(binding.id);
    }
  }

  if (vnode.type === "#text") return vnode;

  const props = vnode.props;
  const rawChildren = props.children ?? vnode.children;
  const list = normalizeChildren(rawChildren);
  const newChildren: ChildItem[] = [];
  for (const item of list) {
    if (isSignalGetter(item) || typeof item === "function") {
      newChildren.push(item as () => unknown);
    } else {
      const e = expandVNode(item as VNode);
      if (Array.isArray(e)) newChildren.push(...e);
      else newChildren.push(e);
    }
  }
  return {
    type: vnode.type,
    props: { ...props, children: newChildren },
    key: vnode.key,
    children: [],
  };
}

/**
 * 根据展开根创建 DOM：单节点调用 createElement，片段则用 appendChildren 填充 DocumentFragment。
 * 供 createRoot 首次挂载时使用。
 *
 * @param expanded - expandVNode 的返回值（单 VNode 或 ChildItem[]）
 * @returns 创建出的 DOM 节点或 DocumentFragment
 */
export function createNodeFromExpanded(expanded: ExpandedRoot): Node {
  const doc = (globalThis as { document: Document }).document;
  if (Array.isArray(expanded)) {
    const frag = doc.createDocumentFragment();
    appendChildren(frag, expanded, null);
    return frag;
  }
  return createElement(expanded);
}

/**
 * 协调两棵子项列表到父节点上：按索引对齐，同类型同 key 则 patch，否则替换
 */
function reconcileChildren(
  parent: Element | DocumentFragment,
  oldItems: ChildItem[],
  newItems: ChildItem[],
  parentNamespace: string | null,
  ifContext: IfContext,
): void {
  const doc = (globalThis as { document: Document }).document;
  for (let i = parent.childNodes.length - 1; i >= newItems.length; i--) {
    const node = parent.childNodes[i];
    runDirectiveUnmount(node);
    parent.removeChild(node);
  }
  const maxLen = Math.max(oldItems.length, newItems.length);
  for (let i = 0; i < maxLen; i++) {
    const newItem = newItems[i];
    const oldItem = oldItems[i];
    const existing = parent.childNodes[i] as Node | undefined;

    if (i >= newItems.length) continue;

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
      if (i < parent.childNodes.length) {
        parent.insertBefore(node, parent.childNodes[i]);
      } else {
        parent.appendChild(node);
      }
      continue;
    }

    const newIsGetter = isSignalGetter(newItem) ||
      typeof newItem === "function";
    const oldIsGetter = isSignalGetter(oldItem) ||
      typeof oldItem === "function";
    if (newIsGetter || oldIsGetter) {
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
      continue;
    }

    patchNode(
      existing,
      oldItem as VNode,
      newItem as VNode,
      parentNamespace,
      ifContext,
    );
  }
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

  if (typeof newV.type === "string" && newV.type !== "#text") {
    // 只有 Element / DocumentFragment 才支持 appendChild；若 dom 实为 Text 等节点（与 VNode 不同步），走替换避免 HierarchyRequestError
    const nodeType = dom.nodeType;
    const isElementOrFragment = nodeType === 1 || nodeType === 11; // ELEMENT_NODE | DOCUMENT_FRAGMENT_NODE
    if (!isElementOrFragment) {
      const parent = dom.parentNode;
      if (!parent) return;
      const next = createElement(newV, parentNamespace, ifContext);
      parent.replaceChild(next, dom);
      runDirectiveUnmount(dom);
      return;
    }
    const el = dom as Element;
    applyProps(el, newV.props);
    // vFor/vIf 占位符的子节点由各自 effect 管理，patch 时不得用 VNode.children 协调，否则会清空 vFor 列表等
    if (
      el.hasAttribute?.("data-view-v-for") ||
      el.hasAttribute?.("data-view-v-if") ||
      el.hasAttribute?.("data-view-v-if-group")
    ) {
      return;
    }
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
  }
}

const defaultIfContext: IfContext = { lastVIf: true };

/**
 * 根协调：用新展开树对已有 DOM 做增量 patch，不整树替换，保证表单等不重挂、不丢焦点。
 *
 * @param container - 根容器元素
 * @param mounted - 当前已挂载的根节点（可能是单个节点或 DocumentFragment）
 * @param lastExpanded - 上次 expandVNode 的结果
 * @param newExpanded - 本次 expandVNode 的结果
 */
export function patchRoot(
  container: Element,
  mounted: Node,
  lastExpanded: ExpandedRoot,
  newExpanded: ExpandedRoot,
): void {
  if (Array.isArray(lastExpanded) && Array.isArray(newExpanded)) {
    const oldItems = lastExpanded;
    const newItems = newExpanded;
    const frag = mounted as DocumentFragment;
    for (let i = frag.childNodes.length - 1; i >= newItems.length; i--) {
      const node = frag.childNodes[i];
      runDirectiveUnmount(node);
      frag.removeChild(node);
    }
    const maxLen = Math.max(oldItems.length, newItems.length);
    for (let i = 0; i < maxLen; i++) {
      const existing = frag.childNodes[i] as Node | undefined;
      const newItem = newItems[i];
      const oldItem = oldItems[i];
      if (i >= newItems.length) continue;
      const doc = (globalThis as { document: Document }).document;
      if (i >= oldItems.length || !existing) {
        const node = isSignalGetter(newItem) || typeof newItem === "function"
          ? (() => {
            const span = createDynamicSpan(doc);
            appendDynamicChild(
              span,
              newItem as () => unknown,
              null,
              defaultIfContext,
            );
            return span;
          })()
          : createElement(newItem as VNode);
        if (i < frag.childNodes.length) {
          frag.insertBefore(node, frag.childNodes[i]);
        } else {
          frag.appendChild(node);
        }
        continue;
      }
      const newIsGetter = isSignalGetter(newItem) ||
        typeof newItem === "function";
      const oldIsGetter = isSignalGetter(oldItem) ||
        typeof oldItem === "function";
      if (newIsGetter || oldIsGetter) {
        runDirectiveUnmount(existing);
        frag.replaceChild(
          newIsGetter
            ? (() => {
              const span = createDynamicSpan(doc);
              appendDynamicChild(
                span,
                newItem as () => unknown,
                null,
                defaultIfContext,
              );
              return span;
            })()
            : createElement(newItem as VNode),
          existing,
        );
      } else {
        patchNode(
          existing,
          oldItem as VNode,
          newItem as VNode,
          null,
          defaultIfContext,
        );
      }
    }
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
    : createElement(newExpanded);
  container.replaceChild(next, mounted);
}
