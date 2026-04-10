/**
 * @module runtime/utils
 * @description 运行时内部共享工具函数。
 *
 * **支持的功能：**
 * - ✅ isObject() - 判断是否为普通对象 (排除 Node)
 * - ✅ 其他内部工具函数
 *
 * **核心机制：**
 * - 安全的对象判断 (避免 Proxy 污染 Node)
 * - 运行时环境适配
 *
 * **范围说明：**
 * - 仅收录跨模块复用的极简工具；更多守卫与工具按调用方就近扩展即可。
 *
 * @usage
 * if (isObject(value)) { ... }
 */

/**
 * 判断是否为普通对象或数组，排除 Node 节点以避免 Proxy 污染。
 */
/** 与 SSR 自研 DOM 节点区分，避免把节点当普通对象做 `Object.assign` */
const SSR_VIEW_TREE_NODE = Symbol.for("@dreamer/view/ssrTreeNode");

export function isObject(v: any): v is object {
  return (
    v != null &&
    typeof v === "object" &&
    (typeof Node === "undefined" || !(v instanceof Node)) &&
    (v as Record<symbol, unknown>)[SSR_VIEW_TREE_NODE] !== true
  );
}

/**
 * 判断是否为信号 (Signal) 或框架内部定义的响应式函数。
 */
export function isSignal(v: any): v is (...args: any[]) => any {
  return typeof v === "function" && (v as any).__VIEW_SIGNAL === true;
}

/**
 * 展平/解包函数。
 * 如果 v 是函数且是 Signal，则执行获取值，支持多层嵌套。
 */
export function unwrap(v: any): any {
  while (typeof v === "function" && (v as any).__VIEW_SIGNAL === true) {
    v = v();
  }
  return v;
}

/**
 * 解析控制流 props：**静态值**、**零参 getter**，或 **`createSignal` 返回的可调用 getter**（`__VIEW_SIGNAL`）。
 * 须先识别 Signal 再识别「任意函数」，以便与「普通 `() => T` 回调」一致地调用一次读出当前值。
 *
 * @param source - 非函数则原样返回；Signal 与 getter 则调用无参得到 `T`
 * @returns 当前应采用的值
 */
export function readAccessor<T>(source: T | (() => T)): T {
  if (isSignal(source)) {
    return (source as () => T)();
  }
  if (typeof source === "function") {
    return (source as () => T)();
  }
  return source as T;
}
