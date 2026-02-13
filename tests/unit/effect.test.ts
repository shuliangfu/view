/**
 * @fileoverview Effect 单元测试：createEffect、createMemo、onCleanup、调度与清理
 */

import { describe, expect, it } from "@dreamer/test";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "@dreamer/view";

describe("createEffect", () => {
  it("传入非函数时调用会抛错", () => {
    expect(() => createEffect(1 as unknown as () => void)).toThrow();
    expect(() => createEffect(null as unknown as () => void)).toThrow();
  });

  it("应立即执行一次", () => {
    let runs = 0;
    createEffect(() => {
      runs++;
    });
    expect(runs).toBe(1);
  });

  it("执行过程中读到的 signal 变更后应再次执行（微任务后）", async () => {
    const [get, set] = createSignal(0);
    let runs = 0;
    createEffect(() => {
      get();
      runs++;
    });
    expect(runs).toBe(1);
    set(1);
    await Promise.resolve(); // 等待微任务
    expect(runs).toBe(2);
    set(2);
    await Promise.resolve();
    expect(runs).toBe(3);
  });

  it("返回的 dispose 调用后应不再执行", async () => {
    const [get, set] = createSignal(0);
    let runs = 0;
    const dispose = createEffect(() => {
      get();
      runs++;
    });
    expect(runs).toBe(1);
    dispose();
    set(1);
    await Promise.resolve();
    expect(runs).toBe(1);
  });

  it("effect 返回清理函数时应在下次运行前或 dispose 时调用", async () => {
    const [get, set] = createSignal(0);
    let cleaned = 0;
    createEffect(() => {
      get();
      return () => {
        cleaned++;
      };
    });
    expect(cleaned).toBe(0);
    set(1);
    await Promise.resolve();
    expect(cleaned).toBe(1);
  });

  it("onCleanup 在 effect 内登记的函数应在下次运行前执行", async () => {
    const [get, set] = createSignal(0);
    let cleaned = 0;
    createEffect(() => {
      get();
      onCleanup(() => {
        cleaned++;
      });
    });
    expect(cleaned).toBe(0);
    set(1);
    await Promise.resolve();
    expect(cleaned).toBe(1);
  });

  it("边界：effect 回调抛错时错误向上抛出，且不拖垮此前已运行的 effect", () => {
    const [get] = createSignal(0);
    let otherRuns = 0;
    // 先创建并运行一个 effect，确认其已执行
    createEffect(() => {
      get();
      otherRuns++;
    });
    expect(otherRuns).toBe(1);
    // 再创建会抛错的 effect，错误应从 createEffect 向上抛出
    expect(() => {
      createEffect(() => {
        get();
        throw new Error("effect throw");
      });
    }).toThrow("effect throw");
    // 抛错后，此前已运行的 effect 的副作用（otherRuns）未被拖垮，仍为 1
    expect(otherRuns).toBe(1);
  });
});

describe("createMemo", () => {
  it("传入非函数时调用会抛错", () => {
    expect(() => createMemo(1 as unknown as () => number)).toThrow();
    expect(() => createMemo(null as unknown as () => number)).toThrow();
  });

  it("应返回 getter，内部 effect 运行后首次调用返回计算值", () => {
    let computed = 0;
    const [get] = createSignal(1);
    const getMemo = createMemo(() => {
      computed++;
      return get() * 2;
    });
    // createMemo 内部 createEffect 会立即执行一次，故 computed 已为 1
    expect(getMemo()).toBe(2);
    expect(computed).toBe(1);
  });

  it("依赖的 signal 未变时再次调用应返回缓存值", () => {
    let computed = 0;
    const [get] = createSignal(1);
    const getMemo = createMemo(() => {
      computed++;
      return get() * 2;
    });
    getMemo();
    getMemo();
    expect(computed).toBe(1);
  });

  it("依赖的 signal 变更后再次调用应重新计算", async () => {
    const [get, set] = createSignal(1);
    const getMemo = createMemo(() => get() * 2);
    expect(getMemo()).toBe(2);
    set(2);
    await Promise.resolve(); // 等待 memo 的 effect 调度
    expect(getMemo()).toBe(4);
  });

  it("在 effect 中读取 memo 时，memo 依赖变化应触发 effect", async () => {
    const [get, set] = createSignal(1);
    const getMemo = createMemo(() => get() + 10);
    let effectRuns = 0;
    let lastValue: number | undefined;
    createEffect(() => {
      lastValue = getMemo();
      effectRuns++;
    });
    expect(effectRuns).toBe(1);
    expect(lastValue).toBe(11);
    set(2);
    // 需两次微任务：先执行 memo 内部 effect 更新 memo 信号，再执行本 effect（依赖 memo 信号）
    await Promise.resolve();
    await Promise.resolve();
    expect(effectRuns).toBe(2);
    expect(lastValue).toBe(12);
  });

  it("边界：createMemo 返回 undefined 时 getter() 为 undefined，下游不抛", () => {
    const getMemo = createMemo((): number | undefined => undefined);
    expect(getMemo()).toBeUndefined();
  });

  it("边界：createMemo 返回 null 时 getter() 为 null", () => {
    const getMemo = createMemo((): string | null => null);
    expect(getMemo()).toBeNull();
  });
});
