/**
 * @fileoverview spreadIntrinsicProps / 辅助函数单测。
 * 手写 VNode 路径的 {@link applyIntrinsicVNodeProps} 与 spread 逻辑对齐但未在此文件直接测，以 mountVNodeTree 集成测为准。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRef } from "@dreamer/view";
import {
  dataAttributeStringValue,
  domAttributeNameFromPropKey,
  eventBindingFromOnProp,
  eventNameFromOnProp,
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

  it("onclick（小写）应绑定 click", () => {
    const el = document.createElement("button");
    let clicked = false;
    spreadIntrinsicProps(el, {
      onclick: () => {
        clicked = true;
      },
    } as Record<string, unknown>);
    el.dispatchEvent(new Event("click", { bubbles: true }));
    expect(clicked).toBe(true);
  });

  it("data-* 对象应 JSON.stringify 写入", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      "data-state": { a: 1, b: "x" },
    } as Record<string, unknown>);
    expect(el.getAttribute("data-state")).toBe(`{"a":1,"b":"x"}`);
  });

  it("data-* 数组应 JSON 写入", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      "data-ids": [1, 2, 3],
    } as Record<string, unknown>);
    expect(el.getAttribute("data-ids")).toBe("[1,2,3]");
  });

  it("非 data 的数组属性应 String 序列化", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      join: ["a", "b"],
    } as Record<string, unknown>);
    expect(el.getAttribute("join")).toBe("a,b");
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

  it("嵌套对象（非 style、非 data-*）应跳过，避免把 signal 等当属性写出", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { custom: { nested: 1 } as unknown });
    expect(el.hasAttribute("custom")).toBe(false);
  });

  it("ariaLabel 应写成 aria-label", () => {
    const el = document.createElement("button");
    spreadIntrinsicProps(el, {
      ariaLabel: "关闭",
    } as Record<string, unknown>);
    expect(el.getAttribute("aria-label")).toBe("关闭");
  });

  it("tabIndex 应写成 tabindex", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { tabIndex: 0 } as Record<string, unknown>);
    expect(el.getAttribute("tabindex")).toBe("0");
  });

  it("className 为数组应空格拼接", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      className: ["a", "", "b"],
    } as Record<string, unknown>);
    expect(el.getAttribute("class")).toBe("a b");
  });

  it("Date 应写成 ISO 字符串", () => {
    const el = document.createElement("div");
    const d = new Date("2020-01-02T03:04:05.000Z");
    spreadIntrinsicProps(el, { "data-t": d } as Record<string, unknown>);
    expect(el.getAttribute("data-t")).toBe(d.toISOString());
  });

  it("dangerouslySetInnerHTML 应写入 innerHTML", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      dangerouslySetInnerHTML: { __html: "<span>hi</span>" },
    } as Record<string, unknown>);
    expect(el.innerHTML).toBe("<span>hi</span>");
  });

  it("dangerouslySetInnerHTML 的 __html 非 string 时不改 innerHTML", () => {
    const el = document.createElement("div");
    el.textContent = "keep";
    spreadIntrinsicProps(el, {
      dangerouslySetInnerHTML: { __html: 1 as unknown as string },
    } as Record<string, unknown>);
    expect(el.textContent).toBe("keep");
  });

  it("children / key 不写 DOM", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      children: "x",
      key: "k",
    } as Record<string, unknown>);
    expect(el.attributes.length).toBe(0);
  });

  it("值为 null 的键应跳过", () => {
    const el = document.createElement("div");
    el.setAttribute("id", "old");
    spreadIntrinsicProps(el, { id: null } as Record<string, unknown>);
    expect(el.getAttribute("id")).toBe("old");
  });

  it("ref 为函数时应传入元素", () => {
    const el = document.createElement("div");
    let seen: Element | null = null;
    spreadIntrinsicProps(el, {
      ref: (n: Element | null) => {
        seen = n;
      },
    });
    expect(seen).toBe(el);
  });

  it("htmlFor 应写成 for", () => {
    const el = document.createElement("label");
    spreadIntrinsicProps(el, { htmlFor: "fid" } as Record<string, unknown>);
    expect(el.getAttribute("for")).toBe("fid");
  });

  it("class 字符串应落到 class", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { class: "c1 c2" } as Record<string, unknown>);
    expect(el.getAttribute("class")).toBe("c1 c2");
  });

  it("class 为数组应空格拼接", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      class: ["x", "y"],
    } as Record<string, unknown>);
    expect(el.getAttribute("class")).toBe("x y");
  });

  it("checked: true 应作用到 checkbox input", () => {
    const el = document.createElement("input");
    el.setAttribute("type", "checkbox");
    spreadIntrinsicProps(el, { checked: true });
    expect((el as HTMLInputElement).checked).toBe(true);
  });

  it("readOnly: true 应作用到 text input", () => {
    const el = document.createElement("input");
    spreadIntrinsicProps(el, { readOnly: true });
    expect((el as HTMLInputElement).readOnly).toBe(true);
  });

  it("ariaHidden: true 应写 aria-hidden 空串属性", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { ariaHidden: true } as Record<string, unknown>);
    expect(el.getAttribute("aria-hidden")).toBe("");
  });

  it("ariaHidden: false 应不写 aria-hidden", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { ariaHidden: false } as Record<string, unknown>);
    expect(el.hasAttribute("aria-hidden")).toBe(false);
  });

  it("data-* 为函数时不写属性", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      "data-fn": () => {},
    } as Record<string, unknown>);
    expect(el.hasAttribute("data-fn")).toBe(false);
  });

  it("data-* 原始类型应 String 写入", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, {
      "data-n": 42,
      "data-s": "ok",
    } as Record<string, unknown>);
    expect(el.getAttribute("data-n")).toBe("42");
    expect(el.getAttribute("data-s")).toBe("ok");
  });

  it("非 data 的 Date 属性应 toISOString", () => {
    const el = document.createElement("div");
    const d = new Date("2019-06-01T00:00:00.000Z");
    spreadIntrinsicProps(el, { title: d } as Record<string, unknown>);
    expect(el.getAttribute("title")).toBe(d.toISOString());
  });

  it("bigint 应 String 写入", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, { "data-b": 9n } as Record<string, unknown>);
    expect(el.getAttribute("data-b")).toBe("9");
  });

  it("style 为 DOM Node 时应跳过（不误 Object.assign）", () => {
    const el = document.createElement("div");
    const tn = document.createTextNode("t");
    spreadIntrinsicProps(el, { style: tn as unknown as object });
    expect(el.style.length).toBe(0);
  });

  it("props 为非 object 时应 no-op", () => {
    const el = document.createElement("div");
    spreadIntrinsicProps(el, 1 as unknown as Record<string, unknown>);
    spreadIntrinsicProps(el, "x" as unknown as Record<string, unknown>);
    expect(el.attributes.length).toBe(0);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("eventNameFromOnProp", () => {
  it("onClick → click", () => {
    expect(eventNameFromOnProp("onClick")).toBe("click");
  });
  it("onMouseMove → mousemove", () => {
    expect(eventNameFromOnProp("onMouseMove")).toBe("mousemove");
  });
  it("on 后非字母返回 null", () => {
    expect(eventNameFromOnProp("on2click")).toBe(null);
  });
  it("onClickCapture 不含在 eventNameFromOnProp（须用 eventBindingFromOnProp）", () => {
    expect(eventNameFromOnProp("onClickCapture")).toBe(null);
  });
});

describe("eventBindingFromOnProp", () => {
  it("onClickCapture → click + capture", () => {
    expect(eventBindingFromOnProp("onClickCapture")).toEqual({
      type: "click",
      capture: true,
    });
  });
  it("onMouseMoveCapture → mousemove + capture", () => {
    expect(eventBindingFromOnProp("onMouseMoveCapture")).toEqual({
      type: "mousemove",
      capture: true,
    });
  });
  it("onClick → bubble", () => {
    expect(eventBindingFromOnProp("onClick")).toEqual({
      type: "click",
      capture: false,
    });
  });
  it("onCapture（无事件名）应 null", () => {
    expect(eventBindingFromOnProp("onCapture")).toBe(null);
  });
  it("on 应 null", () => {
    expect(eventBindingFromOnProp("on")).toBe(null);
  });
});

describe("domAttributeNameFromPropKey", () => {
  it("aria-valuemin 保持不变", () => {
    expect(domAttributeNameFromPropKey("aria-valuemin")).toBe("aria-valuemin");
  });
  it("ariaValuemin → aria-valuemin", () => {
    expect(domAttributeNameFromPropKey("ariaValuemin")).toBe("aria-valuemin");
  });
  it("httpEquiv → http-equiv", () => {
    expect(domAttributeNameFromPropKey("httpEquiv")).toBe("http-equiv");
  });
  it("acceptCharset → accept-charset", () => {
    expect(domAttributeNameFromPropKey("acceptCharset")).toBe("accept-charset");
  });
  it("maxLength → maxlength（与表单控件 content attribute 一致）", () => {
    expect(domAttributeNameFromPropKey("maxLength")).toBe("maxlength");
  });
  it("autoComplete → autocomplete", () => {
    expect(domAttributeNameFromPropKey("autoComplete")).toBe("autocomplete");
  });
  it("autoCapitalize → autocapitalize", () => {
    expect(domAttributeNameFromPropKey("autoCapitalize")).toBe(
      "autocapitalize",
    );
  });
  it("enterKeyHint → enterkeyhint", () => {
    expect(domAttributeNameFromPropKey("enterKeyHint")).toBe("enterkeyhint");
  });
  it("普通 id 不变", () => {
    expect(domAttributeNameFromPropKey("id")).toBe("id");
  });
});

describe("dataAttributeStringValue", () => {
  it("对象 JSON", () => {
    expect(dataAttributeStringValue({ x: 1 })).toBe(`{"x":1}`);
  });
  it("Date 应 toISOString（勿 JSON 双重引号）", () => {
    const d = new Date("2020-01-02T03:04:05.000Z");
    expect(dataAttributeStringValue(d)).toBe(d.toISOString());
  });
  it("函数返回 null", () => {
    expect(dataAttributeStringValue(() => {})).toBe(null);
  });
  it("undefined / null 返回 null", () => {
    expect(dataAttributeStringValue(undefined)).toBe(null);
    expect(dataAttributeStringValue(null)).toBe(null);
  });
  it("boolean / bigint 应 String", () => {
    expect(dataAttributeStringValue(true)).toBe("true");
    expect(dataAttributeStringValue(1n)).toBe("1");
  });
});
