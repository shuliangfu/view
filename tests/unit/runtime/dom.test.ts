/**
 * @fileoverview `getDocument` / `createRef` 与 ref 对象形态。
 */
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRef, getDocument } from "@dreamer/view";

describe("runtime/dom", () => {
  it("getDocument：在已注入 document 的测试环境下应返回 Document", () => {
    const d = getDocument();
    expect(d).not.toBeNull();
    expect(d?.nodeType).toBe(9);
  });

  it("createRef：应返回带 current 字段的对象且可写入", () => {
    const r = createRef<HTMLDivElement | null>(null);
    expect(r).toEqual({ current: null });
    const el = document.createElement("div");
    r.current = el;
    expect(r.current).toBe(el);
  });

  it("createRef：可传入初始非 null 值", () => {
    const el = document.createElement("span");
    const r = createRef(el);
    expect(r.current).toBe(el);
  });
});
