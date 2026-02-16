/**
 * @fileoverview 单元测试：applyProps 全分支覆盖
 * 覆盖 ref、vShow、vCloak、dangerouslySetInnerHTML、value/checked 响应式、事件、class、style、
 * 布尔属性、htmlFor、自定义指令等，以及表单 value 清空逻辑。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, isDOMEnvironment } from "@dreamer/view";
import { registerDirective } from "../../src/directive.ts";
import { applyProps } from "../../src/dom/props.ts";

/** happy-dom 或其它测试可能启动定时器，关闭 sanitize 避免泄漏误报 */
const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("applyProps 表单 value", () => {
  it("happy-dom 下直接赋值 input.value 可清空", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hello";
    input.value = "";
    expect(input.value).toBe("");
  }, noSanitize);

  it("新值与当前 DOM 不同时 applyProps(value) 不抛错", () => {
    expect(isDOMEnvironment()).toBe(true);
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hello";
    applyProps(input, { value: "" });
  }, noSanitize);

  it('blur 后 applyProps(value="") 不抛错', () => {
    const container = document.createElement("div");
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hello";
    container.appendChild(input);
    document.body.appendChild(container);
    input.focus();
    (input as HTMLInputElement).blur();
    applyProps(input, { value: "" });
    if (container.parentNode) container.remove();
  }, noSanitize);
});

describe("applyProps ref", () => {
  it("ref 为 null/undefined 时不调用", () => {
    const el = document.createElement("div");
    applyProps(el, { ref: null });
    applyProps(el, { ref: undefined });
  }, noSanitize);

  it("ref 为回调函数时调用并传入元素", () => {
    const el = document.createElement("div");
    let received: Element | null = null;
    applyProps(el, {
      ref: (e: Element) => {
        received = e;
      },
    });
    expect(received).toBe(el);
  }, noSanitize);

  it("ref 为 { current } 对象时写入 current", () => {
    const el = document.createElement("span");
    const ref = { current: null as Element | null };
    applyProps(el, { ref });
    expect(ref.current).toBe(el);
  }, noSanitize);

  it("ref 为 signal getter 时通过 effect 更新 current", async () => {
    const el = document.createElement("div");
    const refObj = { current: null as Element | null };
    const [getRef] = createSignal(refObj);
    applyProps(el, { ref: getRef });
    await Promise.resolve();
    await Promise.resolve();
    expect(getRef().current).toBe(el);
  }, noSanitize);

  it("ref 为非函数且无 current 时不抛错、不写入", () => {
    const el = document.createElement("div");
    applyProps(el, { ref: {} });
    applyProps(el, { ref: 1 as unknown });
  }, noSanitize);
});

describe("applyProps vShow / vCloak", () => {
  it("vShow 为 true 时 display 为空", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { "v-show": true });
    expect(el.style.display).toBe("");
  }, noSanitize);

  it("vShow 为 false 时 display 为 none", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { vShow: false });
    expect(el.style.display).toBe("none");
  }, noSanitize);

  it("无 vShow 时不改动 display", () => {
    const el = document.createElement("div") as HTMLElement;
    el.style.display = "block";
    applyProps(el, { className: "x" });
    expect(el.style.display).toBe("block");
  }, noSanitize);

  it("vShow 为 signal getter 时通过 effect 更新 display", async () => {
    const el = document.createElement("div") as HTMLElement;
    const [get, set] = createSignal(true);
    applyProps(el, { vShow: get });
    await Promise.resolve();
    await Promise.resolve();
    expect(el.style.display).toBe("");
    set(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(el.style.display).toBe("none");
  }, noSanitize);

  it("vCloak 时设置 data-view-cloak", () => {
    const el = document.createElement("div");
    applyProps(el, { vCloak: true });
    expect(el.getAttribute("data-view-cloak")).toBe("");
  }, noSanitize);
});

