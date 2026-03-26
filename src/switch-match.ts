/**
 * **`<Switch>` / `<Match>`**：按顺序求值各 `Match.when`，**首个**为真时渲染对应 `children`；
 * 否则走 `fallback`。与 {@link createMemo} 配合返回无参 getter，供 `insertReactive` 订阅。
 *
 * **JSX**：须由 **`compileSource`** 将 `<Match>` 子节点展开为 `matches` 数组；运行时 {@link Match} 仅为占位，勿单独使用。
 *
 * **与 `Show` 的关系**：多路分支用 `Switch`+`Match`，单路二值用 {@link Show} 或 `vIf`。
 *
 * @module @dreamer/view/switch-match
 */

import { createMemo } from "./effect.ts";
import type { ShowWhenInput } from "./show.ts";
import {
  isConditionFalsy,
  readWhenInput,
  resolveConditionalFallback,
  resolveTrueBranchChildren,
} from "./when-shared.ts";

/**
 * 单条分支：与编译产物中 `matches` 数组元素一致。
 */
export type SwitchMatchCase<T = unknown> = {
  /** 条件；无参函数时在 {@link Switch} 的 memo 内调用以收集依赖 */
  when: ShowWhenInput<T>;
  /** 真分支：同 {@link ShowProps.children} */
  children?: unknown;
};

/**
 * {@link Switch} 的 props：`matches` 由编译器从子级 `<Match>` 生成。
 */
export type SwitchProps = {
  /** 顺序匹配的分支列表 */
  matches: SwitchMatchCase[];
  /** 无分支命中时 */
  fallback?: unknown;
};

/**
 * **`Match`**：类型与 IDE 提示用；编译后不应留在调用栈。
 *
 * @param _props - when / children（由编译器拆入 `matches`）
 * @returns 未编译时不应使用；返回 `undefined` 仅占位
 */
export function Match<T = unknown>(_props: {
  when: ShowWhenInput<T>;
  children?: unknown;
}): undefined {
  void _props;
  return undefined;
}

/**
 * **`Switch`**：短路求值各 `when`，首个真分支渲染其 `children`，否则 `fallback`。
 *
 * @param props - matches / fallback
 * @returns 无参 getter
 */
export function Switch(props: SwitchProps): () => unknown {
  return createMemo(() => {
    for (const m of props.matches) {
      const w = readWhenInput(m.when);
      if (!isConditionFalsy(w)) {
        return resolveTrueBranchChildren(w, m.children);
      }
    }
    return props.fallback != null
      ? resolveConditionalFallback(props.fallback)
      : null;
  });
}
