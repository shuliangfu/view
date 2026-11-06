/**
 * @module runtime/dom
 * @description 浏览器环境与 ref 辅助：`getDocument`、`createRef`（与 {@link ViewRefObject} / jsx `ref` 约定一致）。
 */

import type { RefObject } from "../types.ts";

/**
 * 在浏览器返回 `globalThis.document`；无 DOM 环境（部分 SSR/测试）返回 `null`。
 * @returns 文档对象或 `null`
 */
export function getDocument(): Document | null {
  return typeof globalThis.document !== "undefined"
    ? globalThis.document
    : null;
}

/**
 * 创建可与原生元素 `ref={...}` 绑定的 ref 对象；挂载时由 JSX 运行时把节点写入 `ref.current`
 * （与函数式 `ref={(el) => …}` 二选一；`compileSource` 等编译路径对 ref 的语义以该路径文档为准）。
 *
 * @example
 * ```tsx
 * const inputRef = createRef<HTMLInputElement>(null);
 * return <input ref={inputRef} />;
 * // 挂载后：inputRef.current 即为该 input
 * ```
 *
 * @template T 引用目标类型（一般为 `HTMLElement` 子类型）
 * @param initial 初始 `current`，默认 `null`
 * @returns {@link RefObject}
 */
export function createRef<T = unknown>(
  initial: T | null = null,
): RefObject<T> {
  return { current: initial };
}

/**
 * JSX / 编译器统一的 ref 应用入口。
 *
 * - **对象 ref**：立刻写入 `current`（与历史 `createRef` 路径一致）。
 * - **函数 ref**：`el === null` 同步回调（卸载／瞬态清空）；非 null 且已
 *   `isConnected`（hydrate）同步回调；创建时尚在文档外则 `queueMicrotask` 后再调，
 *   以便同回合的 `insert`／`appendChild` 先挂上。解决 Affix 等在首帧
 *   `!host.isConnected` 时 `runSync` 永久跳过的问题。
 *
 * @param ref 函数 ref、对象 ref，或空
 * @param el 目标节点；卸载时传 `null`
 */
export function scheduleFunctionRef<T extends Element = Element>(
  ref:
    | ((el: T | null) => void)
    | { current: T | null }
    | null
    | undefined,
  el: T | null,
): void {
  if (ref == null) return;
  if (typeof ref !== "function") {
    (ref as { current: T | null }).current = el;
    return;
  }
  if (el == null) {
    ref(null);
    return;
  }
  if (el.isConnected) {
    ref(el);
    return;
  }
  queueMicrotask(() => {
    ref(el);
  });
}
