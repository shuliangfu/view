/**
 * @module reactivity/effect
 * @description 核心响应式系统 - 副作用 (Effect)。
 *
 * **支持的功能：**
 * - ✅ createEffect() - 创建响应式副作用
 * - ✅ 自动依赖追踪 (track 机制)
 * - ✅ 异步批量更新 (通过 scheduler/batch)
 * - ✅ 错误处理 (catchError)
 * - ✅ 清理机制 (cleanup)
 * - ✅ 所有权系统集成 (Owner)
 *
 * **核心机制：**
 * - 脏检查 + 拓扑更新
 * - 细粒度依赖 (只更新依赖的 Effect)
 * - 微任务调度 (batch)
 * - 错误边界支持
 *
 * **范围说明：**
 * - 调度粒度由 `scheduler/batch` 与调用方式决定；泄漏依赖正确的 `onCleanup`/Owner 释放。
 *
 * @usage
 * createEffect(() => {
 *   console.log("count changed:", count())
 * })
 */

import {
  cleanupObserver,
  createSignal,
  Observer,
  setCurrentObserver,
  STATE_CHECK,
  STATE_CLEAN,
  STATE_DIRTY,
  STATE_DISPOSED,
  untrack,
} from "./signal.ts";
import {
  adoptChild,
  catchError,
  cleanNode,
  getOwner,
  onCleanup,
  Owner,
  setOwner,
} from "./owner.ts";
import { batch } from "../scheduler/batch.ts";

/**
 * Effect 节点。
 * 既是观察者 (Observer)，也是所有权节点 (Owner)。
 */
export interface Effect extends Observer, Owner {
  /** 副作用回调函数 */
  fn: () => void;
}

/**
 * 创建副作用：立即执行一次 `fn` 并订阅其间读取的源；依赖变化时重新执行。
 * @param fn 副作用回调（可调用 `onCleanup` 登记每次重跑前的清理）
 * @returns `void`
 */
export function createEffect(fn: () => void): void {
  const parent = getOwner();
  const effect: Effect = {
    // Observer 接口实现
    state: STATE_DIRTY,
    sources: null,
    sourcesTail: null,
    run() {
      if (this.state === STATE_CLEAN || this.state === STATE_DISPOSED) {
        return;
      }

      // 如果是 CHECK 状态，询问上游。
      if (this.state === STATE_CHECK) {
        let sub = this.sources;
        while (sub) {
          const src = sub.source;
          // 判断上游是否为 Memo（同时是 Observer 和 Source）
          // 只有 Memo 需要先 run 再检查；普通 Source 不是 Observer
          if (typeof (src as any).run === "function") {
            (src as unknown as Observer).run();
            if ((this as any).state === STATE_DIRTY) break;
          }
          sub = sub.nextSource;
        }
        if (this.state === STATE_CHECK) {
          this.state = STATE_CLEAN;
          return;
        }
      }

      // 执行清理：断开旧的依赖关系
      cleanupObserver(this);
      // 执行所有权清理：运行 onCleanup 钩子并销毁旧的子节点 (Effect/Memo)
      cleanNode(this);

      // 准备执行：设置当前的 Observer 和 Owner 上下文
      const prevObserver = setCurrentObserver(this);
      const prevOwner = setOwner(this);

      try {
        this.state = STATE_CLEAN;
        this.fn();
      } catch (err) {
        // 核心错误冒泡
        catchError(err);
      } finally {
        setCurrentObserver(prevObserver);
        setOwner(prevOwner);
      }
    },

    // Owner 接口实现
    owner: parent,
    disposables: null,
    children: null,
    errorHandlers: null,

    // 自身属性
    fn,
  };

  // 登记到父级
  if (parent) adoptChild(parent, effect);

  // 立即执行第一次
  effect.run();
}

/**
 * 创建渲染用副作用：同步执行、不经 `batch` 微任务推迟，常用于 DOM 属性等紧耦合更新。
 * @param fn 副作用回调
 * @returns `void`
 */
export function createRenderEffect(fn: () => void): void {
  const parent = getOwner();
  const effect: Effect = {
    state: STATE_DIRTY,
    sources: null,
    sourcesTail: null,
    run() {
      if (this.state === STATE_DISPOSED) return;
      // 立即清理依赖
      cleanupObserver(this);
      // 执行所有权清理
      cleanNode(this);
      const prevObserver = setCurrentObserver(this);
      const prevOwner = setOwner(this);
      try {
        this.state = STATE_CLEAN;
        this.fn();
      } catch (err) {
        // 核心错误冒泡
        catchError(err);
      } finally {
        setCurrentObserver(prevObserver);
        setOwner(prevOwner);
      }
    },
    owner: parent,
    disposables: null,
    children: null,
    fn,
  };

  if (parent) adoptChild(parent, effect);
  effect.run();
}

/**
 * `createDeferred` 第二参选项。
 *
 * **不变量：** 默认路径只走 `queueMicrotask`，与 `scheduler/priority` **解耦**。
 * 可选 `timeout` 仅用 idle／macrotask 推迟提交，**不会**把 Observer 批处理并入
 * `scheduleTask`／Priority 队列（那是架构级 RFC，现行硬禁）。
 */
