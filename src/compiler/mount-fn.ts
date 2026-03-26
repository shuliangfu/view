/**
 * 编译器产出的「单参 DOM 挂载函数」`(parent) => void` 与业务单参回调（如 `expandedRowRender(record)`）在 `.length === 1` 上无法区分，
 * 仅靠 `isMountFn` 打标可明确识别；**compileSource** 另将「单参且非 `isSignalGetter`」的组件返回值视为 DOM 挂载并生成 `result(parent)`（见 jsx-compiler `buildComponentStatements`），
 * 故 `RoutePage` 等可不包 `markMountFn`；列表 map 等仍须 `markMountFn` 以免与带参回调混淆。
 *
 * @module @dreamer/view/compiler/mount-fn
 */

/** 挂载到函数对象上的标记，避免与任意 `(x)=>unknown` 混淆 */
export const VIEW_DOM_MOUNT_FN_MARKER = Symbol.for("view.domMountFn");

/**
 * 为 compileSource 生成的 DOM 挂载箭头打标，供 `insertReactive` / `vnode-mount` 识别。
 *
 * @param fn - 单参 `(parent: Node) => void`
 * @returns 同一函数引用（已挂标记）
 */
export function markMountFn<F extends (parent: Node) => void>(fn: F): F {
  (fn as unknown as Record<symbol, boolean>)[VIEW_DOM_MOUNT_FN_MARKER] = true;
  return fn;
}

/**
 * 判断是否为编译器标记过的 DOM 挂载函数（单参且带 {@link VIEW_DOM_MOUNT_FN_MARKER}）。
 *
 * @param value - getter 返回值等
 * @returns 是否应作为 `(parent)=>void` 调用
 */
export function isMountFn(value: unknown): value is (parent: Node) => void {
  return (
    typeof value === "function" &&
    (value as (p: unknown) => unknown).length === 1 &&
    (value as unknown as Record<symbol, boolean>)[VIEW_DOM_MOUNT_FN_MARKER] ===
      true
  );
}
