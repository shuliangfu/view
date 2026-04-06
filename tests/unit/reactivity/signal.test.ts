import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";

describe("reactivity/signal", () => {
  it("基础读写：应当支持元组解构 (Solid.js 风格)", () => {
    const [count, setCount] = createSignal(0);
    expect(count()).toBe(0);
    setCount(1);
    expect(count()).toBe(1);
  });

  it("超级信号：应当支持单对象函数调用 (Preact 风格)", () => {
    const count = createSignal(0);
    expect(count()).toBe(0);
    count(1); // setter
    expect(count()).toBe(1);
  });

  it("超级信号：应当支持 .value 属性访问 (Vue/Preact 风格)", () => {
    const count = createSignal(10);
    expect(count.value).toBe(10);
    count.value = 20;
    expect(count.value).toBe(20);
    expect(count()).toBe(20);
  });

  it("超级信号：应当支持 .set() 方法调用", () => {
    const count = createSignal(0);
    count.set(100);
    expect(count()).toBe(100);
  });

  it("函数式更新：应当基于旧值计算新值", () => {
    const count = createSignal(0);
    count.set((c) => c + 1);
    expect(count()).toBe(1);
    count((c) => c + 5);
    expect(count()).toBe(6);
  });

  it("值不变时不应触发更新", async () => {
    const count = createSignal(0);
    let triggerCount = 0;
    createEffect(() => {
      count();
      triggerCount++;
    });

    expect(triggerCount).toBe(1);
    count.set(0); // 值没变
    await Promise.resolve();
    expect(triggerCount).toBe(1);

    count.set(1); // 值变了
    await Promise.resolve();
    expect(triggerCount).toBe(2);
  });
});
