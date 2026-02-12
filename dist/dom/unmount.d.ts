/**
 * View 模板引擎 — 指令 unmount 登记与执行
 *
 * 在 replaceChildren / removeChild 前对节点及其子树执行已登记的指令 unmounted 回调（先子后父）
 */
/**
 * 为元素登记指令 unmounted 回调，节点从 DOM 移除前会执行（由 applyDirectives 调用）
 */
export declare function registerDirectiveUnmount(el: Element, cb: () => void): void;
/**
 * 对父节点的子节点依次执行 runDirectiveUnmount（先子后父由 runDirectiveUnmount 内部递归保证）
 * 在 replaceChildren / removeChild 前调用，统一抽取以减少重复
 */
export declare function runDirectiveUnmountOnChildren(parent: Node): void;
/**
 * 对节点及其子树递归执行已登记的指令 unmounted 回调（先子后父）
 * 在 replaceChildren / removeChild 前调用，确保节点移除前完成清理
 */
export declare function runDirectiveUnmount(node: Node): void;
//# sourceMappingURL=unmount.d.ts.map