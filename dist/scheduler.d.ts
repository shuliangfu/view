/**
 * View 模板引擎 — 调度器（微任务批处理）
 *
 * 供 signal、store、effect 共用：订阅者/effect 不在此 tick 内同步执行，而是加入队列，
 * 由一次微任务统一 flush，避免「写 → 立即跑 effect → 再写」的同步重入导致主线程卡死。
 */
/**
 * 将任务加入队列，并确保在本 tick 的微任务中执行 flush
 * 供 signal setter、store set、createEffect 的「下次执行」使用，避免同步重入
 */
export declare function schedule(run: () => void): void;
/**
 * 从队列中移除任务（如 effect dispose 时取消尚未执行的 run）
 */
export declare function unschedule(run: () => void): void;
//# sourceMappingURL=scheduler.d.ts.map