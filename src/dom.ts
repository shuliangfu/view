/**
 * **DOM 辅助**聚合导出：Fragment 工具类型、SSR 相关类型、指令卸载钩子，以及子节点规范化（兼容/类型用途）。
 *
 * 现代用法下视图更新由编译产物与 `insert` / `insertReactive` 完成；本模块主要为类型复用、指令生命周期与少量工具函数。
 *
 * @module @dreamer/view/dom
 * @packageDocumentation
 *
 * **来自 `dom/shared`：** `FragmentType`、`isFragment`、`IfContext`、`SSROptions`
 *
 * **来自 `dom/unmount`：** `registerDirectiveUnmount`、`runDirectiveUnmount`、`runDirectiveUnmountOnChildren`
 *
 * **来自 `dom/element`：** `normalizeChildren`
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

export { normalizeChildren } from "./dom/element.ts";
