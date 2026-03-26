/**
 * JSX 运行时，与 React 17+ automatic runtime 兼容。
 *
 * **与 `@dreamer/view/compiler` 挂载路径对齐（运行时语义，非三斜杠类型引用）：**
 * - 侧效 `import "./compiler/mod.ts"`：注册 `mountVNodeTree` 内嵌套 `insertReactive` 的 VNode 桥接，与 compileSource 产物、主入口一致。
 * - 子项与 **`compiler/vnode-mount.ts`、`compiler/vnode-reconcile.ts` 同源**：均使用 {@link normalizeChildren}（`dom/element.ts`）。`SignalRef` → getter、数组扁平、原始值 → `#text` VNode，与 compile 路径读 `props.children` 时一致。
 * - `jsx` 在**单子项**时折叠为单 child（TS `jsx` 常见形态）；`jsxs` **始终保留数组**（TS `jsxs` 静态多子）。
 * - `jsxDEV`：`jsx-dev-runtime` 的 `isStaticChildren === true` 时与 `jsxs` 同语义，否则与 `jsx` 同语义；并从 props 去掉 `__source` / `__self`（与 React dev 约定一致）。
 * - **`insert` / `insertStatic`（`runtime.ts` / `compiler/insert.ts`）**：对打包器生成的 **`insert(parent, jsx(…))` 静态 VNode** 以及 **细粒度 hydrate** 下的同形态，已与 compile 路径对齐（走 `insertReactive` + `mountVNodeTree`，避免误落 `insertStatic`→空节点）。
 * - **同源码双路径契约**（哪些已对齐、哪些仍须 compileSource）：见仓库 **`docs/编译路径与运行时指南.md`**「三附」节。
 *
 * 全量 **compileSource** 将本征 JSX 展开为 `insert` / `createElement` 等，不经过本文件；本模块服务于 **`jsx: "react-jsx"` + `jsxImportSource: "@dreamer/view"`** 的手写/混合链路。
 *
 * @module @dreamer/view/jsx-runtime
 * @packageDocumentation
 *
 * **导出：** jsx、jsxs、jsxDEV、jsxMerge、jsxMerges、Fragment
 *
 * @example
 * const vnode = <div class="foo">{count()}</div>;
 */

/** 与 compileSource 产物共用 `insertReactive` 实现并注册 VNode 子树桥接 */
import "./compiler/mod.ts";

import { mergeProps } from "./compiler/props.ts";
import { normalizeChildren } from "./dom/element.ts";
import { FragmentType } from "./dom/shared.ts";
import type { VNode } from "./types.ts";

/**
 * Fragment 组件：用于 JSX 中 <>...</> 或 <Fragment>...</Fragment>，不产生真实 DOM 节点，仅包裹子节点。
 */
export const Fragment = FragmentType;

/**
 * 规范化 props：提取 key、children，返回供 VNode 使用的 props 与 key。
 *
 * @param props - 原始 props
 * @param maybeKey - 可选第三参 key，覆盖 props.key
 */
function normalizeProps(
  props: Record<string, unknown> | null,
  maybeKey?: string | number | null,
): { props: Record<string, unknown>; key?: string | number | null } {
  const p = props ?? {};
  const key =
    (maybeKey !== undefined && maybeKey !== null
      ? maybeKey
      : (p.key as string | number | null | undefined)) ?? null;
  /** 与 React dev 遗留一致：勿把 `__source` / `__self` 留在 props 里进入 VNode */
  const { key: _k, __source: _src, __self: _slf, ...rest } = p as
    & Record<
      string,
      unknown
    >
    & { key?: unknown; __source?: unknown; __self?: unknown };
  return { props: rest, key: key ?? undefined };
}

/**
 * 将 `props.children` 经 {@link normalizeChildren} 写回 props，与 `mountVNodeTree` 读取路径一致。
 *
 * @param preferArrayChildren - 为 true 时（`jsxs`）始终使用子项数组；为 false 时（`jsx`）单子项折叠为单值
 */
