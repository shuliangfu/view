/**
 * @module runtime/portal
 * @description 命令式 Portal：`createPortal(render, container)` 将子树挂到任意 DOM 容器（弹窗/toast 等）。
 * 与 {@link Portal} 组件互补：本模块适合在 effect/store 中按条件挂载/卸载；声明式场景优先用 `Portal`。
 */

import { createEffect } from "../reactivity/effect.ts";
import { createRoot } from "../reactivity/owner.ts";
import type { InsertCurrent, JSXRenderable } from "../types.ts";
import { insert } from "./insert.ts";

/**
 * {@link createPortal} 返回的根句柄：`unmount` 清空插入并释放 Owner。
 */
export type CreatePortalRoot = { unmount: () => void };

/**
 * 命令式 Portal：在 `container` 内对 `render()` 建立 effect，随响应式更新子树。
 * @param render 返回可插入内容的函数
 * @param container 目标 DOM 节点
 * @returns `{ unmount }` 用于拆除传送门
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
