/**
 * @module @dreamer/view/dom/stringify
 * @description
 * View 模板引擎 — SSR：将 VNode 转为 HTML 字符串或流。createElementToString、createElementToStream、stringifyAttributes、escapeText/escapeAttr、normalizeChildrenForSSR。
 *
 * **本模块导出：**
 * - `createElementToString(vnode, options?)`：将 VNode 转为 HTML 字符串
 * - `createElementToStream(vnode, options?)`：将 VNode 转为 HTML 流（生成器）
 */

import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import { getErrorBoundaryFallback, isErrorBoundary } from "../boundary.ts";
import {
  getVElseIfValue,
  getVElseShow,
  getVForListAndFactory,
  getVIfValue,
  getVShowValue,
  hasDirective,
  hasStructuralDirective,
  isDirectiveProp,
} from "../directive.ts";
import { getContextBinding, popContext, pushContext } from "../context.ts";
import type { IfContext, SSROptions } from "./shared.ts";
import { createTextVNode, isFragment, isVNodeLike } from "./shared.ts";

/** 自闭合标签，不生成闭合标签 */
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** SSR 专用：将 children 规范化为 VNode 数组，getter 会调用一次取当前值；单次遍历收集减少 flatMap 中间数组 */
function normalizeChildrenForSSR(children: unknown): VNode[] {
  if (children == null) return [];
  if (isSignalGetter(children)) {
    return normalizeChildrenForSSR((children as () => unknown)());
  }
  if (Array.isArray(children)) {
    const out: VNode[] = [];
    for (const c of children) {
      const items = normalizeChildrenForSSR(c);
      for (const v of items) out.push(v);
    }
    return out;
  }
  if (isVNodeLike(children)) return [children as VNode];
  return [createTextVNode(children)];
}

/**
 * SSR：将 props 中需要输出的属性转为 HTML 属性字符串（不含 children/key）
 * 若后续需优化，可对静态 props 做缓存拼接结果（需识别“静态”），或仅在确有动态 props 时再优化
 */
function stringifyAttributes(props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" || key === "key" || key === "ref" ||
      key === "dangerouslySetInnerHTML"
    ) continue;
    // v-cloak：输出为 data-view-cloak 供 CSS 隐藏，hydrate 后由 runtime 移除
    if (key === "vCloak" || key === "v-cloak") {
      parts.push('data-view-cloak=""');
      continue;
    }
    if (isDirectiveProp(key)) continue;
    const v = isSignalGetter(value) ? (value as () => unknown)() : value;
    if (typeof v === "function") continue;
    if (v == null || v === false) continue;
    if (v === true) {
      parts.push(escapeAttr(key));
      continue;
    }
    let str: string;
    if (key === "style" && typeof v === "object" && v !== null) {
      str = Object.entries(v as Record<string, unknown>)
        .map(([k, val]) =>
          `${k.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")}: ${
            val == null ? "" : String(val)
          }`
        )
        .join("; ");
    } else {
      str = String(v);
    }
    if (key === "className") {
      parts.push(`class="${escapeAttr(str)}"`);
    } else if (key === "htmlFor") {
      parts.push(`for="${escapeAttr(str)}"`);
    } else {
      parts.push(`${escapeAttr(key)}="${escapeAttr(str)}"`);
    }
  }
  return parts.length ? " " + parts.join(" ") : "";
}

/**
 * 将 VNode 转为 HTML 字符串（SSR，无浏览器 API）。
 * SSR 时 getter 只求值一次；vIf/vElse/vFor 与 createElement 逻辑一致。
 * options.allowRawHtml 为 false 时 v-html 输出转义文本（安全场景）；默认与客户端一致不转义。
 *
 * @param vnode - 要序列化的根 VNode
 * @param ifContext - 可选，v-else / v-else-if 的上下文
 * @param options - 可选，SSR 选项（如 allowRawHtml）
 * @returns 对应的 HTML 字符串
 */