describe("applyProps dangerouslySetInnerHTML", () => {
  it("dangerouslySetInnerHTML 含 __html 时设置 innerHTML", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { dangerouslySetInnerHTML: { __html: "<b>hi</b>" } });
    expect(el.innerHTML).toBe("<b>hi</b>");
  }, noSanitize);

  it("dangerouslySetInnerHTML.__html 为 undefined 时不设置", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { dangerouslySetInnerHTML: {} });
    expect(el.innerHTML).toBe("");
  }, noSanitize);

  it("dangerouslySetInnerHTML 值为非对象时不进入分支、不抛错", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, {
      dangerouslySetInnerHTML: "not-object" as unknown as { __html?: string },
    });
    expect(el.innerHTML).toBe("");
  }, noSanitize);
});

describe("applyProps value/checked 响应式", () => {
  it("value 为 signal getter 时通过 effect 写回 DOM", async () => {
    const input = document.createElement("input");
    input.type = "text";
    const [get, set] = createSignal("a");
    applyProps(input, { value: get });
    await Promise.resolve();
    await Promise.resolve();
    expect((input as HTMLInputElement).value).toBe("a");
    set("b");
    await Promise.resolve();
    await Promise.resolve();
    expect((input as HTMLInputElement).value).toBe("b");
  }, noSanitize);

  it("value 为普通函数时通过 effect 写回 DOM", async () => {
    const input = document.createElement("input");
    input.type = "text";
    const x = "x";
    applyProps(input, { value: () => x });
    await Promise.resolve();
    await Promise.resolve();
    expect((input as HTMLInputElement).value).toBe("x");
  }, noSanitize);

  it("checked 为函数时通过 effect 应用", async () => {
    const input = document.createElement("input");
    input.type = "checkbox";
    const [get, set] = createSignal(false);
    applyProps(input, { checked: () => get() });
    await Promise.resolve();
    await Promise.resolve();
    expect((input as HTMLInputElement).checked).toBe(false);
    set(true);
    await Promise.resolve();
    await Promise.resolve();
    expect((input as HTMLInputElement).checked).toBe(true);
  }, noSanitize);
});

describe("applyProps 事件 on*", () => {
  it("onClick 绑定并触发", () => {
    const el = document.createElement("button");
    let n = 0;
    applyProps(el, { onClick: () => n++ });
    (el as HTMLButtonElement).click();
    expect(n).toBe(1);
  }, noSanitize);

  it("再次 applyProps 同事件时替换监听器", () => {
    const el = document.createElement("button");
    let a = 0;
    let b = 0;
    applyProps(el, { onClick: () => a++ });
    (el as HTMLButtonElement).click();
    expect(a).toBe(1);
    applyProps(el, { onClick: () => b++ });
    (el as HTMLButtonElement).click();
    expect(a).toBe(1);
    expect(b).toBe(1);
  }, noSanitize);

  it("事件监听器置为 null 时移除旧监听器", () => {
    const el = document.createElement("button");
    let n = 0;
    applyProps(el, { onClick: () => n++ });
    (el as HTMLButtonElement).click();
    expect(n).toBe(1);
    applyProps(el, { onClick: null });
    (el as HTMLButtonElement).click();
    expect(n).toBe(1);
  }, noSanitize);

  it("onChange 等其它 on* 事件绑定", () => {
    const el = document.createElement("input");
    let changed = false;
    applyProps(el, { onChange: () => (changed = true) });
    el.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changed).toBe(true);
  }, noSanitize);
});

describe("applyProps class / className", () => {
  it("className 设置到 DOM", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { className: "a b" });
    expect(el.className).toBe("a b");
  }, noSanitize);

  it("class 设置到 DOM", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { class: "c d" });
    expect(el.className).toBe("c d");
  }, noSanitize);

  it("SVG 元素用 setAttribute 设置 class", () => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    applyProps(el, { className: "svg-class" });
    expect(el.getAttribute("class")).toBe("svg-class");
  }, noSanitize);

  it("class/className 为 null 或 undefined 时为空字符串", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { className: null });
    expect(el.className).toBe("");
    applyProps(el, { class: undefined });
    expect(el.className).toBe("");
  }, noSanitize);
});