function applyNormalizedChildren(
  p: Record<string, unknown>,
  preferArrayChildren: boolean,
): void {
  if (!("children" in p)) return;
  const raw = p.children;
  if (raw === undefined) {
    delete p.children;
    return;
  }
  const items = normalizeChildren(raw);
  if (preferArrayChildren) {
    p.children = items as unknown;
    return;
  }
  if (items.length === 0) {
    p.children = [];
  } else if (items.length === 1) {
    p.children = items[0] as unknown;
  } else {
    p.children = items as unknown;
  }
}

/**
 * 内部统一：根据 type/props/maybeKey 生成 VNode。
 *
 * - `props.children` 与顶层 `vnode.children` 指向同一引用；
 * - 子项形态与 compileSource + `mountVNodeTree` 一致（含 `SignalRef` / getter / `#text`）。
 */
function createVNode(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  maybeKey: string | number | null | undefined,
  preferArrayChildren: boolean,
): VNode {
  const { props: p0, key } = normalizeProps(props, maybeKey);
  const p = { ...p0 };
  applyNormalizedChildren(p, preferArrayChildren);
  return { type, props: p, key, children: p.children as VNode["children"] };
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
  return createVNode(type, props, maybeKey, false);
}

/**
 * JSX 运行时入口（静态多子节点场景，TypeScript 会优化为 `jsxs` + 数组 children）。
 * 子节点**始终**以规范化后的数组置于 `props.children`，与编译器静态多子列表形态一致。
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
  return createVNode(type, props, maybeKey, true);
}

/**
 * 多段 props 合并后再创建 VNode，等价于 `jsx(type, mergeProps(...sources))`。
 * 手写路径无编译器的 `{...a}{...b}` 链时，用本函数或 **`mergeProps` + `jsx`** 即可对齐编译产物的 merge 语义（后者依赖 `mergeProps` 的 Proxy 完整 trap）。
 *
 * @param type - 标签名、组件函数或 Fragment
 * @param sources - 多组 props，后者覆盖前者；`null`/`undefined` 会被忽略
 * @returns 合并后的 VNode
 */
export function jsxMerge(
  type: VNode["type"],
  ...sources: (Record<string, unknown> | null | undefined)[]
): VNode {
  const merged = mergeProps(...sources) as Record<string, unknown>;
  return createVNode(type, merged, undefined, false);
}

/**
 * 多段 props 合并后再创建 VNode，子节点**始终**按 {@link jsxs} 的数组语义规范化。
 * 手写多段 `mergeProps` + 静态多子（或须避免单子项被折叠）时使用，等价于 `jsxs(type, mergeProps(...))`。
 *
 * @param type - 标签名、组件函数或 Fragment
 * @param sources - 各 props 来源，与 {@link mergeProps} 相同
 * @returns 合并后的 VNode
 */
export function jsxMerges(
  type: VNode["type"],
  ...sources: (Record<string, unknown> | null | undefined)[]
): VNode {
  const merged = mergeProps(...sources) as Record<string, unknown>;
  return createVNode(type, merged, undefined, true);
}

/**
 * 开发态 JSX 入口：`typescript` / 打包器在 `jsx: "react-jsx"` **开发**模式下可解析至 `jsx-dev-runtime`，
 * 调用形态为 `(type, props, key, isStaticChildren, source?, self?)`。
 * 当 `isStaticChildren === true` 时与 {@link jsxs} 同向（子节点保持数组，不折叠单子项），否则与 {@link jsx} 同向。
 *
 * @param key - 第四参前第三参；可与 `props.key` 二选一，此处优先（与 `jsx`/`jsxs` 第三参一致）
 * @param isStaticChildren - 静态多子时为 `true`
 * @param _source - 源码位置；本运行时忽略
 * @param _self - React `this`；本运行时忽略
 */
export function jsxDEV(
  type: VNode["type"],
  props: Record<string, unknown> | null,
  key: string | number | null | undefined,
  isStaticChildren?: boolean,
  _source?: unknown,
  _self?: unknown,
): VNode {
  return createVNode(
    type,
    props,
    key,
    isStaticChildren === true,
  );
}
