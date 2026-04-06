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
} from "./signal.ts";
import {
  adoptChild,
  catchError,
  cleanNode,
  getOwner,
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
          if ("run" in sub.source) {
            (sub.source as unknown as Observer).run();
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
 * 将 `source` 的更新推迟到微任务，避免与高优先级同步更新争抢。
 * @template T 值类型
 * @param source 同步读取的派生源
 * @param options 可选 `equals` 自定义相等判断
 * @returns 与 `source` 同步的 getter（读时建立对内部 signal 的订阅）
 */
export function createDeferred<T>(
  source: () => T,
  options?: { equals?: (a: T, b: T) => boolean },
): () => T {
  const [get, set] = createSignal(source());

  createEffect(() => {
    const value = source();
    // 使用微任务推迟，这是最简单的优先级调度
    queueMicrotask(() => {
      const current = get();
      if (
        !options?.equals ? (current !== value) : !options.equals(current, value)
      ) {
        set(() => value);
      }
    });
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