describe("applyProps style", () => {
  it("style 为字符串时设置 cssText", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { style: "color: red; font-size: 12px;" });
    expect(el.style.cssText).toContain("color");
    expect(el.style.color).toBe("red");
  }, noSanitize);

  it("style 为对象时逐项设置", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { style: { color: "blue", marginTop: "10px" } });
    expect(el.style.color).toBe("blue");
    expect(el.style.marginTop).toBe("10px");
  }, noSanitize);

  it("style 对象中值为 null 时设为空字符串", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { style: { color: "red", marginTop: null as unknown } });
    expect(el.style.color).toBe("red");
    expect(el.style.marginTop).toBe("");
  }, noSanitize);

  it("style 为 null 或 undefined 时不进入 style 分支、不抛错", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { style: null });
    applyProps(el, { style: undefined });
  }, noSanitize);
});

describe("applyProps innerHTML", () => {
  it("innerHTML 为字符串时设置", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { innerHTML: "<span>x</span>" });
    expect(el.innerHTML).toBe("<span>x</span>");
  }, noSanitize);

  it("innerHTML 为 null 时设为空字符串", () => {
    const el = document.createElement("div") as HTMLElement;
    applyProps(el, { innerHTML: null });
    expect(el.innerHTML).toBe("");
  }, noSanitize);
});

describe("applyProps 布尔与通用 attribute", () => {
  it("value 为 null/false 时 removeAttribute，布尔型写 viewEl", () => {
    const el = document.createElement("input");
    el.setAttribute("disabled", "");
    applyProps(el, { disabled: false });
    expect(el.getAttribute("disabled")).toBeNull();
  }, noSanitize);

  it("value 为 true 时 setAttribute 空字符串，布尔型写 viewEl", () => {
    const el = document.createElement("input");
    applyProps(el, { disabled: true });
    expect(el.getAttribute("disabled")).toBe("");
  }, noSanitize);

  it("checked/selected 写 viewEl 并 setAttribute", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    applyProps(el, { checked: true });
    expect((el as HTMLInputElement).checked).toBe(true);
    expect(el.getAttribute("checked")).toBe("");
  }, noSanitize);

  it("disabled/readOnly/multiple 写 viewEl", () => {
    const el = document.createElement("input");
    applyProps(el, { readOnly: true });
    expect(el.getAttribute("readonly")).toBe("");
  }, noSanitize);

  it("htmlFor 映射到 for", () => {
    const el = document.createElement("label");
    applyProps(el, { htmlFor: "input-id" });
    expect(el.getAttribute("for")).toBe("input-id");
  }, noSanitize);

  it("通用 attribute 用 setAttribute", () => {
    const el = document.createElement("div");
    applyProps(el, { "data-foo": "bar", id: "my-id" });
    expect(el.getAttribute("data-foo")).toBe("bar");
    expect(el.getAttribute("id")).toBe("my-id");
  }, noSanitize);

  it("selected 为 true/false 时写 viewEl 与 attribute", () => {
    const el = document.createElement("option");
    applyProps(el, { selected: true });
    expect(el.getAttribute("selected")).toBe("");
    applyProps(el, { selected: false });
    expect(el.getAttribute("selected")).toBeNull();
  }, noSanitize);

  it("textarea value 应用", () => {
    const el = document.createElement("textarea");
    applyProps(el, { value: "textarea content" });
    expect((el as HTMLTextAreaElement).value).toBe("textarea content");
  }, noSanitize);

  it("非布尔 key 且 value 为 null 时仅 removeAttribute", () => {
    const el = document.createElement("div");
    el.setAttribute("data-x", "y");
    applyProps(el, { "data-x": null });
    expect(el.getAttribute("data-x")).toBeNull();
  }, noSanitize);

  it("value 为 undefined 时表单 value 为空字符串", () => {
    const input = document.createElement("input");
    input.type = "text";
    (input as HTMLInputElement).value = "had";
    applyProps(input, { value: undefined });
    expect((input as HTMLInputElement).value).toBe("");
  }, noSanitize);

  it("checked 为 false 时 removeAttribute 且 viewEl.checked 为 false", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    (el as HTMLInputElement).checked = true;
    applyProps(el, { checked: false });
    expect(el.getAttribute("checked")).toBeNull();
    expect((el as HTMLInputElement).checked).toBe(false);
  }, noSanitize);

  it("multiple 为 true 时 setAttribute 且 viewEl.multiple 为 true", () => {
    const el = document.createElement("select");
    applyProps(el, { multiple: true });
    expect(el.getAttribute("multiple")).toBe("");
    expect((el as HTMLSelectElement).multiple).toBe(true);
  }, noSanitize);

  it("select 元素 value 应用", () => {
    const el = document.createElement("select");
    const o1 = document.createElement("option");
    o1.value = "a";
    const o2 = document.createElement("option");
    o2.value = "b";
    el.appendChild(o1);
    el.appendChild(o2);
    applyProps(el, { value: "b" });
    expect((el as HTMLSelectElement).value).toBe("b");
  }, noSanitize);

  it("checked 为非布尔时 Boolean(value) 且 setAttribute(str)", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    applyProps(el, { checked: "yes" as unknown });
    expect((el as HTMLInputElement).checked).toBe(true);
    expect(el.getAttribute("checked")).toBe("yes");
  }, noSanitize);

  it("仅 disabled/readOnly/multiple 时只写 viewEl 并 setAttribute", () => {
    const el = document.createElement("input");
    applyProps(el, { disabled: true });
    expect((el as HTMLInputElement).disabled).toBe(true);
    expect(el.getAttribute("disabled")).toBe("");
  }, noSanitize);
});

