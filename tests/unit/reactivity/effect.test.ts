import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";

describe("reactivity/effect", () => {
  it("基础响应：应当在 Signal 变化时重新执行", async () => {
    const [count, setCount] = createSignal(0);
    let result = 0;

    createEffect(() => {
      result = count();
    });

    expect(result).toBe(0);
    setCount(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(result).toBe(1);
    setCount(10);
    await Promise.resolve();
    await Promise.resolve();
    expect(result).toBe(10);
  });

  it("多依赖：应当在任意依赖 Signal 变化时重新执行", async () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let sum = 0;

    createEffect(() => {
      sum = a() + b();
    });

    expect(sum).toBe(3);
    setA(10);
    await Promise.resolve();
    await Promise.resolve();
    expect(sum).toBe(12);
    setB(20);
    await Promise.resolve();
    await Promise.resolve();
    expect(sum).toBe(30);
  });

  it("嵌套 Effect 与清理：应当自动管理子 Effect 的生命周期", async () => {
    const [show, setShow] = createSignal(true);
    let innerCallCount = 0;

    createEffect(() => {
      if (show()) {
        createEffect(() => {
          innerCallCount++;
        });
      }
    });

    expect(innerCallCount).toBe(1);
    setShow(false);
    await Promise.resolve();
    // 外层 Effect 重新执行前，内层 Effect 会被清理
    expect(innerCallCount).toBe(1);
    setShow(true);
    await Promise.resolve();
    expect(innerCallCount).toBe(2);
  });
});
