import { describe, expect, it } from "@dreamer/test";
import { createMemo, createSignal } from "@dreamer/view";

describe("reactivity/memo", () => {
  it("基础派生：应当正确计算并缓存结果", () => {
    const [count, setCount] = createSignal(1);
    let computeCount = 0;

    const double = createMemo(() => {
      computeCount++;
      return count() * 2;
    });

    expect(double()).toBe(2);
    expect(computeCount).toBe(1);

    // 多次读取应当使用缓存
    expect(double()).toBe(2);
    expect(computeCount).toBe(1);

    setCount(2);
    expect(double()).toBe(4);
    expect(computeCount).toBe(2);
  });

  it("无依赖读取：不应触发重新计算", () => {
    const double = createMemo(() => 10 * 2);
    expect(double()).toBe(20);
    expect(double()).toBe(20);
  });

  it("钻石依赖 (Diamond Problem)：不应发生冗余计算", async () => {
    let computeCount = 0;
    const [s, setS] = createSignal(0);

    // m1 -> s
    // m2 -> s
    // m3 -> m1, m2
    const m1 = createMemo(() => s() + 1);
    const m2 = createMemo(() => s() + 2);
    const m3 = createMemo(() => {
      computeCount++;
      return m1() + m2();
    });

    expect(m3()).toBe(3);
    expect(computeCount).toBe(1);

    setS(1);
    // m1 和 m2 现在应该处于 CHECK 状态（或 DIRTY 如果 signal 立即通知）
    // 我们的通知系统：Signal 改变 -> m1 (DIRTY), m2 (DIRTY) -> m3 (CHECK)

    expect(m3()).toBe(5);
    expect(computeCount).toBe(2); // 应该只在 m3() 读取时运行一次，而不是冗余
  });
});
