/**
 * **占位替换插入**：在真实父节点下用 `createEffect` 将 `getter()` 的 DOM 结果替换某一占位节点（如 `Comment`），并随响应式依赖更新。
 *
 * 用于 Fragment 内动态片段等场景，避免多余包裹元素；一般业务更多使用编译器生成的 `insert` / `insertReactive`。
 *
 * @module @dreamer/view/insert-replacing
 * @packageDocumentation
 *
 * **导出：** `insertReplacing`
 */

import { createEffect } from "../effect.ts";
import { unwrapSignalGetterValue } from "../signal.ts";
import { getActiveDocument } from "./active-document.ts";
import type { EffectDispose } from "../types.ts";
import type { InsertValue } from "./insert.ts";
import { valueToNode } from "./to-node.ts";

/** 复用 compiler 内共享的 valueToNode（2.1 收敛） */
function toNode(value: InsertValue): Node {
  return valueToNode(
    value as import("./to-node.ts").ValueToNodeInput,
    getActiveDocument(),
  );
}

/**
 * 在父节点内用 getter 的产出替换占位节点，并随 getter 更新。
 * 用于 Fragment 内 getter 在挂到真实容器后绑定，不产生额外 span。
 *
 * @param parent - 真实父节点（Element）
 * @param placeholder - 占位节点（如 Comment），将被替换为 getter() 的产出
 * @param getter - 返回 string | number | Node | null | undefined
 * @returns effect 的 dispose，供卸载时清理
 */
export function insertReplacing(
  parent: Node,
  placeholder: Node,
  getter: () => InsertValue,
): EffectDispose {
  let current: Node = placeholder;
  return createEffect(() => {
    const next = toNode(
      unwrapSignalGetterValue(getter()) as InsertValue,
    );
    if (current.parentNode === parent) {
      parent.replaceChild(next, current);
    } else {
      parent.appendChild(next);
    }
    current = next;
  });
}
