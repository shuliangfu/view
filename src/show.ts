/**
 * **`<Show>`**：按 `when` 的真假值在 **主内容与 `fallback`** 之间切换；
 * 与 {@link createMemo} 配合，返回无参 getter，供 `insertReactive(parent, () => Show(props)())` 使用。
 *
 * **与指令的关系**：显隐仍可用 **`vIf`**；`Show` 与 `vIf` 可并存，按项目习惯选用。
 * 手写 JSX 可写 **`when={flag}`**（传 `SignalRef`）；`when={flag.value}` 仅为首屏布尔快照，无法订阅。
 *
 * **未实现**：按 key 强制重挂载等选项（可后续扩展）。
 *
 * @module @dreamer/view/show
 */

import { createMemo } from "./effect.ts";
import type { SignalRef } from "./signal.ts";
import {
  isConditionFalsy,
  readWhenInput,
  resolveConditionalFallback,
  resolveTrueBranchChildren,
} from "./when-shared.ts";

/**
 * `when` 可为无参 accessor、`createSignal` 的 `SignalRef`（读 `.value`），或静态值。
 */
export type ShowWhenInput<T> = (() => T) | T | SignalRef<T>;

/**
 * {@link Show} 的 props：`when` / `fallback` 命名与常见控制流组件一致；`children` 可为 render prop、无参函数、或编译产物 `markMountFn`。
 */
export type ShowProps<T> = {
  /** 条件：无参 accessor、`SignalRef`（读 `.value`），或静态快照 */
  when: ShowWhenInput<T>;
  /**
   * 真分支：`(value) => …` 在 `when` 为真时传入窄化值；无参 `() => …` 在真分支内调用；
   * `markMountFn`（单参 DOM 挂载）整段展示，不当作 `(value)=>`。
   */
  children?: unknown;
  /** 假分支：无参函数或静态插入值 */
  fallback?: unknown;
};

/**
 * **`<Show when={…}>`**：返回 `() => unknown`，假分支走 `fallback`，真分支走 `children`。
 *
 * @param props - when / children / fallback
 * @returns 无参 getter，供 `insertReactive` 订阅
 */
export function Show<T>(props: ShowProps<T>): () => unknown {
  return createMemo(() => {
    const w = readWhenInput(props.when);
    if (isConditionFalsy(w)) {
      return props.fallback != null
        ? resolveConditionalFallback(props.fallback)
        : null;
    }
    return resolveTrueBranchChildren(w as T, props.children);
  });
}
