/**
 * @module @dreamer/view/jsx-runtime
 * @description
 * JSX 运行时，与 React 17+ automatic runtime 兼容。编译器将 JSX 转为对 jsx/jsxs 的调用，产出 VNode 供 render/renderToString/hydrate 消费。
 *
 * **本模块导出：**
 * - `jsx(type, props, maybeKey)`：单子节点场景的 JSX 转换入口
 * - `jsxs(type, props, maybeKey)`：静态多子节点场景的 JSX 转换入口
 * - `Fragment`：Fragment 标记（<>...</> 或 <Fragment>...</Fragment>），不生成真实 DOM
 *
 * **使用：** 在 deno.json / tsconfig 中配置 `"jsx": "react-jsx"` 与 `"jsxImportSource": "@dreamer/view"`，无需在业务代码中显式导入本模块。
 *
 * @example
 * // 配置后可直接写 JSX，编译器会从本模块解析 jsx、jsxs、Fragment
 * const vnode = <div class="foo">{count()}</div>;
 */

import { FragmentType } from "./dom.ts";
import type { VNode } from "./types.ts";

/**
 * Fragment 组件：用于 JSX 中 <>...</> 或 <Fragment>...</Fragment>，不产生真实 DOM 节点，仅包裹子节点。
 */
export const Fragment = FragmentType;

/** 规范化 props：提取 key、children，返回供 VNode 使用的 props 与 key */
function normalizeProps(
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): { props: Record<string, unknown>; key?: string | number | null } {
  const p = props ?? {};
  const key =
    (maybeKey !== undefined && maybeKey !== null
      ? maybeKey
      : (p.key as string | number | null | undefined)) ?? null;
  const { key: _k, ...rest } = p as Record<string, unknown> & { key?: unknown };
  return { props: rest, key: key ?? undefined };
}

/** 内部统一：根据 type/props/maybeKey 生成 VNode，jsx/jsxs 与 React 17+ automatic runtime 兼容 */
function createVNode(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): VNode {
  const { props: p, key } = normalizeProps(props, maybeKey);
  return { type, props: p, key, children: p.children as VNode[] | undefined };
}

/**
 * JSX 运行时入口（单子节点场景）。
 * 将 type + props + 可选 key 转为 VNode，与 React 17+ automatic runtime 兼容。
 *
 * @param type - 标签名（字符串）、组件函数或 Fragment 等 Symbol
 * @param props - 属性对象（含 children 等），可为 null
 * @param maybeKey - 可选的 key，用于列表协调
 * @returns 生成的 VNode
 */
export function jsx(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): VNode {
  return createVNode(type, props, maybeKey);
}

/**
 * JSX 运行时入口（静态多子节点场景，编译器会优化为数组形式）。
 * 与 jsx 行为一致，均产出 VNode。
 *
 * @param type - 标签名、组件函数或 Fragment
 * @param props - 属性对象（含 children），可为 null
 * @param maybeKey - 可选的 key
 * @returns 生成的 VNode
 */
export function jsxs(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): VNode {
  return createVNode(type, props, maybeKey);
}

/**
 * JSX 固有元素类型说明（JSR 不允许包内 declare global，故不在此处声明）：
 * 使用本运行时写 JSX 时，可在项目内自行添加：
 *   /// <reference path="node_modules/jsr/@dreamer/view/jsx-runtime.d.ts" />
 * 或在任意 .d.ts 中：declare global { namespace JSX { interface IntrinsicElements { [tag: string]: Record<string, unknown>; } } }
 */
