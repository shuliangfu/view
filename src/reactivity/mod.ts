/**
 * @module reactivity
 * @description 响应式子路径入口：`jsr:@dreamer/view/reactivity`。
 *
 * 含 Signal / Effect / Memo / Owner / Store / Context 等，**不含** router、form、SSR。
 * 另为文档／示例便利 **re-export** {@link batch}（实现位于 `scheduler/batch`；完整调度 API 仍用
 * `@dreamer/view/scheduler`）。主入口 `@dreamer/view` 仍 re-export 相同 API；按需导入本路径便于 tree-shake。
 *
 * @example
 * ```ts
 * import { batch, createSignal, createEffect, createMemo } from "@dreamer/view/reactivity";
 * ```
 */

export * from "./context.ts";
export * from "./effect.ts";
export * from "./lifecycle.ts";
export * from "./memo.ts";
/** 与主入口 / 编译器 SSR 模式 `memo` 导入名对齐 */
export { createMemo as memo } from "./memo.ts";
export * from "./owner.ts";
export * from "./selector.ts";
export * from "./signal.ts";
export * from "./store.ts";

/** 与 README §7.4／examples 对齐；规范入口仍为 `@dreamer/view/scheduler` */
export { batch } from "../scheduler/batch.ts";
