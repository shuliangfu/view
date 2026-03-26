/**
 * 本征 VNode 与已挂载 DOM 的 **结构一致性判定** 与 **就地更新**（步骤 1：独立于 `insertReactive`）。
 *
 * 仅处理 **纯本征子树**：无组件函数 type、无 Fragment 子项、无 `insertReactive` 管理的动态子（getter / signal）。
 * 含响应式 v-if、对象 style、`dangerouslySetInnerHTML` 等时 {@link canPatchIntrinsic} 返回 false；**`on*` 事件（多参 handler）可在 patch 路径下由 {@link patchMountedIntrinsicElementProps} 安全换绑。
 * **步骤 5**：`input`/`textarea`/`select` 等上的受控 **`value` / `checked` / `selected`**、常见布尔 **`disabled` / `readOnly`**、字符串 **`placeholder` / `maxLength` / `pattern` / `name` 等**（无参 getter、SignalRef）允许 patch，由 {@link patchMountedIntrinsicElementProps} 内 `bindIntrinsicReactiveDomProps` 维护；字符串白名单见 `tc-reactive.ts`。
 *
 * @module @dreamer/view/compiler/vnode-reconcile
 */

import type { ChildItem } from "../dom/element.ts";
import { normalizeChildren } from "../dom/element.ts";
import { isFragment, isVNodeLike, safeTextForDom } from "../dom/shared.ts";
import { isDirectiveProp } from "../directive.ts";
import { isSignalGetter, isSignalRef } from "../signal.ts";
import type { VNode } from "../types.ts";
import { isReactiveStringPropKeyForTextControl } from "./tc-reactive.ts";
import { eventBindingFromOnProp } from "./spread-intrinsic.ts";
import { patchMountedIntrinsicElementProps } from "./vnode-mount.ts";

const ELEMENT = 1;
const TEXT = 3;

/**
 * 判断 props 上的值是否应按「响应式」处理（本模块在 canPatch 时一律拒绝 patch）。
 */
function isReactiveLikeValue(val: unknown): boolean {
  if (val == null) return false;
  if (isSignalRef(val) || isSignalGetter(val)) return true;
  if (typeof val === "function") {
    const f = val as (...args: unknown[]) => unknown;
    return f.length === 0;
  }
  return false;
}

/**
 * 静态 v-if / v-if：无函数、无 signal 时的求值（与挂载前「是否创建节点」一致）。
 */
function evaluateStaticVIf(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw !== "";
  return Boolean(raw);
}

/**
 * 受控表单项上常见的响应式 prop：patch 时由 `bindIntrinsicReactiveDomProps` 的 effect 更新，不视为结构不兼容。
 *
 * @param tagLower - 本征标签名小写
 * @param propKey - props 键
 * @param val - 属性值
 */
function allowIntrinsicReactiveFormProp(
  tagLower: string,
  propKey: string,
  val: unknown,
): boolean {
  if (!isReactiveLikeValue(val)) return false;
  if (propKey === "value") {
    return (
      tagLower === "input" ||
      tagLower === "textarea" ||
      tagLower === "select" ||
      tagLower === "button"
    );
  }
  if (propKey === "checked") {
    return tagLower === "input";
  }
  if (propKey === "selected") {
    return tagLower === "option";
  }
  /**
   * `bindIntrinsicReactiveDomProps` 对 `BOOLEAN_REACTIVE_PROP_NAMES` 含 `disabled` 等走 effect；
   * 若此处不放行，含「可编辑 + 动态禁用」的节点会误判不可 patch，整段 detach 导致失焦（主路径回归点）。
   */
  if (propKey === "disabled") {
    return (
      tagLower === "input" ||
      tagLower === "textarea" ||
      tagLower === "select" ||
      tagLower === "button" ||
      tagLower === "option"
    );
  }
  if (propKey === "readOnly" || propKey === "readonly") {
    return tagLower === "input" || tagLower === "textarea";
  }
  if (propKey === "multiple") {
    return tagLower === "select";
  }
  /**
   * 与 `vnode-mount.ts` 中 `BOOLEAN_REACTIVE_PROP_NAMES` 一致：无参 getter / SignalRef 由
   * `bindIntrinsicReactiveDomProps` 末尾 effect 写 DOM；若不放行则含「动态 spellcheck / hidden」的输入区会误判不可 patch。
   */
  if (
    propKey === "spellCheck" ||
    propKey === "spellcheck" ||
    propKey === "autofocus" ||
    propKey === "hidden" ||
    propKey === "draggable" ||
    propKey === "contentEditable" ||
    propKey === "contenteditable"
  ) {
    return true;
  }
  /**
   * `placeholder` 由 `bindIntrinsicReactiveDomProps` 专项 effect 同步（与 `value` 分列，避免走布尔分支）。
   */
  if (propKey === "placeholder") {
    return tagLower === "input" || tagLower === "textarea";
  }
  if (isReactiveStringPropKeyForTextControl(propKey)) {
    return tagLower === "input" || tagLower === "textarea";
  }
  /**
   * `bindIntrinsicReactiveDomProps` 对响应式 `className` / `class` 写 `class` attribute；
   * 不放行则父级仅因动态 class 就整段不可 patch（常见列表行高亮）。
   */
  if (propKey === "className" || propKey === "class") {
    return true;
  }
  /**
   * 响应式 `style`（函数 / SignalRef）：与静态 style 对象不同，由 effect 覆盖写行内样式。
   */
  if (propKey === "style") {
    return true;
  }
  return false;
}

