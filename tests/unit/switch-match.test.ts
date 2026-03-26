/**
 * @fileoverview `Switch` / `Match`：短路分支、fallback、与 `when` accessor
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";
import { Switch } from "@dreamer/view/switch-match";

describe("Switch", () => {
  /**
   * 首个 `when` 为真即采用该分支，不继续求值后续 `when`（与同类方案 短路一致）。
   */
  it("应按顺序命中首个真分支", () => {
    const g = Switch({
      matches: [
        { when: () => false, children: () => "a" },
        { when: () => true, children: () => "b" },
        { when: () => true, children: () => "c" },
      ],
    });
    expect(g()).toBe("b");
  });

  /**
   * 全假时走 `fallback`；无 fallback 时为 `null`。
   */
  it("全假时应走 fallback", () => {
    const g = Switch({
      matches: [{ when: () => false, children: () => "x" }],
      fallback: () => "fb",
    });
    expect(g()).toBe("fb");
  });

  /**
   * `(v)=>` 分支应收到窄化后的 `when` 结果。
   */
  it("真分支单参 children 应收到 when 值", () => {
    const g = Switch({
      matches: [
        {
          when: () => "ok" as string | false,
          children: (s: string) => `got:${s}`,
        },
      ],
    });
    expect(g()).toBe("got:ok");
  });

  /**
   * `when` 内读 signal 时，memo 订阅应驱动外层 effect 更新。
   */
  it("when 随 signal 变化时应切换分支", async () => {
    const mode = createSignal<"a" | "b">("a");
    const g = Switch({
      matches: [
        { when: () => mode.value === "a", children: () => "A" },
        { when: () => mode.value === "b", children: () => "B" },
      ],
      fallback: () => "Z",
    });
    const snaps: unknown[] = [];
    createEffect(() => {
      snaps.push(g());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(snaps.at(-1)).toBe("A");
    mode.value = "b";
    await Promise.resolve();
    await Promise.resolve();
    expect(snaps.at(-1)).toBe("B");
  });
});
