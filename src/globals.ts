/**
 * 基于 `globalThis` 的键值存取，与内部 `KEY_*` 常量配合；扩展或调试时可使用 `setGlobal` / `getGlobal`。
 *
 * `getDocument()` 在 SSR 标记开启时会抛错，供业务区分环境（详见函数说明）。
 *
 * @module @dreamer/view/globals
 * @packageDocumentation
 *
 * **导出：** `getGlobal`、`setGlobal`、`getGlobalOrDefault`、`getDocument`
 */

import { KEY_VIEW_SSR } from "./constants.ts";

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
 * 获取 document，仅在浏览器环境可用。
 * 在服务端渲染（renderToString/renderToStream）期间调用会抛出明确错误，便于排查误用。
 *
 * @returns 当前环境的 document 对象
 * @throws 当处于 SSR（KEY_VIEW_SSR 为 true）时抛出，提示不要在服务端使用 document
 */
export function getDocument(): Document {
  if (getGlobal<boolean>(KEY_VIEW_SSR)) {
    throw new Error(
      "document is not available during server-side rendering. Do not use document or window in components rendered with renderToString() or renderToStream(). Use conditional checks (e.g. if (typeof document !== 'undefined')) or move the logic to client-only code (e.g. createEffect, onMount).",
    );
  }
  const doc = (globalThis as { document?: Document }).document;
  if (doc == null) {
    throw new Error(
      "document is not available in this environment. Are you running outside the browser?",
    );
  }
  return doc;
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
