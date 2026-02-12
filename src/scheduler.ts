/**
 * View 模板引擎 — 调度器（微任务批处理）
 *
 * 供 signal、store、effect 共用：订阅者/effect 不在此 tick 内同步执行，而是加入队列，
 * 由一次微任务统一 flush，避免「写 → 立即跑 effect → 再写」的同步重入导致主线程卡死。
 */

/** 待执行的任务队列，同一 tick 内多次写入只触发一次微任务 flush */
const queue = new Set<() => void>();
/** 复用数组，flush 时倒入后遍历执行，避免每次 new Set 分配 */
const queueCopy: (() => void)[] = [];
let scheduled = false;

/**
 * 清空当前队列并依次执行所有任务（在微任务中调用）
 */
function flushQueue(): void {
  scheduled = false;
  queueCopy.length = 0;
  for (const run of queue) queueCopy.push(run);
  queue.clear();
  for (const run of queueCopy) run();
}

/**
 * 将任务加入队列，并确保在本 tick 的微任务中执行 flush
 * 供 signal setter、store set、createEffect 的「下次执行」使用，避免同步重入
 */
export function schedule(run: () => void): void {
  queue.add(run);
  if (!scheduled) {
    scheduled = true;
    if (typeof globalThis.queueMicrotask !== "undefined") {
      globalThis.queueMicrotask(flushQueue);
    } else if (typeof Promise !== "undefined") {
      Promise.resolve().then(flushQueue);
    } else {
      setTimeout(flushQueue, 0);
    }
  }
}

/**
 * 从队列中移除任务（如 effect dispose 时取消尚未执行的 run）
 */
export function unschedule(run: () => void): void {
  queue.delete(run);
}
