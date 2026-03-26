/**
 * @fileoverview `For` / `Index`：mapArray + fallback 行为
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal, For, Index } from "@dreamer/view";

describe("For", () => {
  it("each 为 SignalRef 时应读 .value 并随列表更新", async () => {
    const items = createSignal<number[]>([1, 2]);
    const listGetter = For({
      each: items,
      children: (n) => n * 10,
    });
    const snapshots: unknown[][] = [];
    createEffect(() => {
      snapshots.push(listGetter());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)).toEqual([10, 20]);
    items.value = [3];
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)).toEqual([30]);
  });

  it("each 为 accessor 时应映射 children 并随列表更新", async () => {
    const items = createSignal<number[]>([1, 2]);
    const listGetter = For({
      each: () => items.value,
      children: (n) => n * 10,
    });
    const snapshots: unknown[][] = [];
    createEffect(() => {
      snapshots.push(listGetter());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)).toEqual([10, 20]);
    items.value = [3];
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)).toEqual([30]);
  });

  it("空列表且存在 fallback 时应返回单元素数组", () => {
    const listGetter = For({
      each: () => [] as number[],
      children: (n) => n,
      fallback: () => "empty",
    });
    expect(listGetter()).toEqual(["empty"]);
  });
});

describe("Index", () => {
  it("当前应与 For 同语义（按值映射）", () => {
    const g = Index({
      each: () => [7],
      children: (x) => x + 1,
    });
    expect(g()).toEqual([8]);
  });
});
