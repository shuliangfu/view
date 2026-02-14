/**
 * @module @dreamer/view/globals
 * @description
 * 统一从 globalThis 读/写「按 key 存」的全局状态，与 constants 中的 KEY_* 配合使用，便于集中管理。
 * 各模块应通过本模块的 getGlobal / setGlobal / getGlobalOrDefault 访问，避免分散写 globalThis 强转。
 * @internal 由 directive、route-page、store、context、scheduler、signal、hmr 统一使用，键名见 constants.ts
 */

/**
 * 从 globalThis 读取指定 key 的值
 */
export function getGlobal<T = unknown>(key: string): T | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as unknown as Record<string, T | undefined>)[key];
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
