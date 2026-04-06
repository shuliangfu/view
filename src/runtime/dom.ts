/**
 * @module runtime/dom
 * @description 浏览器环境与 ref 辅助：`getDocument`、`createRef`（与 {@link ViewRefObject} / jsx `ref` 约定一致）。
 */

import type { ViewRefObject } from "../types.ts";

/**
 * 存在 `document` 时返回之；无 DOM 的全局（部分 SSR）返回 `null`。
 */
export function getDocument(): Document | null {
  return typeof globalThis.document !== "undefined"
    ? globalThis.document
    : null;
}

/**
 * 构造可与 `ref={...}` 绑定的对象；挂载时由 jsx 运行时写入 `current`。
 */
export function createRef<T = unknown>(
  initial: T | null = null,
): ViewRefObject<T> {
  return { current: initial };
}
