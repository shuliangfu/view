/**
 * @module runtime/portal
 * @description 命令式 Portal：`createPortal(render, container)` 将子树挂到任意 DOM 容器（弹窗/toast 等）。
 * 与 {@link Portal} 组件互补：本模块适合在 effect/store 中按条件挂载/卸载；声明式场景优先用 `Portal`。
 */

import { createEffect } from "../reactivity/effect.ts";
import { createRoot } from "../reactivity/owner.ts";
import type { InsertCurrent, JSXRenderable } from "../types.ts";
import { insert } from "./insert.ts";

export type CreatePortalRoot = { unmount: () => void };

/**
 * 在 `container` 内响应式插入 `render()` 的返回值；返回带 `unmount` 的根句柄。
 */
export function createPortal(
  render: () => JSXRenderable,
  container: Node,
): CreatePortalRoot {
  return createRoot((disposeRoot) => {
    let current: InsertCurrent;
    createEffect(() => {
      current = insert(container, render(), current);
    });
    return {
      unmount: () => {
        insert(container, null, current);
        disposeRoot();
      },
    };
  });
}
