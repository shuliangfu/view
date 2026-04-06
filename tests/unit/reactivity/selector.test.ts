import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSelector, createSignal } from "@dreamer/view";

describe("reactivity/selector", () => {
  it("基础选择：应当只通知变化的项", async () => {
    const [selected, setSelected] = createSignal(1);
    const isSelected = createSelector(selected);

    let item1Selected = false;
    let item2Selected = false;
    let item1UpdateCount = 0;
    let item2UpdateCount = 0;

    createEffect(() => {
      item1Selected = isSelected(1);
      item1UpdateCount++;
    });

    createEffect(() => {
      item2Selected = isSelected(2);
      item2UpdateCount++;
    });

    expect(item1Selected).toBe(true);
    expect(item2Selected).toBe(false);
    expect(item1UpdateCount).toBe(1);
    expect(item2UpdateCount).toBe(1);

    // 切换选中项到 2
    setSelected(2);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(item1Selected).toBe(false);
    expect(item2Selected).toBe(true);
    expect(item1UpdateCount).toBe(2);
    expect(item2UpdateCount).toBe(2);

    // 再次切换到 3
    setSelected(3);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(item1Selected).toBe(false);
    expect(item2Selected).toBe(false);
    expect(item1UpdateCount).toBe(2); // item1 没变（一直是 false），不应触发
    expect(item2UpdateCount).toBe(3); // item2 从 true 变 false，应当触发
  });

  /**
   * 自定义比较：必须仍能正确更新所有受影响的缓存行（不能走默认比较器的双键快路径）。
   */
  it("自定义比较函数：应在相关 key 上正确翻转", async () => {
    const [sel, setSel] = createSignal(0);
    const isNeighbor = createSelector(
      sel,
      (key: number, center: number) => Math.abs(key - center) <= 1,
    );

    let n0 = 0;
    let n2 = 0;
    createEffect(() => {
      isNeighbor(0);
      n0++;
    });
    createEffect(() => {
      isNeighbor(2);
      n2++;
    });

    expect(isNeighbor(0)).toBe(true);
    expect(isNeighbor(2)).toBe(false);

    setSel(2);
    await Promise.resolve();
    await Promise.resolve();

    expect(isNeighbor(0)).toBe(false);
    expect(isNeighbor(2)).toBe(true);
    expect(n0).toBe(2);
    expect(n2).toBe(2);
  });
}, { sanitizeOps: false, sanitizeResources: false });
