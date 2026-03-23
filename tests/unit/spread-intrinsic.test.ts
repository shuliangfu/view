/**
 * @fileoverview spreadIntrinsicProps：运行时展开 {...props}，覆盖 class、style、布尔属性、事件、对象 ref。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRef } from "@dreamer/view";
import {
  setIntrinsicDomAttribute,
  spreadIntrinsicProps,
} from "../../src/compiler/spread-intrinsic.ts";

describe("setIntrinsicDomAttribute", () => {
  it("null/undefined 应 removeAttribute，不写字面量 undefined", () => {
    const a = document.createElement("a");
    a.setAttribute("target", "_blank");
    setIntrinsicDomAttribute(a, "target", undefined);
    expect(a.hasAttribute("target")).toBe(false);
    a.setAttribute("target", "_blank");
    setIntrinsicDomAttribute(a, "target", null);
    expect(a.hasAttribute("target")).toBe(false);
  });

  it("普通字符串应 setAttribute", () => {
    const a = document.createElement("a");
    setIntrinsicDomAttribute(a, "target", "_blank");
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("空字符串应保留为显式空属性", () => {
    const a = document.createElement("a");
    setIntrinsicDomAttribute(a, "title", "");
    expect(a.getAttribute("title")).toBe("");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("spreadIntrinsicProps", () => {
  it("className 应落到 setAttribute('class')", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { className: "a b" });
    expect(el.getAttribute("class")).toBe("a b");
  });

  it("style 对象应合并到 el.style", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      style: { color: "red", marginTop: "2px" },
    } as Record<string, unknown>);
    expect(el.style.color).toBe("red");
    expect(el.style.marginTop).toBe("2px");
  });

  it("disabled: true 应设置元素属性", () => {
    const el = document.createElement("button");
    spreadIntrinsicProps(el, { disabled: true });
    expect((el as HTMLButtonElement).disabled).toBe(true);
  });

  it("disabled: false 经布尔分支应设为 false（!!val）", () => {
    const el = document.createElement("button");
    (el as HTMLButtonElement).disabled = true;
    spreadIntrinsicProps(el, { disabled: false });
    expect((el as HTMLButtonElement).disabled).toBe(false);
  });

  it("onClick 应 addEventListener('click')", () => {
    const el = document.createElement("button");
    let clicked = false;
    spreadIntrinsicProps(el, {
      onClick: () => {
        clicked = true;
      },
    });
    el.dispatchEvent(new Event("click", { bubbles: true }));
    expect(clicked).toBe(true);
  });

  it("后传入的键应覆盖先传入的同名键", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { id: "a" });
    spreadIntrinsicProps(el, { id: "b" });
    expect(el.getAttribute("id")).toBe("b");
  });

  it("ref 为 createRef 时应写入 .current", () => {
    const el = document.createElement("input");
    const r = createRef<HTMLInputElement>(null);
    spreadIntrinsicProps(el, { ref: r });
    expect(r.current).toBe(el);
  });

  it("props 为 null/undefined 应 no-op", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, null);
    spreadIntrinsicProps(el, undefined);
    expect(el.attributes.length).toBe(0);
  });

  it("嵌套对象（非 style）应跳过，避免把 signal 等当属性写出", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { custom: { nested: 1 } as unknown });
    expect(el.hasAttribute("custom")).toBe(false);
  });
}, { sanitizeOps: false, sanitizeResources: false });
