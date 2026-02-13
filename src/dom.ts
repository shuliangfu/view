/**
 * @module @dreamer/view/dom
 * @description
 * View 模板引擎 — DOM 绑定（聚合导出）。将 VNode 转为真实 DOM（浏览器）或 HTML 字符串（SSR）。实现已按职责拆分为 dom/element、dom/stringify、dom/hydrate、dom/props、dom/shared、dom/unmount。
 *
 * **本模块导出：**
 * - 类型与工具：`FragmentType`、`IfContext`、`SSROptions`、`isFragment`（来自 dom/shared）
 * - 指令卸载：`registerDirectiveUnmount`、`runDirectiveUnmount`、`runDirectiveUnmountOnChildren`（来自 dom/unmount）
 * - 元素与 patch：`appendDynamicChild`、`ChildItem`、`createElement`、`createNodeFromExpanded`、`ExpandedRoot`、`expandVNode`、`normalizeChildren`、`patchRoot`（来自 dom/element）
 * - SSR：`createElementToStream`、`createElementToString`（来自 dom/stringify）
 * - `hydrateElement`（来自 dom/hydrate）
 */

export {
  FragmentType,
  type IfContext,
  isFragment,
  type SSROptions,
} from "./dom/shared.ts";

export {
  registerDirectiveUnmount,
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom/unmount.ts";

export {
  appendDynamicChild,
  type ChildItem,
  createElement,
  createNodeFromExpanded,
  type ExpandedRoot,
  expandVNode,
  normalizeChildren,
  patchRoot,
} from "./dom/element.ts";

export {
  createElementToStream,
  createElementToString,
} from "./dom/stringify.ts";

export { hydrateElement } from "./dom/hydrate.ts";
