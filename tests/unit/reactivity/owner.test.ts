import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal, onCleanup } from "@dreamer/view";

describe("reactivity/owner", () => {
  it("onCleanup：应当在 Effect 重新执行前触发", async () => {
    const [count, setCount] = createSignal(0);
    let cleanupCount = 0;

    createEffect(() => {
      count();
      onCleanup(() => {
        cleanupCount++;
      });
    });

    expect(cleanupCount).toBe(0);
    setCount(1); // 触发重新执行，先清理前一次
    await Promise.resolve();
    expect(cleanupCount).toBe(1);
    setCount(2); // 再次触发
    await Promise.resolve();
    expect(cleanupCount).toBe(2);
  });

  it("清理链：嵌套 Effect 销毁时应当销毁子清理函数", async () => {
    const [show, setShow] = createSignal(true);
    let innerCleanupCount = 0;

    createEffect(() => {
      if (show()) {
        createEffect(() => {
          onCleanup(() => {
            innerCleanupCount++;
          });
        });
      }
    });

    expect(innerCleanupCount).toBe(0);
    setShow(false); // 外层重建，内层销毁
    await Promise.resolve();
    expect(innerCleanupCount).toBe(1);
    setShow(true);
    await Promise.resolve();
    expect(innerCleanupCount).toBe(1);
  });
});