/**
 * 本征节点 props 是否允许参与 canPatch（含步骤 5 受控 value/checked 例外）。
 *
 * @param tagLower - 标签名小写
 * @param props - VNode.props
 */
function intrinsicVnodePropsAllowPatch(
  tagLower: string,
  props: Record<string, unknown>,
): boolean {
  if (hasStructuralDirectiveBlockingPatch(props)) return false;

  if (
    "dangerouslySetInnerHTML" in props ||
    props["dangerouslySetInnerHTML"] != null
  ) {
    return false;
  }
  /**
   * 静态对象 style 仍不可 patch（键集合无法在 VNode 上等价比较）；**响应式** style（无参 getter /
   * SignalRef）由 `bindIntrinsicReactiveDomProps` 用 effect 写 DOM，须放行以免误判整段 detach。
   */
  const rawStyle = props.style;
  if (rawStyle != null && typeof rawStyle === "object") {
    const styleValueIsDomNode = typeof globalThis.Node === "function" &&
      rawStyle instanceof globalThis.Node;
    if (!styleValueIsDomNode) {
      if (Array.isArray(rawStyle)) return false;
      if (!isReactiveLikeValue(rawStyle)) return false;
    }
  }

  for (const key of Object.keys(props)) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (isDirectiveProp(key)) continue;
    const val = props[key];
    if (val == null) continue;
    if (isReactiveLikeValue(val)) {
      if (allowIntrinsicReactiveFormProp(tagLower, key, val)) continue;
      return false;
    }
    if (typeof val === "function" && eventBindingFromOnProp(key) !== null) {
      continue;
    }
    if (typeof val === "function") return false;
  }
  return true;
}

/**
 * 若本征 VNode 带 v-if 链相关 prop，且存在任一无法静态求值的条件，则不可 patch。
 */
function hasStructuralDirectiveBlockingPatch(
  props: Record<string, unknown>,
): boolean {
  /** v-else-if / v-else 依赖兄弟链，MVP 不参与 patch */
  if (
    "vElseIf" in props || "v-else-if" in props || "vElse" in props ||
    "v-else" in props
  ) {
    return true;
  }
  const keys = [
    "vIf",
    "v-if",
    "vOnce",
    "v-once",
  ] as const;
  for (const k of keys) {
    if (k in props && isReactiveLikeValue(props[k])) return true;
  }
  const vif = props["vIf"] ?? props["v-if"];
  if ("vIf" in props || "v-if" in props) {
    if (typeof vif === "function") return true;
    if (!evaluateStaticVIf(vif)) return true;
  }
  return false;
}

/**
 * 收集父节点下参与结构对齐的子节点（元素与文本；忽略注释等）。
 */
function structuralDomChildren(parent: Node): Node[] {
  const out: Node[] = [];
  for (let c = parent.firstChild; c != null; c = c.nextSibling) {
    const t = c.nodeType;
    if (t === ELEMENT || t === TEXT) out.push(c);
  }
  return out;
}

