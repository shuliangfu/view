/**
 * **`mapArray`** 向（简化版）：对响应式列表做 {@link createMemo}，仅在**列表源**（引用或 `coalesce` 后长度/内容变化）重算映射结果。
 * 与 {@link insertIrList}、`insertReactive` 数组分支配合：将本函数返回的 getter 求值结果作为子项数组传入。
 *
 * **与同类方案 完整 `mapArray` 的差异**：不按行做独立细粒度依赖；若某行内需追踪 signal，请在 `mapFn` 中返回带 `insertReactive` 的 MountFn 或子 VNode 树。
 *
 * @module @dreamer/view/map-array
 */

import { coalesceIrList } from "./compiler/ir-coerce.ts";
import { createMemo } from "./effect.ts";

/**
 * 对 `list()` 规范为数组后的每一项调用 `mapFn`，缓存结果为只读 getter（`mapArray` 同向的常用子集）。
 *
 * @param list - 返回列表或 `null`/`undefined`（视为 `[]`，与 `list() ?? []` 一致）
 * @param mapFn - `(item, index)` → 行产物（VNode、`(p)=>void` 等，与 `insertReactive` 数组项一致）
 * @returns 无参 getter，读时订阅 `list` 内响应式依赖
 */
export function mapArray<T, R>(
  list: () => readonly T[] | null | undefined,
  mapFn: (item: T, index: number) => R,
): () => R[] {
  return createMemo(() => {
    const items = coalesceIrList(list()) as readonly T[];
    const out: R[] = [];
    for (let i = 0; i < items.length; i++) {
      out.push(mapFn(items[i] as T, i));
    }
    return out;
  });
}
