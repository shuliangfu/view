/**
 * **条件分支** 共用逻辑：`when` 读取、`fallback` 解析、真假值判定、
 * 真分支 `children`（含 `markMountFn` / `(v)=>` / `()=>`）。
 *
 * 供 {@link Show}、{@link Switch} 等控制流复用，避免分叉语义。
 *
 * @module @dreamer/view/when-shared
 * @internal 实现细节；对外 API 仍以各控制流模块为准
 */

import { isMountFn } from "./compiler/mount-fn.ts";
import { isSignalRef, type SignalRef } from "./signal.ts";

/**
 * 读取 `when` / `component` 等控制流输入：
 * - {@link isSignalRef}：读 `.value`（在 memo/effect 内会登记依赖），手写 JSX 可写 `when={flag}` 而无需 `() => flag.value`；
 * - 无参函数：调用一次；
 * - 其余：视为静态快照（**注意**：`when={flag.value}` 在 JSX 里已先求值，无法随 signal 更新）。
 *
 * @param when - 条件、组件描述、或 `createSignal` 返回的容器
 */
export function readWhenInput<T>(when: (() => T) | T | SignalRef<T>): T {
  if (isSignalRef(when)) {
    return when.value;
  }
  if (typeof when === "function" && (when as () => unknown).length === 0) {
    return (when as () => T)();
  }
  return when as T;
}

/**
 * 解析 `fallback`：无参函数则调用。
 *
 * @param fb - fallback 值或零参 getter
 */
export function resolveConditionalFallback(fb: unknown): unknown {
  if (typeof fb === "function" && (fb as () => unknown).length === 0) {
    return (fb as () => unknown)();
  }
  return fb;
}

/**
 * 与 JavaScript 真假值一致。
 *
 * @param v - 待判定值
 */
export function isConditionFalsy(v: unknown): boolean {
  return !v;
}

/**
 * 真分支内容：`markMountFn` 原样返回；`(v)=>` 传入窄化值；无参函数直接调用。
 *
 * @param w - 已求真的 `when` 值
 * @param ch - children（函数或静态）
 */
export function resolveTrueBranchChildren<T>(w: T, ch: unknown): unknown {
  if (typeof ch === "function") {
    const fn = ch as (a?: unknown) => unknown;
    if (isMountFn(ch as object)) {
      return ch;
    }
    if (fn.length >= 1) {
      return (fn as (value: T) => unknown)(w as T);
    }
    return (fn as () => unknown)();
  }
  return ch ?? null;
}
