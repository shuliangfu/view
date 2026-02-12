/**
 * View 模板引擎 — JSX 运行时
 *
 * 供 jsxImportSource: "view" 使用，与 react-jsx 转换兼容。
 * 导出 jsx、jsxs、Fragment，产出 VNode 供 dom / runtime 消费。
 */

import { FragmentType } from "./dom.ts";
import type { VNode } from "./types.ts";

/** Fragment 组件：用于 <>...</> 或 <Fragment>...</Fragment>，不产生真实 DOM 节点 */
export const Fragment = FragmentType;

/**
 * 规范化 props：提取 key、children，返回供 VNode 使用的 props 与 key
 */
function normalizeProps(
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): { props: Record<string, unknown>; key?: string | number | null } {
  const p = props ?? {};
  // 第三参 maybeKey 覆盖 props.key（与 React automatic runtime 一致）
  const key =
    (maybeKey !== undefined && maybeKey !== null
      ? maybeKey
      : (p.key as string | number | null | undefined)) ?? null;
  const { key: _k, ...rest } = p as Record<string, unknown> & { key?: unknown };
  return { props: rest, key: key ?? undefined };
}

/**
 * jsx(type, props, maybeKey?)
 * 与 React 17+ automatic JSX runtime 兼容，用于动态子节点场景
 */
export function jsx(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): VNode {
  const { props: p, key } = normalizeProps(props, maybeKey);
  return { type, props: p, key, children: p.children as VNode[] | undefined };
}

/**
 * jsxs(type, props, maybeKey?)
 * 与 React 17+ automatic JSX runtime 兼容，用于静态子节点场景（子节点为数组）
 */
export function jsxs(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): VNode {
  const { props: p, key } = normalizeProps(props, maybeKey);
  return { type, props: p, key, children: p.children as VNode[] | undefined };
}

/**
 * JSX intrinsic 元素类型：供 TSX 中 DOM 标签类型检查使用。
 * 使用 jsxImportSource: "@dreamer/view" 时编译器会使用此命名空间。
 * 因包含 declare global，JSR 发布需使用 --allow-slow-types。
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: string]: Record<string, unknown>;
    }
  }
}
