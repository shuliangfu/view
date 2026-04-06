/**
 * @module runtime/dom
 * @description 浏览器环境与 ref 辅助：`getDocument`、`createRef`（与 {@link ViewRefObject} / jsx `ref` 约定一致）。
 */

import type { ViewRefObject } from "../types.ts";

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
 * 创建可与 `ref={...}` 绑定的容器；元素挂载后由 JSX 运行时写入 `current`。
 * @template T 引用目标类型
 * @param initial 初始 `current`，默认 `null`
 * @returns {@link ViewRefObject}
 */
export function createRef<T = unknown>(
  initial: T | null = null,
): ViewRefObject<T> {
  return { current: initial };
}