/**
 * 子项是否由 `insertReactive` / 动态表达式管理（不可与本模块 DFS 对齐）。
 */
function isDynamicChildItem(item: ChildItem): boolean {
  if (typeof item === "function") return true;
  if (isSignalGetter(item)) return true;
  return false;
}

/**
 * 深度比较：当前 DOM 子树与 VNode 子树是否 **结构兼容**（标签序列与文本槽一致）。
 *
 * @param node - 已挂载的 DOM 节点
 * @param vnode - 新一轮 VNode
 * @returns 可安全 {@link patchIntrinsicSubtree} 时为 true
 */
export function canPatchIntrinsic(node: Node, vnode: unknown): boolean {
  if (node.nodeType !== ELEMENT) return false;
  if (!isVNodeLike(vnode)) return false;
  const v = vnode as VNode;
  if (typeof v.type !== "string" || v.type === "#text") return false;
  if (isFragment(v)) return false;

  const el = node as Element;
  const tag = v.type.toLowerCase();
  if (el.tagName.toLowerCase() !== tag) return false;

  const props = (v.props ?? {}) as Record<string, unknown>;
  if (!intrinsicVnodePropsAllowPatch(tag, props)) return false;

  const rawChildren = props.children ?? (v as { children?: unknown }).children;
  const items = normalizeChildren(rawChildren);
  for (const item of items) {
    if (isDynamicChildItem(item)) return false;
    if (!isVNodeLike(item)) return false;
    const cv = item as VNode;
    if (isFragment(cv)) return false;
    if (typeof cv.type === "function") return false;
  }

  const domKids = structuralDomChildren(el);
  if (items.length !== domKids.length) return false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const domn = domKids[i]!;
    if (!isVNodeLike(item)) return false;
    const cv = item as VNode;
    if (cv.type === "#text") {
      if (domn.nodeType !== TEXT) return false;
      continue;
    }
    if (typeof cv.type !== "string") return false;
    if (domn.nodeType !== ELEMENT) return false;
    const cel = domn as Element;
    const childTag = (cv.type as string).toLowerCase();
    if (cel.tagName.toLowerCase() !== childTag) {
      return false;
    }
    const cp = (cv.props ?? {}) as Record<string, unknown>;
    if (!intrinsicVnodePropsAllowPatch(childTag, cp)) return false;
    const cc = cp.children ?? (cv as { children?: unknown }).children;
    const citems = normalizeChildren(cc);
    for (const ci of citems) {
      if (isDynamicChildItem(ci)) return false;
      if (!isVNodeLike(ci)) return false;
      const z = ci as VNode;
      if (isFragment(z)) return false;
      if (typeof z.type === "function") return false;
    }
    if (!canPatchIntrinsic(cel, cv)) return false;
  }

  return true;
}

/**
 * 就地更新已挂载的本征子树：先递归子节点（保证 `select` 等先更新子级再绑受控 value），再 {@link patchMountedIntrinsicElementProps}。
 * 调用前须已 {@link canPatchIntrinsic} 为 true。
 *
 * @param rootEl - 与 vnode 根对应的 DOM 元素
 * @param vnode - 新的本征 VNode 描述
 */
export function patchIntrinsicSubtree(rootEl: Element, vnode: VNode): void {
  if (!canPatchIntrinsic(rootEl, vnode)) {
    throw new Error(
      "[view/vnode-reconcile] patchIntrinsicSubtree: 结构不兼容，请先 canPatchIntrinsic",
    );
  }
  const props = (vnode.props ?? {}) as Record<string, unknown>;
  const rawChildren = props.children ??
    (vnode as { children?: unknown }).children;
  const items = normalizeChildren(rawChildren);
  const domKids = structuralDomChildren(rootEl);

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const domn = domKids[i]!;
    const cv = item as VNode;
    if (cv.type === "#text") {
      const raw = (cv.props as { nodeValue?: unknown })?.nodeValue;
      (domn as Text).data = safeTextForDom(raw ?? "");
      continue;
    }
    patchIntrinsicSubtree(domn as Element, cv);
  }

  patchMountedIntrinsicElementProps(rootEl, props);
}
