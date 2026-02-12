/**
 * View 模板引擎 — DOM 绑定（聚合导出）
 *
 * 将 VNode 转为真实 DOM（浏览器）或 HTML 字符串（SSR）。
 * 实现已按职责拆分为 dom/element.ts、dom/stringify.ts、dom/hydrate.ts、dom/props.ts、dom/shared.ts、dom/unmount.ts。
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
