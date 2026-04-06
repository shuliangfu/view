/**
 * @module runtime/ssr-scope
 * @description SSR 作用域深度：供 `schedule` 在 SSR 内禁止 `queueMicrotask(flush)`。
 *
 * 深度存于 {@link ../reactivity/master.ts#getInternal}，与 `scheduler` 同属 `globalThis`，避免多份
 * `ssr-scope` 模块实例时 `server` 与 `batch` 读写不一致。
 */

import { getInternal } from "../reactivity/master.ts";

const depthState = getInternal("ssrDomScopeDepth", () => ({ value: 0 }));

/**
 * 与 `enterSSRDomScope` / `leaveSSRDomScope` 同步增减。
 */
export function bumpSsrDomScopeDepth(delta: 1 | -1): void {
  depthState.value = Math.max(0, depthState.value + delta);
}

/**
 * 是否处于 `renderToString` 等临时 `document` 生命周期内。
 */
export function isSsrDomScopeActive(): boolean {
  return depthState.value > 0;
}