describe("applyProps children / key / 指令 prop 跳过", () => {
  it("含 children 与 key 时不落为 attribute", () => {
    const el = document.createElement("div");
    applyProps(el, { children: [], key: "k1" });
    expect(el.getAttribute("children")).toBeNull();
    expect(el.getAttribute("key")).toBeNull();
  }, noSanitize);

  it("指令 prop（如 vIf）不落为 attribute，其它 prop 正常应用", () => {
    const el = document.createElement("div");
    applyProps(el, { vIf: true, id: "with-vif" });
    expect(el.getAttribute("vIf")).toBeNull();
    expect(el.getAttribute("id")).toBe("with-vif");
  }, noSanitize);
});

describe("applyProps 自定义指令 applyDirectives", () => {
  it("自定义指令 mounted 被调用", async () => {
    let mountedEl: Element | null = null;
    registerDirective("v-props-test", {
      mounted(el) {
        mountedEl = el;
      },
    });
    const el = document.createElement("div");
    applyProps(el, { "v-props-test": "any" });
    await new Promise((r) => setTimeout(r, 20));
    expect(mountedEl).toBe(el);
  }, noSanitize);

  it("自定义指令 unmounted 通过 registerUnmount 登记", async () => {
    let unmounted = false;
    registerDirective("v-props-unmount", {
      unmounted() {
        unmounted = true;
      },
    });
    const el = document.createElement("div");
    applyProps(el, { "v-props-unmount": true });
    await new Promise((r) => setTimeout(r, 20));
    const { runDirectiveUnmount } = await import("../../src/dom/unmount.ts");
    runDirectiveUnmount(el);
    expect(unmounted).toBe(true);
  }, noSanitize);

  it("自定义指令无 mounted 时不抛错", () => {
    registerDirective("v-props-no-mounted", {});
    const el = document.createElement("div");
    applyProps(el, { "v-props-no-mounted": "x" });
  }, noSanitize);

  it("自定义指令有 updated 且值为 getter 时订阅更新", async () => {
    let updatedValue: unknown;
    registerDirective("v-props-updated", {
      updated(_el, binding) {
        updatedValue = binding.value;
      },
    });
    const el = document.createElement("div");
    const [get, set] = createSignal(1);
    applyProps(el, { "v-props-updated": get });
    await Promise.resolve();
    await Promise.resolve();
    expect(updatedValue).toBe(1);
    set(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(updatedValue).toBe(2);
  }, noSanitize);
});
