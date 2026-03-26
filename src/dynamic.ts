/**
 * **`<Dynamic component={…}>`**：按 `component`（函数组件或本征标签名字符串）切换渲染，
 * 其余 props（含 `children`）合并后传给当前 `component`。与 {@link createMemo} 配合返回无参 getter。
 *
 * **`component`**：无参 accessor、`SignalRef`（读 `.value`）时在 memo 内订阅；为字符串时用 {@link jsx} 生成本征 VNode；
 * 为函数时 `Fn(mergeProps(rest))`。`component={ref.value}` 仅为快照，应写 **`component={ref}`** 或 **`() => ref.value`**。
 *
 * @module @dreamer/view/dynamic
 */

import { isMountFn } from "./compiler/mount-fn.ts";
import { mergeProps, splitProps } from "./compiler/props.ts";
import { createMemo } from "./effect.ts";
import { jsx } from "./jsx-runtime.ts";
import { readWhenInput } from "./when-shared.ts";
import { isSignalGetter } from "./signal.ts";

/**
 * {@link Dynamic} 的 props：`component` 由编译器包成 accessor；其余键透传子组件/本征元素。
 */
export type DynamicProps = Record<string, unknown> & {
  /** 组件函数、本征标签名，或无参 getter */
  component?: unknown;
  children?: unknown;
};

/**
 * **`Dynamic`**：解析 `component` 并渲染；`splitProps` 剥离 `component` 后将其余并入子渲染。
 *
 * @param props - 含 `component` 及待转发 props
 * @returns 无参 getter，供 `insertReactive` 使用
 */
export function Dynamic(props: DynamicProps): () => unknown {
  return createMemo(() => {
    const C = readWhenInput(
      props.component as (() => unknown) | unknown,
    );
    const [, forward] = splitProps(props as Record<string, unknown>, [
      "component",
    ]);
    const childProps = mergeProps(forward) as Record<string, unknown>;

    if (C == null || C === false) {
      return null;
    }
    if (typeof C === "string") {
      return jsx(C, childProps);
    }
    if (typeof C === "function") {
      const fn = C as (...args: unknown[]) => unknown;
      /**
       * `markMountFn` / 单参 DOM 挂载箭头须整段返回，不可当 `(props) => VNode` 调用（与编译器对组件返回值判定同向）。
       */
      if (isMountFn(C as object)) {
        return C;
      }
      if (fn.length === 1 && !isSignalGetter(C as object)) {
        return C;
      }
      return (C as (p: Record<string, unknown>) => unknown)(childProps);
    }
    return null;
  });
}
