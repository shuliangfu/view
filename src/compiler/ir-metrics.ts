/**
 * 开发向可观测性：`insertReactive` 在**已有追踪 DOM** 的再次提交中，区分本征 patch 与整段重挂次数。
 * 须将 {@link KEY_VIEW_IR_METRICS_ENABLED} 置于 `globalThis` 且为严格 `true` 才累计。
 *
 * @module @dreamer/view/compiler/ir-metrics
 */

import { KEY_VIEW_IR_METRICS_ENABLED } from "../constants.ts";

let patchAfterPriorDom = 0;
let remountAfterPriorDom = 0;

/**
 * 是否开启 insertReactive reconcile 计数。
 *
 * @returns `globalThis` 上键为严格 `true` 时为 true
 */
function insertReactiveMetricsEnabled(): boolean {
  return (globalThis as Record<string, unknown>)[
    KEY_VIEW_IR_METRICS_ENABLED
  ] === true;
}

/**
 * 记录一次「提交前已有节点且本轮走了本征 patch / 数组就地 patch」。
 */
export function noteInsertReactiveIntrinsicDomPatched(): void {
  if (!insertReactiveMetricsEnabled()) return;
  patchAfterPriorDom++;
}

/**
 * 记录一次「提交前已有节点且本轮整段替换追踪子树」（含 MountFn、全量数组重挂、VNode 重挂等）。
 */
export function noteInsertReactiveIntrinsicDomReplaced(): void {
  if (!insertReactiveMetricsEnabled()) return;
  remountAfterPriorDom++;
}

/**
 * 读取当前累积计数（仅统计 `hadPriorDom` 为 true 的提交轮次）。
 */
export function getIrMetrics(): {
  patchAfterPriorDom: number;
  remountAfterPriorDom: number;
} {
  return {
    patchAfterPriorDom,
    remountAfterPriorDom,
  };
}

/**
 * 单测或场景切换前清零计数。
 */
export function resetIrMetrics(): void {
  patchAfterPriorDom = 0;
  remountAfterPriorDom = 0;
}
