/**
 * @module scheduler
 * @description 调度子路径：`jsr:@dreamer/view/scheduler`。
 *
 * - `batch` / `schedule` / `flushPendingSync`：响应式 Observer 微任务批处理
 * - `scheduleTask` / `Priority`：任意回调的优先级队列（与 batch **未统一**，见 batch 模块注释）
 */

export * from "./batch.ts";
export * from "./priority.ts";
