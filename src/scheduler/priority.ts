/**
 * @module scheduler/priority
 * @description 优先级任务调度器 - 确保交互优先级。
 *
 * **支持的功能：**
 * - ✅ Priority 枚举 (Immediate/UserBlocking/Normal/Idle)
 * - ✅ 优先级队列管理
 * - ✅ 任务调度 (schedule)
 * - ✅ 不同优先级的执行顺序控制
 *
 * **核心机制：**
 * - 四个优先级队列（`Immediate` 同步；`UserBlocking` / `Normal` 在同一微任务内按优先级排空）
 * - `Idle`：`requestIdleCallback`（若可用）否则 `setTimeout(0)`，避免抢占主线程交互
 * - 与 `scheduler/batch` 解耦：batch 调度响应式 `Observer`；本模块面向任意回调分级
 *
 * **范围说明：**
 * - **与 batch 深度合并**（统一队列模型）属架构改动，需单独设计；当前两调度器可并存使用。
 * - **更细粒度优先级**（lanes、可中断）非本极简 API 目标。
 *
 * @usage
 * schedule(Priority.Immediate, () => handleInput())
 * schedule(Priority.Idle, () => preloadData())
 */

export enum Priority {
  /** 最高优先级：同步执行，用于表单输入、点击交互 */
  Immediate = 0,
  /** 用户阻塞：尽快执行，用于视觉反馈、导航 */
  UserBlocking = 1,
  /** 普通：微任务批处理，用于数据同步 */
  Normal = 2,
  /** 后台：空闲时执行，用于预加载、非视口更新 */
  Idle = 3,
}

const queues: Set<() => void>[] = [
  new Set(), // Immediate
  new Set(), // UserBlocking
  new Set(), // Normal
  new Set(), // Idle
];

let isScheduled = false;

/**
 * 在浏览器空闲时执行；无 `requestIdleCallback` 时回退到 macrotask，保证旧环境与测试可跑通。
 */
function runWhenIdle(fn: () => void): void {
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout?: number },
    ) => number;
  };
  if (typeof g.requestIdleCallback === "function") {
    g.requestIdleCallback(() => fn(), { timeout: 2000 });
  } else {
    setTimeout(fn, 0);
  }
}

/**
 * 按优先级将 `fn` 入队：`Immediate` 同步执行，其余在微任务或空闲回调中刷新。
 * @param fn 要运行的回调
 * @param priority 队列优先级，默认 {@link Priority.Normal}
 * @returns `void`
 */
export function scheduleTask(
  fn: () => void,
  priority: Priority = Priority.Normal,
) {
  if (priority === Priority.Immediate) {
    fn();
    return;
  }

  queues[priority].add(fn);

  if (!isScheduled) {
    isScheduled = true;
    queueMicrotask(flushTasks);
  }
}

/**
 * 微任务内先排空 `UserBlocking` 与 `Normal`；`Idle` 延后到空闲回调，避免阻塞输入与绘制。
 */
function flushTasks() {
  isScheduled = false;

  for (let p = Priority.UserBlocking; p <= Priority.Normal; p++) {
    const queue = queues[p];
    if (queue.size > 0) {
      const tasks = Array.from(queue);
      queue.clear();
      for (let i = 0; i < tasks.length; i++) {
        tasks[i]();
      }
    }
  }

  const idleQueue = queues[Priority.Idle];
  if (idleQueue.size === 0) return;
  const idleTasks = Array.from(idleQueue);
  idleQueue.clear();
  runWhenIdle(() => {
    for (let i = 0; i < idleTasks.length; i++) {
      idleTasks[i]();
    }
  });
}
