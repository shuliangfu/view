/**
 * @module reactivity/master
 * @description 框架物理单例注册中心 - 全局状态管理。
 *
 * **支持的功能：**
 * - ✅ getInternal() - 获取或创建单例
 * - ✅ 物理单例模式 (globalThis 存储)
 * - ✅ 注册表管理
 * - ✅ 跨模块状态共享
 *
 * **核心机制：**
 * - 使用 globalThis 存储单例
 * - 延迟初始化 (initializer)
 * - Map 存储不同模块的状态
 *
 * **范围说明：**
 * - 使用 `globalThis` 单例为有意设计；多应用隔离需多 document/iframe 或进程级拆分。
 * - `resetRegistry()` 供测试与部分 SSR 流程重置内核；非面向业务代码的通用「卸载 API」。
 * - 调试依赖断点与模块内日志，未集成浏览器 devtools 扩展。
 *
 * @usage
 * const scheduler = getInternal("scheduler", () => ({ ... }))
 */

const g = globalThis as any;
const KEY = "__VIEW_CORE__";

/**
 * 物理单例注册表。
 */
export const registry = g[KEY] || (g[KEY] = new Map<string, any>());

/**
 * 获取内部状态。
 */
export function getInternal<T extends object>(
  key: string,
  initializer: () => T,
): T {
  let val = registry.get(key);
  if (!val) {
    val = initializer();
    registry.set(key, val);
  }
  return val;
}

/** 核心状态 */
export const core = getInternal("core", () => ({
  current: null as any,
  registry: new Map<string, any>(),
  uid: 0,
}));

/** 所有权状态 */
export const ownerCore = getInternal("owner", () => ({
  current: null as any,
}));

/**
 * 重置注册表 (仅用于测试)。
 */
export function resetRegistry() {
  core.current = null;
  core.uid = 0;
  core.registry.clear();
  ownerCore.current = null;

  const scheduler = registry.get("scheduler") as
    | { pending: unknown[]; pendingSet?: Set<unknown>; isBatching: boolean }
    | undefined;
  if (scheduler) {
    scheduler.pending = [];
    scheduler.pendingSet?.clear();
    scheduler.isBatching = false;
  }
  const ssrDepth = registry.get("ssrDomScopeDepth") as
    | { value: number }
    | undefined;
  if (ssrDepth) ssrDepth.value = 0;
  const store = registry.get("store");
  if (store) store.clear();
  const router = registry.get("router");
  if (router) router.active = null;
}