export interface CreateDeferredOptions<T> {
  /** 自定义相等判断；省略时用 `Object.is` */
  equals?: (a: T, b: T) => boolean;
  /**
   * 可选：在应用 deferred 值前最多等待的毫秒数。
   * - **省略**：`queueMicrotask`（默认，行为与历史一致）
   * - **数字**：优先 `requestIdleCallback(fn, { timeout })`，否则 `setTimeout(fn, timeout)`
   *
   * 为何不用 `scheduleTask(Priority.Idle)`：priority 面向任意回调分级队列，与
   * `batch` 的 Observer 微任务批是两套调度器；在 deferred 里桥过去会暗示「已统一」，
   * 易误导后续把 Effect 也塞进 priority（破坏顺序）。timeout 只表达「可晚一点提交」。
   */
  timeout?: number;
}

/**
 * 按 `timeout` 选项安排一次 deferred 提交；返回取消函数（microtask 不可取消则 no-op）。
 *
 * 边界：`requestIdleCallback` 在 Deno／部分测试环境不存在时回退 `setTimeout`；
 * Effect 重跑／dispose 时必须取消未触发的 idle／timeout，避免向已清理 signal 写入。
 */
function scheduleDeferredCommit(
  apply: () => void,
  timeout: number | undefined,
): () => void {
  if (timeout === undefined) {
    // 默认：纯 microtask。不用 generation 门闩，以保持与历史路径一致的竞态语义。
    queueMicrotask(apply);
    return () => {};
  }

  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof g.requestIdleCallback === "function") {
    const id = g.requestIdleCallback(apply, { timeout });
    return () => {
      if (typeof g.cancelIdleCallback === "function") {
        g.cancelIdleCallback(id);
      }
    };
  }

  const id = setTimeout(apply, timeout);
  return () => clearTimeout(id);
}

/**
 * 将 `source` 的更新推迟提交，避免与高优先级同步更新争抢。
 *
 * **意图：** 读侧立刻拿到「上一帧」稳定值；写侧在 microtask（或可选 idle／timeout）
 * 后再对齐 `source`，减轻输入过程中的级联渲染。
 *
 * **不变量：**
 * - 省略 `timeout` 时语义 ≡ 历史 `queueMicrotask` 路径（默认不变）
 * - 不调用 `scheduleTask`／不改 `batch` Observer 队列
 *
 * **边界／坑：** `timeout` 路径在 Effect 重跑前会 `onCleanup` 取消未触发句柄；
 * 默认 microtask 路径与历史一样不可取消（已入队的 microtask 仍可能跑一次 equals 检查）。
 *
 * @template T 值类型
 * @param source 同步读取的派生源
 * @param options {@link CreateDeferredOptions}；可只传 `equals`（旧调用方兼容）
 * @returns 与 `source` 延迟对齐的 getter（读时建立对内部 signal 的订阅）
 */
export function createDeferred<T>(
  source: () => T,
  options?: CreateDeferredOptions<T>,
): () => T {
  const [get, set] = createSignal(source());
  const equals = options?.equals;
  const timeout = options?.timeout;

  createEffect(() => {
    const value = source();
    const apply = () => {
      // untrack：避免在偶然仍有 Observer 的上下文里把 deferred 自身订成依赖
      const current = untrack(get);
      const same = equals ? equals(current, value) : Object.is(current, value);
      if (!same) set(() => value);
    };
    const cancel = scheduleDeferredCommit(apply, timeout);
    // timeout／idle 句柄可取消；microtask 取消为 no-op（见上）
    onCleanup(cancel);
  });

  return get;
}

/**
 * 全局正在运行的 Transition 计数。
 */
const [pendingCount, setPendingCount] = createSignal(0);

/**
 * 返回 Transition 状态与启动函数：`start` 内更新在 `batch` 中执行，`isPending` 反映进行中的 Transition 数量。
 * @returns 元组 `[isPending, startTransition]`
 */
export function useTransition(): [
  () => boolean,
  (fn: () => void | Promise<void>) => Promise<void>,
] {
  const isPending = () => pendingCount() > 0;

  const start = async (fn: () => void | Promise<void>) => {
    setPendingCount((c: number) => c + 1);
    try {
      // 在 batch 中运行以减少通知次数
      await batch(async () => {
        await fn();
      });
    } finally {
      setPendingCount((c: number) => c - 1);
    }
  };

  return [isPending, start];
}

/**
 * 将 `fn` 包在 Transition 批处理中执行（语义同 `useTransition` 返回的 `start`）。
 * @param fn 同步或异步更新函数
 * @returns `fn` 完成后的 Promise
 */
export function startTransition(fn: () => void | Promise<void>): Promise<void> {
  const [_, start] = useTransition();
  return start(fn);
}

/**
 * 设置当前的观察者上下文。
 * @internal 封装 signal.ts 的设置，保持内部状态一致。
 */
function _setCurrentObserverInternal(obs: Observer | null): Observer | null {
  const prev = setCurrentObserver(obs);
  return prev;
}
