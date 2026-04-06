/**
 * @module reactivity/memo
 * @description 记忆化计算 (Memo) - 缓存计算结果，避免重复计算。
 *
 * **支持的功能：**
 * - ✅ createMemo() - 创建记忆化计算
 * - ✅ 依赖追踪和自动更新
 * - ✅ 缓存机制 (只有依赖变化时才重新计算)
 * - ✅ 错误处理
 * - ✅ 清理机制
 *
 * **核心机制：**
 * - 基于 Signal 的观察者模式
 * - 脏检查 (dirty checking)
 * - 结果缓存
 * - 与 Effect 系统的集成
 *
 * **范围说明：**
 * - 同步派生为主；异步派生宜用 `createResource`；失效策略以依赖追踪为准。
 *
 * @usage
 * const double = createMemo(() => count() * 2)
 * const filtered = createMemo(() => list().filter(item => item.active))
 */

import {
  adoptChild,
  catchError,
  cleanNode,
  getOwner,
  Owner,
  setOwner,
} from "./owner.ts";
import {
  cleanupObserver,
  notify,
  Observer,
  setCurrentObserver,
  Source,
  STATE_CHECK,
  STATE_CLEAN,
  STATE_DIRTY,
  STATE_DISPOSED,
  track,
} from "./signal.ts";

/**
 * Memo 节点。
 * 实现对齐 Solid.js 的极致 Lazy 计算。
 */
export interface Memo<T> extends Source<T>, Observer, Owner {
  fn: () => T;
}

/**
 * 创建惰性派生值：仅在读取且脏时重算；`Object.is` 相同时不通知下游。
 * @template T 计算结果类型
 * @param fn 无参计算函数，其内读取的 signal 会成为依赖
 * @returns 可重复调用的 getter（读时 `track` 本 memo）
 */
export function createMemo<T>(fn: () => T): () => T {
  const parent = getOwner();
  const memo: Memo<T> = {
    // Source 接口 (作为数据源)
    value: undefined as unknown as T,
    observers: null,
    observersTail: null,

    // Observer 接口 (作为订阅者)
    state: STATE_DIRTY, // 初始为脏
    sources: null,
    sourcesTail: null,
    run() {
      if (this.state === STATE_DISPOSED) return;

      // 核心修复：增加计算状态锁，防止并发重入和 Diamond Problem 下的重复计算
      if (this.state === STATE_CLEAN) return;

      // 1. 处理 CHECK 状态：这是为了解决 Diamond Problem
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

      // 2. 执行真正的计算
      const prevObserver = setCurrentObserver(this);
      const prevOwner = setOwner(this);

      cleanupObserver(this);
      cleanNode(this);

      try {
        this.state = STATE_CLEAN;
        const nextValue = this.fn();
        if (!Object.is(this.value, nextValue)) {
          this.value = nextValue;
          notify(this);
        }
      } catch (err) {
        catchError(err);
      } finally {
        setCurrentObserver(prevObserver);
        setOwner(prevOwner);
      }
    },

    // Owner 接口 (生命周期)
    owner: parent,
    disposables: null,
    children: null,

    fn,
  };

  if (parent) adoptChild(parent, memo);

  return () => {
    // 如果节点脏了，在读取瞬间执行计算 (Lazy)
    if (memo.state !== STATE_CLEAN) {
      memo.run();
    }

    track(memo);
    return memo.value;
  };
}
