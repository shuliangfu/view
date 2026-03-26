/**
 * `insertReactive` 在 effect **重跑前** 的清理策略：与 {@link canPatchIntrinsic} 配合，
 * 在「单根本征元素、无嵌套子 insertReactive、且下一轮 VNode 与 {@link canPatchIntrinsic} 兼容」时可 **保留 DOM**，供下一轮 `patchIntrinsicSubtree`。
 * 须 **`childInsertDisposers.length === 0`**：patch 分支会清空登记且不 dispose 子项，若仍有嵌套 `insertReactive` 登记则不可走此路径，否则父级后续完整清理时无法逆序 dispose 子层（步骤 5 仍维持此不变量）。
 *
 * 背景：`createEffect` 先执行上一轮 `onCleanup` 再跑函数体；若此处始终 detach，则无法实现就地 patch。
 * **数组返回**：同序本征 patch 或 **带稳定 key** 时的按键重排再 patch 亦可整组保留 DOM（见
 * `ir-array-patch.ts`）。
 *
 * @module @dreamer/view/compiler/ir-clean
 */

import { isVNodeLike } from "../dom/shared.ts";
import { untrack } from "../effect.ts";
import type { EffectDispose } from "../types.ts";
import { readReactiveInsertRawFromGetter } from "./ir-coerce.ts";
import { canKeepDomForInsertReactiveArrayPatch } from "./ir-array-patch.ts";
import { canPatchIntrinsic } from "./vnode-reconcile.ts";

export type InsertReactiveIntrinsicCleanupOptions = {
  /** 用户调用返回的 dispose 关闭整个插入点时为 true，须完整 dispose 子层并 detach */
  forceFullCleanup: boolean;
  /** 与 `insertReactive` 相同的 getter */
  getter: () => unknown;
  /** 当前追踪节点（可变；patch 路径下保留内容） */
  currentNodes: Node[];
  /**
   * 上一轮数组 commit 记录的 VNode key 列（与 `currentNodes` 下标对齐），供数组 key 重排 patch 预判。
   */
  prevArrayVNodeKeys: readonly string[] | null;
  /** 本轮同步挂载中登记的子 `insertReactive` dispose（可变） */
  childInsertDisposers: EffectDispose[];
  /** 从父节点摘除追踪子节点 */
  detachTracked: (n: Node) => void;
};

/**
 * 执行 insertReactive 轮次切换时的清理逻辑。
 */
export function runInsertReactiveIntrinsicVNodeCleanup(
  opts: InsertReactiveIntrinsicCleanupOptions,
): void {
  const {
    forceFullCleanup,
    getter,
    currentNodes,
    prevArrayVNodeKeys,
    childInsertDisposers,
    detachTracked,
  } = opts;

  if (forceFullCleanup) {
    for (let i = childInsertDisposers.length - 1; i >= 0; i--) {
      childInsertDisposers[i]!();
    }
    childInsertDisposers.length = 0;
    for (const n of currentNodes) {
      detachTracked(n);
    }
    currentNodes.length = 0;
    return;
  }

  let keepDomForPatch = false;
  if (childInsertDisposers.length === 0) {
    if (currentNodes.length === 1) {
      const root = currentNodes[0]!;
      /**
       * 预读必须在 {@link untrack} 中执行；**不可**把 `nextPeek` 交给紧随其后的 effect 体复用以省略
       * `readReactiveInsertRawFromGetter`，否则 getter 不在追踪上下文运行会**漏订阅**，破坏 细粒度更新。
       * 故单测里「每次依赖更新 getter 约 2 次」是预期行为，而非可简单缓存的冗余。
       */
      const nextPeek = untrack(() => readReactiveInsertRawFromGetter(getter));
      /**
       * 单 DOM 槽、下一轮为 **数组**（如 keyed 从 1 项增到多项）时须走数组保留判定；
       * 若仍只认 `isVNodeLike` 单根，会误判为不可 patch 而 detach，次帧只能整段重挂（丢失节点引用）。
       */
      if (Array.isArray(nextPeek)) {
        if (
          canKeepDomForInsertReactiveArrayPatch(
            currentNodes,
            nextPeek,
            prevArrayVNodeKeys,
          )
        ) {
          keepDomForPatch = true;
        }
      } else if (root.nodeType === 1) {
        /**
         * 单 `Text` 等非 Element 根且下一轮非数组时不再 peek，避免 onCleanup 多跑一次 getter。
         */
        if (isVNodeLike(nextPeek) && canPatchIntrinsic(root, nextPeek)) {
          keepDomForPatch = true;
        }
      }
    } else if (currentNodes.length >= 2) {
      const nextPeek = untrack(() => readReactiveInsertRawFromGetter(getter));
      if (
        canKeepDomForInsertReactiveArrayPatch(
          currentNodes,
          nextPeek,
          prevArrayVNodeKeys,
        )
      ) {
        keepDomForPatch = true;
      }
    }
  }

  if (keepDomForPatch) {
    childInsertDisposers.length = 0;
    return;
  }

  for (let i = childInsertDisposers.length - 1; i >= 0; i--) {
    childInsertDisposers[i]!();
  }
  childInsertDisposers.length = 0;
  for (const n of currentNodes) {
    detachTracked(n);
  }
  currentNodes.length = 0;
}
