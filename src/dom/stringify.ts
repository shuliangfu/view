/**
 * @module @dreamer/view/dom/stringify
 * @description
 * View 模板引擎 — SSR：将 VNode 转为 HTML 字符串或流。统一遍历 walkVNodeForSSR，createElementToString 与 createElementToStream 复用。
 *
 * **本模块导出：**
 * - `createElementToString(vnode, options?)`：将 VNode 转为 HTML 字符串
 * - `createElementToStream(vnode, options?)`：将 VNode 转为 HTML 流（生成器）
 */

import { escapeForAttr, escapeForText } from "../escape.ts";
import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import { getErrorBoundaryFallback, isErrorBoundary } from "../boundary.ts";
import { normalizeChildren } from "./element.ts";
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
import {
  createTextVNode,
  isEmptyChild,
  isFragment,
  isVNodeLike,
} from "./shared.ts";

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

/** SSR 专用：将 children 规范化为 VNode 数组，getter 会调用一次取当前值；单次遍历收集减少 flatMap 中间数组 */
function normalizeChildrenForSSR(children: unknown): VNode[] {
  if (isEmptyChild(children)) return [];
  if (isSignalGetter(children)) {
    return normalizeChildrenForSSR((children as () => unknown)());
  }
  if (typeof children === "function") {
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

/** 静态 props 属性串缓存：仅当 props 中无 signal getter 时使用，避免重复拼接。最大条目数，超出时淘汰一半 */
const STATIC_ATTR_CACHE_MAX = 200;
const staticAttrCache = new Map<string, string>();

/**
 * 将已排序的 [key, stringValue][] 转为确定性缓存键（k1\0v1\0k2\0v2），
 * 替代 JSON.stringify(entries)，避免嵌套转义与更大串分配。
 */
function fingerprintKeyFromEntries(entries: [string, string][]): string {
  if (entries.length === 0) return "";
  let s = entries[0][0] + "\0" + entries[0][1];
  for (let i = 1; i < entries.length; i++) {
    s += "\0" + entries[i][0] + "\0" + entries[i][1];
  }
  return s;
}

/**
 * 若 props 为纯静态（无 getter、无指令输出），返回用于缓存的指纹；否则返回 null 表示不缓存。
 * 使用 for-in 与确定性键（替代 JSON.stringify）减少分配。
 */
function getStaticPropsFingerprint(
  props: Record<string, unknown>,
): string | null {
  const entries: [string, string][] = [];
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    const value = props[key];
    if (
      key === "children" || key === "key" || key === "ref" ||
      key === "dangerouslySetInnerHTML"
    ) continue;
    if (key === "vCloak" || key === "v-cloak") {
      entries.push([key, ""]);
      continue;
    }
    if (isDirectiveProp(key)) continue;
    if (isSignalGetter(value)) return null;
    if (typeof value === "function") continue;
    if (value == null || value === false) continue;
    if (value === true) {
      entries.push([key, "true"]);
      continue;
    }
    let str: string;
    if (key === "style" && typeof value === "object" && value !== null) {
      const styleObj = value as Record<string, unknown>;
      let styleStr = "";
      for (const k in styleObj) {
        if (!Object.prototype.hasOwnProperty.call(styleObj, k)) continue;
        const val = styleObj[k];
        const part = `${
          k.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")
        }: ${val == null ? "" : String(val)}`;
        styleStr = styleStr ? styleStr + "; " + part : part;
      }
      str = styleStr;
    } else {
      str = String(value);
    }
    entries.push([key, str]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return fingerprintKeyFromEntries(entries);
}

/**
 * SSR：将 props 中需要输出的属性转为 HTML 属性字符串（不含 children/key）。
 * 纯静态 props（无 signal getter）时使用缓存，减少重复字符串拼接。
 */
function stringifyAttributes(props: Record<string, unknown>): string {
  const fp = getStaticPropsFingerprint(props);
  if (fp !== null) {
    const cached = staticAttrCache.get(fp);
    if (cached !== undefined) return cached;
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" || key === "key" || key === "ref" ||
      key === "dangerouslySetInnerHTML"
    ) continue;
    if (key === "vCloak" || key === "v-cloak") {
      parts.push('data-view-cloak=""');
      continue;
    }
    if (isDirectiveProp(key)) continue;
    const v = isSignalGetter(value) ? (value as () => unknown)() : value;
    if (typeof v === "function") continue;
    if (v == null || v === false) continue;
    if (v === true) {
      parts.push(escapeForAttr(key));
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
      parts.push(`class="${escapeForAttr(str)}"`);
    } else if (key === "htmlFor") {
      parts.push(`for="${escapeForAttr(str)}"`);
    } else {
      parts.push(`${escapeForAttr(key)}="${escapeForAttr(str)}"`);
    }
  }
  const result = parts.length ? " " + parts.join(" ") : "";
  if (fp !== null) {
    if (staticAttrCache.size >= STATIC_ATTR_CACHE_MAX) {
      const keysToDelete = [...staticAttrCache.keys()].slice(
        0,
        Math.floor(STATIC_ATTR_CACHE_MAX / 2),
      );
      for (const k of keysToDelete) staticAttrCache.delete(k);
    }
    staticAttrCache.set(fp, result);
  }
  return result;
}

/**
 * 元素子节点 SSR 遍历：与客户端 1:1 对应，动态子节点（getter/function）包一层 div，keyed 包 span。
 * 供 walkVNodeForSSR 在元素标签内 yield* 使用。
 */
function* walkElementChildrenStream(
  rawChildren: unknown,
  ctx: IfContext,
  options: SSROptions | undefined,
): Generator<string> {
  const items = normalizeChildren(rawChildren);
  for (const item of items) {
    if (typeof item === "function" || isSignalGetter(item)) {
      const resolved = normalizeChildrenForSSR((item as () => unknown)());
      yield "<div data-view-dynamic>";
      for (const c of resolved) {
        yield* walkVNodeForSSR(c, ctx, options);
      }
      yield "</div>";
    } else {
      const v = item as VNode;
      if (v.key != null && v.key !== undefined) {
        const key = String(v.key);
        yield `<span data-view-keyed data-key="${escapeForAttr(key)}">`;
        yield* walkVNodeForSSR(v, ctx, options);
        yield "</span>";
      } else {
        yield* walkVNodeForSSR(v, ctx, options);
      }
    }
  }
}

/**
 * 统一 SSR 遍历：按 VNode 树 yield 逐块 HTML，string 与 stream 入口复用此逻辑。
 * Fragment → 组件 → #text → 标签（v-if/v-else/v-for/v-show）→ 属性与子节点。
 */
function* walkVNodeForSSR(
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
      yield* walkVNodeForSSR(c, ctx, options);
    }
    return;
  }

  if (typeof vnode.type === "function") {
    const type = vnode.type;
    const props = vnode.props;
    const binding = getContextBinding(type, props);
    if (binding) pushContext(binding.id, binding.value);
    try {
      const result: VNode | VNode[] | (() => VNode | VNode[] | null) | null =
        type(props);
      if (result == null) return;
      // 组件可能返回 getter 函数（如 return () => <div>...</div>），SSR 时调用一次取当前 VNode 并展开输出，不插入额外包装节点
      const resolved = typeof result === "function"
        ? (result as () => VNode | VNode[] | null)()
        : result;
      if (resolved == null) return;
      const nodes = Array.isArray(resolved) ? resolved : [resolved];
      if (isErrorBoundary(type)) {
        try {
          for (const n of nodes) {
            yield* walkVNodeForSSR(n, ifContext, options);
          }
        } catch (e) {
          yield* walkVNodeForSSR(
            getErrorBoundaryFallback(props)(e),
            ifContext,
            options,
          );
        }
      } else {
        for (const n of nodes) {
          yield* walkVNodeForSSR(n, ifContext, options);
        }
      }
    } finally {
      if (binding) popContext(binding.id);
    }
    return;
  }

  const tag = vnode.type as string;
  if (typeof tag !== "string") return;
  if (tag === "#text") {
    yield escapeForText(
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
        yield* walkVNodeForSSR(itemVnode, ifContext, options);
      }
      return;
    }
  }

  let attrs = stringifyAttributes(props);
  if (hasDirective(props, "vShow")) {
    if (!getVShowValue(props)) attrs += ' style="display:none"';
  }
  if (vnode.key != null && vnode.key !== undefined) {
    attrs += ` data-key="${escapeForAttr(String(vnode.key))}"`;
  }
  const ctx = ifContext ?? { lastVIf: true };
  yield `<${tag}${attrs}>`;
  if (!voidElements.has(tag.toLowerCase())) {
    yield* walkElementChildrenStream(
      props.children ?? vnode.children,
      ctx,
      options,
    );
    yield `</${tag}>`;
  }
}

/**
 * 将 walkVNodeForSSR 的产出收集为单字符串，供 createElementToString 使用。
 */
function collectWalk(
  vnode: VNode,
  ifContext?: IfContext,
  options?: SSROptions,
): string {
  let s = "";
  for (const chunk of walkVNodeForSSR(vnode, ifContext, options)) {
    s += chunk;
  }
  return s;
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
  return collectWalk(vnode, ifContext, options);
}

/**
 * 流式 SSR：将 VNode 转为逐块输出的字符串生成器，与 createElementToString 共用 walkVNodeForSSR。
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
  yield* walkVNodeForSSR(vnode, ifContext, options);
}
