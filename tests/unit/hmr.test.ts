/**
 * @fileoverview HMR 细粒度更新单元测试：getHmrVersionGetter、__VIEW_HMR_BUMP__
 */

import { describe, expect, it } from "@dreamer/test";
import { getHmrVersionGetter } from "../../src/hmr.ts";

describe("hmr (getHmrVersionGetter / __VIEW_HMR_BUMP__)", () => {
  it("getHmrVersionGetter 返回函数，该函数返回数字", () => {
    const getter = getHmrVersionGetter();
    expect(typeof getter).toBe("function");
    const v = getter();
    expect(typeof v).toBe("number");
  });

  it("调用 __VIEW_HMR_BUMP__ 后 getter 返回值递增", () => {
    const getter = getHmrVersionGetter();
    const before = getter();
    const bump = (globalThis as unknown as { __VIEW_HMR_BUMP__?: () => void }).__VIEW_HMR_BUMP__;
    expect(typeof bump).toBe("function");
    bump!();
    expect(getter()).toBe(before + 1);
    bump!();
    expect(getter()).toBe(before + 2);
  });
});
