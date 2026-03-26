/**
 * `insertReactive` 嵌套 dispose 收集栈。
 *
 * 外层 `insertReactive` 的 effect 重跑前会 detach 其 `currentNodes`，但不会自动取消子树内
 * 同步创建的子 `insertReactive` effect；子 effect 仍订阅 signal 时会在下一轮向父节点再次 append，
 * 表现为双表单等重复 DOM（compileSource + VNode 子树内文本插值与外层同读一 signal 时）。
 *
 * 规则：每个 `insertReactive` 在 `createEffect` 回调的 try 内 push 收集桶，同步挂载阶段内
 *  deeper `insertReactive` 返回的 dispose 记入该桶；回调 finally 时 pop。effect 的 `onCleanup`
 * 中先逆序 dispose 子 `insertReactive`，再 detach 本层 `currentNodes`。
 *
 * @module @dreamer/view/compiler/ir-nested
 * @internal
 */

import type { EffectDispose } from "../types.ts";

/** 当前同步挂载栈：每层对应一个「父 insertReactive」本轮 run 的子 dispose 列表 */
const stack: EffectDispose[][] = [];

/**
 * 进入 `insertReactive` 的 effect 回调体时调用，与 {@link endInsertReactiveChildCollect} 成对。
 *
 * @param bucket - 本轮用于收集子 dispose 的数组（与 onCleanup 闭包共用同一引用）
 */
export function beginInsertReactiveChildCollect(
  bucket: EffectDispose[],
): void {
  stack.push(bucket);
}

/**
 * 离开 effect 回调体（finally）时弹出栈帧，避免与外层 insertReactive 串桶。
 */
export function endInsertReactiveChildCollect(): void {
  stack.pop();
}

/**
 * 将内层 `insertReactive` 返回的 dispose 登记到当前正在执行的父层收集桶。
 * 须在子 `createEffect` 完成同步首跑、`insertReactive` 即将 return 时调用；
 * 此时子层已 finally pop，栈顶为父层 bucket。
 *
 * @param dispose - `insertReactive` 的返回值
 */
export function registerChildInsertReactiveDispose(
  dispose: EffectDispose,
): void {
  const top = stack[stack.length - 1];
  if (top) top.push(dispose);
}
