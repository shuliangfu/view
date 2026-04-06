/**
 * @module scheduler/batch
 * @description 批量更新调度器 - 优化响应式更新性能。
 *
 * **支持的功能：**
 * - ✅ batch() - 批量执行更新
 * - ✅ 自动微任务批处理
 * - ✅ 手动批量控制
 * - ✅ 调度器状态管理 (pending/isBatching)
 *
 * **核心机制：**
 * - 微任务队列 (queueMicrotask)
 * - 物理单例模式 (getInternal)
 * - 避免重复调度
 * - 统一的更新刷新机制
 *
 * **范围说明：**
 * - **与 `priority.ts` 集成**：本文件调度的是响应式 `Observer.run()`（`pending` 队列 + `queueMicrotask`）；`scheduler/priority.ts` 面向「任意回调」的分级队列。两者语义不同，**打通**要在 `schedule`/flush 全链路统一任务模型，属于架构级工作，不是此处几行能「优化完」的。
 * - **更复杂的更新策略**（时间分片、可中断渲染、lanes 等）超出当前「单微任务排空 `pending`」的设计，需另行 RFC 级方案。
 * - **开发调试**：可在 `flush` / `schedule` 打断点或用 Performance 看微任务；默认不内置详细 trace 日志，以免刷屏与影响生产包体。
 *
 * **已落地的实现优化：**
 * - `pendingSet`（`Set<Observer>`）与 `pending` 同步，调度去重从 O(n) 降为 O(1)。
 * - `runPendingSlice` 单点执行「拷贝、清空、跑任务」，供异步 `flush` 与 `flushPendingSync` 复用。
 *
 * @usage
 * batch(() => {
 *   setCount(1)
 *   setCount(2)  // 只触发一次更新
 * })
 */

import { getInternal } from "../reactivity/master.ts";
import { type Observer } from "../reactivity/signal.ts";
import { isSsrDomScopeActive } from "../runtime/ssr-scope.ts";

/** 调度器内核：队列 + O(1) 去重集合 */
interface SchedulerCore {
  pending: Observer[];
  pendingSet: Set<Observer>;
  isBatching: boolean;
  schedule(this: SchedulerCore, task: Observer): void;
  flush(this: SchedulerCore): void;
}

/**
 * 取出一批待执行任务并清空队列（与 `pendingSet` 同步），逐个 `run`；错误仅记录不中断同批其它任务。
 */
function runPendingSlice(core: SchedulerCore): void {
  const tasks = [...core.pending];
  core.pending = [];
  core.pendingSet.clear();
  for (let i = 0; i < tasks.length; i++) {
    try {
      tasks[i].run();
    } catch (err) {
      // 错误已经通过 catchError 冒泡或由 ErrorBoundary 处理；
      // 此处仍打印，避免静默吞错导致「点击无反应」等难以排查问题。
      console.error("[@dreamer/view] scheduler task error:", err);
    }
  }
}

const scheduler = getInternal("scheduler", (): SchedulerCore => ({
  pending: [] as Observer[],
  pendingSet: new Set<Observer>(),
  isBatching: false,
  schedule(task: Observer) {
    if (this.pendingSet.has(task)) return;
    this.pendingSet.add(task);
    this.pending.push(task);
    if (!this.isBatching) {
      /**
       * SSR：`renderToString` 在 `finally` 里 `flushPendingSync` 后 `leaveSSRDomScope`。
       * 此处若 `queueMicrotask(flush)`，会在拆除 `document` 之后执行 Effect。
       */
      if (isSsrDomScopeActive()) {
        return;
      }
      this.isBatching = true;
      queueMicrotask(() => this.flush());
    }
  },
  flush() {
    this.isBatching = true;
    try {
      while (this.pending.length > 0) {
        // 核心：每轮只处理当前快照，执行期间新 schedule 的 observer 进入下一轮 while
        runPendingSlice(this);
      }
    } finally {
      this.isBatching = false;
    }
  },
}));

/**
 * 调度一个更新任务。
 */
export function schedule(task: Observer) {
  scheduler.schedule(task);
}

/**
 * 手动批处理更新。
 */
export function batch<T>(fn: () => T): T {
  const p = scheduler.isBatching;
  scheduler.isBatching = true;
  try {
    return fn();
  } finally {
    scheduler.isBatching = p;
    if (!p) scheduler.flush();
  }
}

/**
 * 同步排空 `pending`（SSR 在卸载 `document` 前调用；不依赖 microtask）。
 *
 * @internal 由 `runtime/server` 的 `renderToString` / `leaveSSRDomScope` 前使用。
 */
export function flushPendingSync(): void {
  const core = scheduler as SchedulerCore;
  const batchingBefore = core.isBatching;
  core.isBatching = true;
  try {
    while (core.pending.length > 0) {
      runPendingSlice(core);
    }
  } finally {
    core.isBatching = batchingBefore;
  }
}
