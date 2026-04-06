import { describe, expect, it } from "@dreamer/test";
import { batch, createEffect, createSignal } from "@dreamer/view";

describe("scheduler/batch", () => {
  it("批处理：应当合并多次更新并在最后一次性触发", async () => {
    const [count, setCount] = createSignal(0);
    let runCount = 0;

    createEffect(() => {
      count();
      runCount++;
    });

    // 初始执行一次
    expect(runCount).toBe(1);

    // 在 batch 中多次更新
    batch(() => {
      setCount(1);
      setCount(2);
      setCount(3);
      // batch 内部还未触发
      expect(runCount).toBe(1);
    });

    // batch 结束同步执行一次 flush
    expect(runCount).toBe(2);
    expect(count()).toBe(3);
  });

  it("自动批处理：非 batch 环境下的多次更新应当由微任务合并", async () => {
    const [count, setCount] = createSignal(0);
    let runCount = 0;

    createEffect(() => {
      count();
      runCount++;
    });

    expect(runCount).toBe(1);

    // 连续三次设置
    setCount(1);
    setCount(2);
    setCount(3);

    // 由于是微任务异步，此时还没执行
    expect(runCount).toBe(1);

    // 等待微任务
    await Promise.resolve();

    // 三次更新合并为一次
    expect(runCount).toBe(2);
    expect(count()).toBe(3);
  });
});