export function createElementToString(
  vnode: VNode,
  ifContext?: IfContext,
  options?: SSROptions,
): string {
  if (isFragment(vnode)) {
    const ctx = ifContext ?? { lastVIf: true };
    const children = normalizeChildrenForSSR(
      vnode.props.children ?? vnode.children,
    );
    return children.map((c) => createElementToString(c, ctx, options)).join("");
  }

  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props = vnode.props;
    const binding = getContextBinding(type, props);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result: VNode | VNode[] | null = type(props);
      if (result == null) return "";
      const nodes = Array.isArray(result) ? result : [result];
      if (isErrorBoundary(type)) {
        try {
          return nodes.map((n) => createElementToString(n, ifContext, options))
            .join("");
        } catch (e) {
          return createElementToString(
            getErrorBoundaryFallback(props)(e),
            ifContext,
            options,
          );
        }
      }
      return nodes.map((n) => createElementToString(n, ifContext, options))
        .join("");
    } finally {
      if (binding) popContext(binding.id);
    }
  }

  const tag = vnode.type as string;
  if (tag === "#text") {
    return escapeText(
      String((vnode.props as { nodeValue?: unknown }).nodeValue ?? ""),
    );
  }

  const props = vnode.props;
  const structural = hasStructuralDirective(props);

  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return "";
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext && ifContext.lastVIf) return "";
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return "";
    }
    if (ifContext) ifContext.lastVIf = true;
  }

  if (structural === "vIf") {
    if (!getVIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return "";
    }
    if (ifContext) ifContext.lastVIf = true;
  }

  if (structural === "vFor") {
    const rawChildren = props.children ?? vnode.children;
    const parsed = getVForListAndFactory(props, rawChildren);
    if (parsed) {
      const { list, factory } = parsed;
      const templateProps = { ...props, vFor: undefined, "v-for": undefined };
      return list
        .map((item, i) => {
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
          return createElementToString(itemVnode, ifContext, options);
        })
        .join("");
    }
  }

  let attrs = stringifyAttributes(props);
  if (hasDirective(props, "vShow")) {
    if (!getVShowValue(props)) {
      attrs += ' style="display:none"';
    }
  }
  if (vnode.key != null && vnode.key !== undefined) {
    attrs += ` data-key="${escapeAttr(String(vnode.key))}"`;
  }
  const ctx = ifContext ?? { lastVIf: true };
  const children = normalizeChildrenForSSR(props.children ?? vnode.children);
  let inner: string;
  {
    const hasKeyedChildren = children.some(
      (c) => (c as VNode).key != null && (c as VNode).key !== undefined,
    );
    inner = hasKeyedChildren
      ? children
        .map((c, i) => {
          const v = c as VNode;
          const key = v.key != null && v.key !== undefined
            ? String(v.key)
            : `@${i}`;
          return `<span data-view-keyed data-key="${escapeAttr(key)}">${
            createElementToString(c, ctx, options)
          }</span>`;
        })
        .join("")
      : children.map((c) => createElementToString(c, ctx, options)).join("");
  }
  if (voidElements.has(tag.toLowerCase())) {
    return `<${tag}${attrs}>`;
  }
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/**
 * 流式 SSR：将 VNode 转为逐块输出的字符串生成器，与 createElementToString 结构一致。
 * options.allowRawHtml 为 false 时 dangerouslySetInnerHTML 输出转义文本；默认与客户端一致不转义。
 *
 * @param vnode - 要序列化的根 VNode
 * @param ifContext - 可选，v-else / v-else-if 的上下文
 * @param options - 可选，SSR 选项（如 allowRawHtml）
 * @yields 逐块 HTML 字符串
 */
export function* createElementToStream(
  vnode: VNode,
  ifContext?: IfContext,
  options?: SSROptions,
): Generator<string> {
  if (isFragment(vnode)) {
    const ctx = ifContext ?? { lastVIf: true };
    const children = normalizeChildrenForSSR(
      vnode.props.children ?? vnode.children,
    );
    for (const c of children) {
      yield* createElementToStream(c, ctx, options);
    }
    return;
  }

  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props = vnode.props;
    const binding = getContextBinding(type, props);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result: VNode | VNode[] | null = type(props);
      if (result == null) return;
      const nodes = Array.isArray(result) ? result : [result];
      if (isErrorBoundary(type)) {
        try {
          for (const n of nodes) {
            yield* createElementToStream(n, ifContext, options);
          }
        } catch (e) {
          yield* createElementToStream(
            getErrorBoundaryFallback(props)(e),
            ifContext,
            options,
          );
        }
      } else {
        for (const n of nodes) {
          yield* createElementToStream(n, ifContext, options);
        }
      }
    } finally {
      if (binding) popContext(binding.id);
    }
    return;
  }

  const tag = vnode.type as string;
  if (tag === "#text") {
    yield escapeText(
      String((vnode.props as { nodeValue?: unknown }).nodeValue ?? ""),
    );
    return;
  }

  const props = vnode.props;
  const structural = hasStructuralDirective(props);

  if (hasDirective(props, "vElse")) {
    if (ifContext && !getVElseShow(ifContext.lastVIf)) return;
    if (ifContext) ifContext.lastVIf = true;
  }
  if (hasDirective(props, "vElseIf")) {
    if (ifContext && ifContext.lastVIf) return;
    if (!getVElseIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return;
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vIf") {
    if (!getVIfValue(props)) {
      if (ifContext) ifContext.lastVIf = false;
      return;
    }
    if (ifContext) ifContext.lastVIf = true;
  }
  if (structural === "vFor") {
    const rawChildren = props.children ?? vnode.children;
    const parsed = getVForListAndFactory(props, rawChildren);
    if (parsed) {
      const { list, factory } = parsed;
      const templateProps = { ...props, vFor: undefined, "v-for": undefined };
      for (let i = 0; i < list.length; i++) {
        const childResult = factory(list[i], i);
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
        yield* createElementToStream(itemVnode, ifContext, options);
      }
    }
    return;
  }

  let attrs = stringifyAttributes(props);
  if (hasDirective(props, "vShow")) {
    if (!getVShowValue(props)) attrs += ' style="display:none"';
  }
  if (vnode.key != null && vnode.key !== undefined) {
    attrs += ` data-key="${escapeAttr(String(vnode.key))}"`;
  }
  const ctx = ifContext ?? { lastVIf: true };
  yield `<${tag}${attrs}>`;
  if (!voidElements.has(tag.toLowerCase())) {
    const children = normalizeChildrenForSSR(
      props.children ?? vnode.children,
    );
    const hasKeyedChildren = children.some(
      (c) => (c as VNode).key != null && (c as VNode).key !== undefined,
    );
    if (hasKeyedChildren) {
      for (let i = 0; i < children.length; i++) {
        const v = children[i] as VNode;
        const key = v.key != null && v.key !== undefined
          ? String(v.key)
          : `@${i}`;
        yield `<span data-view-keyed data-key="${escapeAttr(key)}">`;
        yield* createElementToStream(children[i], ctx, options);
        yield `</span>`;
      }
    } else {
      for (const c of children) yield* createElementToStream(c, ctx, options);
    }
    yield `</${tag}>`;
  }
}
