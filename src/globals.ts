/**
 * 基于 `globalThis` 的键值存取，与内部 `KEY_*` 常量配合；扩展或调试时可使用 `setGlobal` / `getGlobal`。
 *
 * `getDocument()` 在无可用 document 时返回 `null`（含 SSR 未挂影子、或非 DOM 环境），不再抛错，便于 Hybrid 同构。
 *
 * @module @dreamer/view/globals
 * @packageDocumentation
 *
 * **导出：** `getGlobal`、`setGlobal`、`getGlobalOrDefault`、`getDocument`
 */

import { KEY_VIEW_SSR, KEY_VIEW_SSR_DOCUMENT } from "./constants.ts";

/**
 * 从 `globalThis` 读取指定键的值（不存在则 `undefined`）。
 *
 * @param key - 字符串键名，与框架内部 `KEY_*` 或自定义键一致
 * @returns 已存储的值，或 `undefined`
 */
export function getGlobal<T = unknown>(key: string): T | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as unknown as Record<string, T | undefined>)[key];
}

/**
 * 获取当前可用的 `document`：与编译产物一致，**优先** `renderToString` / `renderToStream` 设置的 SSR 影子 document（`KEY_VIEW_SSR_DOCUMENT`），
 * 否则回退到 `globalThis.document`。
 *
 * - 服务端仅标记 `KEY_VIEW_SSR` 且**未**设置影子 document 时返回 `null`（不再抛错，便于页面组件直接调用）。
 * - 非 DOM 环境且无影子时返回 `null`。
 *
 * @returns 影子或真实 `Document`；不可用时为 `null`
 */
export function getDocument(): Document | null {
  const shadow = getGlobal<unknown>(KEY_VIEW_SSR_DOCUMENT);
  if (shadow != null) {
    return shadow as Document;
  }
  if (getGlobal<boolean>(KEY_VIEW_SSR)) {
    return null;
  }
  const doc = (globalThis as { document?: Document }).document;
  return doc ?? null;
}

/**
 * 向 `globalThis` 写入指定键的值（覆盖已有值）。
 *
 * @param key - 字符串键名
 * @param value - 任意可序列化引用或对象
 */
export function setGlobal(key: string, value: unknown): void {
  if (typeof globalThis === "undefined") return;
  (globalThis as unknown as Record<string, unknown>)[key] = value;
}

/**
 * 从 `globalThis` 读取键；若不存在则调用 `factory` 创建、写入并返回（同键单例）。
 *
 * @param key - 字符串键名
 * @param factory - 无参工厂，仅在键缺失时调用一次
 * @returns 已存在或新创建的值
 */
export function getGlobalOrDefault<T>(
  key: string,
  factory: () => T,
): T {
  const existing = getGlobal<T>(key);
  if (existing !== undefined) return existing;
  const value = factory();
  setGlobal(key, value);
  return value;
}
