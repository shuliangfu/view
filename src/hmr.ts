/**
 * @module @dreamer/view/hmr
 * @description
 * 开发模式 HMR 细粒度更新：提供可订阅的 version signal，供 RoutePage 在路由 chunk 变更时重新拉取并渲染。HMR banner 通过 globalThis.__VIEW_HMR_BUMP__ 递增 version，触发当前路由组件重渲染而不整树重载。
 *
 * **本模块导出：**
 * - `getHmrVersionGetter()`：返回 version getter，供 RoutePage 订阅
 * @internal 仅 route-page 与 build 注入的 HMR 脚本使用
 */

import { createSignal } from "./signal.ts";

const [getHmrVersion, setHmrVersion] = createSignal(0);

/** 供 RoutePage 订阅，version 变化时触发重新取 resource */
export function getHmrVersionGetter(): () => number {
  return getHmrVersion;
}

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { __VIEW_HMR_BUMP__?: () => void })
    .__VIEW_HMR_BUMP__ = () => setHmrVersion((v) => v + 1);
}
