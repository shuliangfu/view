/**
 * @module reactivity/selector
 * @description 选择器优化工具 - 优化列表选中状态等场景。
 *
 * **支持的功能：**
 * - ✅ createSelector() - 创建选择器
 * - ✅ 优化列表选中状态的计算
 * - ✅ 避免不必要的重复计算
 * - ✅ 自定义比较函数支持
 *
 * **核心机制：**
 * - 使用 Map 缓存每个 key 的 Signal
 * - 只有当 source 值变化且影响当前 key 时才更新
 * - 默认 `===` 比较器下仅更新「上一选中 / 当前选中」两键对应 Signal（O(1)）；自定义 `fn` 时全量扫描 subs
 * - `Object.is` 判定 source 未变时直接返回，避免无意义遍历
 * - 按需为访问过的 key 缓存 Signal；不在此用 onCleanup 删 key（调用方若在
 *   createRenderEffect 内读 isSelected，每次重跑会 cleanNode，误删 subs 会破坏订阅）
 * - ⚠️ 不得在 createEffect 之外调用 source()：组件在 insert 的 createEffect 内执行时，
 *   外层读取会误把「列表/页面」的 effect 订阅到 source，source 一变就整页重跑、新建
 *   createSelector（subs 为空），表现为 selectedId 有值但格子不高亮。
 *
 * **范围说明：**
 * - 面向「单选 id + 列表项」优化；多选/范围选需上层数据结构配合，非本 API 默认覆盖。
 *
 * @usage
 * const isSelected = createSelector(() => selectedId(), id => id === currentId)
 */

import { createSignal, Signal } from "./signal.ts";
import { createEffect } from "./effect.ts";

/**
 * 默认比较：`key === selected`（与常见 `id === selectedId()` 一致）。
 * 必须保持**引用稳定**，供 `createSelector` 识别并走 O(1) 更新路径（只动「旧选中 / 新选中」两路缓存）。
 */
function defaultSelectorCompare<T, U>(a: U, b: T): boolean {
  return (a as unknown) === b;
}

/**
 * 创建一个选择器。
 * 专门用于优化列表的选中状态。
 */
export function createSelector<T, U = T>(
  source: () => T,
  fn: (a: U, b: T) => boolean = defaultSelectorCompare,
): (key: U) => boolean {
  const subs = new Map<U, Signal<boolean>>();
  /** 仅由 createEffect 内写入；不在 effect 外调用 source()，避免订阅到外层 insert effect */
  let lastValue!: T;
  /** 首次 effect 内用 prev===value，避免对 subs 做一次无意义的全体 s.set */
  let hasSyncedSource = false;

  createEffect(() => {
    const value = source();
    const prev = hasSyncedSource ? lastValue : value;
    const hadPriorSync = hasSyncedSource;
    hasSyncedSource = true;
    // 与 createSignal 一致：source 实际未变则不必碰任何行级 Signal（大列表时避免 O(n)）
    if (hadPriorSync && Object.is(prev, value)) {
      lastValue = value;
      return;
    }
    lastValue = value;

    // 默认 `key === selected`：至多两行（旧选中键、新选中键）状态可能翻转，勿遍历整个 subs Map
    if (fn === defaultSelectorCompare) {
      const uPrev = prev as unknown as U;
      const uVal = value as unknown as U;
      const touch: U[] = [];
      if (subs.has(uPrev)) touch.push(uPrev);
      if (!Object.is(uPrev, uVal) && subs.has(uVal)) touch.push(uVal);
      for (let i = 0; i < touch.length; i++) {
        const key = touch[i]!;
        const s = subs.get(key)!;
        const wasSelected = fn(key, prev);
        const nowSelected = fn(key, value);
        if (wasSelected !== nowSelected) s.set(nowSelected);
      }
      return;
    }

    for (const [key, s] of subs) {
      const wasSelected = fn(key, prev);
      const nowSelected = fn(key, value);
      if (wasSelected !== nowSelected) {
        s.set(nowSelected);
      }
    }
  });

  return (key: U) => {
    let s = subs.get(key);
    if (!s) {
      s = createSignal(fn(key, lastValue));
      subs.set(key, s);
    }
    return s();
  };
}
