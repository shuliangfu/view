/**
 * @module @dreamer/view/scheduler
 * @description
 * View 模板引擎 — 调度器（微任务批处理）。供 signal、store、effect 共用：订阅者/effect 不在此 tick 内同步执行，而是加入队列，由一次微任务统一 flush，避免同步重入导致主线程卡死。队列与 scheduled 存于 globalThis，本模块自包含实现，保证 main 与 code-split chunk 共用同一队列与同一 flush。
 *
 * **本模块导出：**
 * - `schedule(run)`：将任务加入队列，微任务中执行
 * - `unschedule(run)`：从队列移除任务（如 effect dispose 时）
 */

const KEY_SCHEDULER = "__VIEW_SCHEDULER";

type SchedulerState = {
  queue: Set<() => void>;
  queueCopy: (() => void)[];
  scheduled: boolean;
};

function getGlobalSchedulerState(): SchedulerState {
  const g = globalThis as unknown as Record<string, SchedulerState | undefined>;
  let state = g[KEY_SCHEDULER];
  if (!state) {
    state = { queue: new Set(), queueCopy: [], scheduled: false };
    (globalThis as unknown as Record<string, SchedulerState>)[KEY_SCHEDULER] =
      state;
  }
  return state;
}

/**
 * 清空当前队列并依次执行所有任务（在微任务中调用）
 */
function flushQueue(): void {
  const state = getGlobalSchedulerState();
  state.scheduled = false;
  state.queueCopy.length = 0;
  state.queueCopy.push(...state.queue);
  state.queue.clear();
  for (const run of state.queueCopy) run();
}

/**
 * 将任务加入队列，并确保在本 tick 的微任务中执行 flush
 * 供 signal setter、store set、createEffect 的「下次执行」使用，避免同步重入
 */
export function schedule(run: () => void): void {
  const state = getGlobalSchedulerState();
  state.queue.add(run);
  if (!state.scheduled) {
    state.scheduled = true;
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
  getGlobalSchedulerState().queue.delete(run);
}
