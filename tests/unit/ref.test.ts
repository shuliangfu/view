/**
 * @fileoverview createRef：ref.current 经内部 signal，effect 内读 current 可在编译器赋值后重跑
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createRef } from "@dreamer/view";

describe("createRef (DOM)", () => {
  it("setter 写入后 getter 应返回同一节点", () => {
    const ref = createRef<HTMLElement>();
    expect(ref.current).toBe(null);
    const fake = {} as HTMLElement;
    ref.current = fake;
    expect(ref.current).toBe(fake);
    ref.current = null;
    expect(ref.current).toBe(null);
  });

  it("createEffect 内读 ref.current 应在 ref.current 赋值后重新执行", async () => {
    const ref = createRef<HTMLElement>();
    let runs = 0;
    let last: HTMLElement | null | undefined;
    createEffect(() => {
      runs++;
      last = ref.current;
    });
    expect(runs).toBe(1);
    expect(last).toBe(null);
    const el = {} as HTMLElement;
    ref.current = el;
    await Promise.resolve();
    expect(runs).toBe(2);
    expect(last).toBe(el);
    ref.current = null;
    await Promise.resolve();
    expect(runs).toBe(3);
    expect(last).toBe(null);
  });
});
