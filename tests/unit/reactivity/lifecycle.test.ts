import { describe, expect, it } from "@dreamer/test";
import { createSignal, onMount } from "@dreamer/view";

describe("reactivity/lifecycle", () => {
  it("onMount: 应当只执行一次且不收集依赖", async () => {
    let count = 0;
    const [s, setS] = createSignal(0);

    onMount(() => {
      count++;
      s(); // 应该不被追踪
    });

    expect(count).toBe(1);

    setS(1);
    await Promise.resolve();

    expect(count).toBe(1); // 不应再次触发
  });
});
