/**
 * @module @dreamer/view/globals
 * @description
 * 统一从 globalThis 读/写「按 key 存」的全局状态，与 constants 中的 KEY_* 配合使用，便于集中管理。
 * 各模块应通过本模块的 getGlobal / setGlobal / getGlobalOrDefault 访问，避免分散写 globalThis 强转。
 * @internal 由 directive、route-page、store、context、scheduler、signal、hmr 统一使用，键名见 constants.ts
 */

import { KEY_VIEW_SSR } from "./constants.ts";

/**
 * 从 globalThis 读取指定 key 的值
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
 * 向 globalThis 写入指定 key 的值
 */
export function setGlobal(key: string, value: unknown): void {
  if (typeof globalThis === "undefined") return;
  (globalThis as unknown as Record<string, unknown>)[key] = value;
}

/**
 * 从 globalThis 读取 key；若不存在则用 factory 生成并写入后返回，保证同 key 只创建一次
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
