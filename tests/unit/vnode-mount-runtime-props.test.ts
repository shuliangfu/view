/**
 * @fileoverview 手写 jsx-runtime→mountVNodeTree：受控 value/checked、style 对象、className 无参函数与 SignalRef、布尔无参函数与 SignalRef（与 compileSource 行为对齐）。
 * 根级响应式 vIf 依赖 `insertReactive` 桥接，须先加载 compiler 入口以注册 `setInsertReactiveForVnodeMount`。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import { mergeProps } from "@dreamer/view/compiler";
import { Fragment, jsx, jsxMerge } from "@dreamer/view/jsx-runtime";
import "../../src/compiler/mod.ts";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";

describe("mountVNodeTree 本征 DOM（手写 runtime 响应式 props）", () => {
  it("input value 为 SignalRef 时应随 .value 更新", async () => {
    const text = createSignal("a");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("input", { type: "text", value: text });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("a");
    text.value = "b";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(input.value).toBe("b");
    document.body.removeChild(container);
  });

  it("checkbox checked 为无参函数时应随依赖更新", async () => {
    const on = createSignal(false);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("input", {
      type: "checkbox",
      checked: () => on.value,
    });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(false);
    on.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(input.checked).toBe(true);
    document.body.removeChild(container);
  });

  it("style 为普通对象时应合并到 element.style", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("div", {
      style: { color: "rgb(255, 0, 0)", marginTop: "10px" },
      children: "x",
    });
    mountVNodeTree(container, vnode);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("rgb(255, 0, 0)");
    expect(el.style.marginTop).toBe("10px");
    document.body.removeChild(container);
  });

  it("disabled 为 SignalRef 时应反映布尔值", async () => {
    const d = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("button", {
      type: "button",
      disabled: d,
      children: "ok",
    });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    d.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(btn.disabled).toBe(false);
    document.body.removeChild(container);
  });

  it("className 为无参函数时应随依赖更新 setAttribute('class')", async () => {
    const on = createSignal(1);
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("div", {
        className: () => (on.value === 1 ? "a" : "b"),
        children: "x",
      }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("class")).toBe("a");
    on.value = 2;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.getAttribute("class")).toBe("b");
    document.body.removeChild(container);
  });

  it("className 为 SignalRef 时应随 .value 更新", async () => {
    const c = createSignal("p1");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(container, jsx("div", { className: c, children: "x" }));
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("class")).toBe("p1");
    c.value = "p2";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.getAttribute("class")).toBe("p2");
    document.body.removeChild(container);
  });

  it("style 为 SignalRef（对象）时每轮应覆盖旧键", async () => {
    const st = createSignal<Record<string, string>>({
      color: "rgb(255, 0, 0)",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("div", { style: st, children: "x" });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("rgb(255, 0, 0)");
    st.value = { marginTop: "8px" };
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.style.color).toBe("");
    expect(el.style.marginTop).toBe("8px");
    document.body.removeChild(container);
  });

  it("本征 jsx 使用 mergeProps 合并多段 props 时应正确挂到 DOM", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx(
      "div",
      mergeProps(
        { className: "a" } as Record<string, unknown>,
        { id: "merged", children: "t" } as Record<string, unknown>,
      ),
    );
    mountVNodeTree(container, vnode);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("class")).toBe("a");
    expect(el.getAttribute("id")).toBe("merged");
    expect(el.textContent).toBe("t");
    document.body.removeChild(container);
  });

  it("Fragment 内 vIf / vElseIf / vElse 链含响应式条件时应切换分支", async () => {
    const showA = createSignal(false);
    const showB = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx(Fragment, {
      children: [
        jsx("span", { vIf: showA, children: "A" }),
        jsx("span", { vElseIf: showB, children: "B" }),
        jsx("span", { vElse: true, children: "C" }),
      ],
    });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("B");
    showB.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("C");
    showA.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("A");
    document.body.removeChild(container);
  });

  it("textarea value 为 SignalRef 时应随 .value 更新", async () => {
    const text = createSignal("ta");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(container, jsx("textarea", { value: text, children: "" }));
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe("ta");
    text.value = "tb";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(ta.value).toBe("tb");
    document.body.removeChild(container);
  });

  it("select value 为 SignalRef 时应随 .value 更新", async () => {
    const v = createSignal("b");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("select", {
      value: v,
      children: [
        jsx("option", { value: "a", children: "A" }),
        jsx("option", { value: "b", children: "B" }),
      ],
    });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const sel = container.querySelector("select") as HTMLSelectElement;
    expect(sel.value).toBe("b");
    v.value = "a";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(sel.value).toBe("a");
    document.body.removeChild(container);
  });

  it("radio checked 为无参函数（与选中 value 比较）时应切换组内选中项", async () => {
    /** 本征路径对 radio/checkbox 的 checked 使用 Boolean(读值)，故用 getter 比较 value，而非把「当前 value」字符串绑到 checked */
    const pick = createSignal("a");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx(Fragment, {
        children: [
          jsx("input", {
            type: "radio",
            name: "g",
            value: "a",
            checked: () => pick.value === "a",
          }),
          jsx("input", {
            type: "radio",
            name: "g",
            value: "b",
            checked: () => pick.value === "b",
          }),
        ],
      }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const radios = container.querySelectorAll(
      "input[type=radio]",
    ) as NodeListOf<HTMLInputElement>;
    expect(radios[0]!.checked).toBe(true);
    expect(radios[1]!.checked).toBe(false);
    pick.value = "b";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(radios[0]!.checked).toBe(false);
    expect(radios[1]!.checked).toBe(true);
    document.body.removeChild(container);
  });

  it("radio checked 为 SignalRef<boolean> 时应反映布尔", async () => {
    const on = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("input", { type: "radio", name: "solo", checked: on }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const r = container.querySelector("input[type=radio]") as HTMLInputElement;
    expect(r.checked).toBe(true);
    on.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(r.checked).toBe(false);
    document.body.removeChild(container);
  });

  it("input value 为无参函数时应随依赖更新", async () => {
    const text = createSignal("x");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("input", { type: "text", value: () => text.value }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("x");
    text.value = "y";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(input.value).toBe("y");
    document.body.removeChild(container);
  });

  it("hidden 为 SignalRef 时 div 应随 .value 更新", async () => {
    const h = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(container, jsx("div", { hidden: h, children: "h" }));
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const el = container.firstElementChild as HTMLElement;
    expect(el.hidden).toBe(true);
    h.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.hidden).toBe(false);
    document.body.removeChild(container);
  });

  it("readOnly 为 SignalRef 时 input 应随 .value 更新", async () => {
    const ro = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("input", { type: "text", readOnly: ro, value: "z" }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    ro.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(input.readOnly).toBe(false);
    document.body.removeChild(container);
  });

  it("style 为无参函数返回对象时应随依赖更新", async () => {
    const color = createSignal("rgb(0, 128, 0)");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("div", { style: () => ({ color: color.value }), children: "s" }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("rgb(0, 128, 0)");
    color.value = "rgb(0, 0, 255)";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.style.color).toBe("rgb(0, 0, 255)");
    document.body.removeChild(container);
  });

  it("style 无参函数在嵌套子 VNode（mountChildItemForVnode untrack）下仍应随依赖更新", async () => {
    const color = createSignal("rgb(0, 128, 0)");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("div", {
        children: jsx("div", {
          style: () => ({ color: color.value }),
          children: "s",
        }),
      }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const el = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(el.style.color).toBe("rgb(0, 128, 0)");
    color.value = "rgb(0, 0, 255)";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.style.color).toBe("rgb(0, 0, 255)");
    document.body.removeChild(container);
  });

  it("Fragment 链仅 vElseIf 为响应式时仍应切换分支", async () => {
    const showB = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx(Fragment, {
        children: [
          jsx("span", { vIf: false, children: "A" }),
          jsx("span", { vElseIf: showB, children: "B" }),
          jsx("span", { vElse: true, children: "C" }),
        ],
      }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("B");
    showB.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("C");
    document.body.removeChild(container);
  });

  it("根级本征 vIf 为无参函数时应随依赖挂载/卸载", async () => {
    const show = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("span", { vIf: () => show.value, children: "fn" }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.querySelector("span")?.textContent).toBe("fn");
    show.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.querySelector("span")).toBeNull();
    document.body.removeChild(container);
  });

  it("jsxMerge 本征挂载应与 mergeProps+jsx 一致", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsxMerge(
        "div",
        { className: "m1" } as Record<string, unknown>,
        { id: "jid", children: "jm" } as Record<string, unknown>,
      ),
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBe("m1");
    expect(el.id).toBe("jid");
    expect(el.textContent).toBe("jm");
    document.body.removeChild(container);
  });

  it("根级本征 vIf 为 SignalRef 时应随条件挂载/卸载", async () => {
    const show = createSignal(true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("span", { vIf: show, children: "hi" });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.querySelector("span")?.textContent).toBe("hi");
    show.value = false;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.querySelector("span")).toBeNull();
    show.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.querySelector("span")?.textContent).toBe("hi");
    document.body.removeChild(container);
  });

  it("子节点含 SignalRef 时插值应订阅更新（normalizeChildren→insertReactive）", async () => {
    const s = createSignal("a");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("span", { children: ["v:", s] } as Record<string, unknown>),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("v:a");
    s.value = "b";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("v:b");
    document.body.removeChild(container);
  });

  it("vOnce 子节点为 SignalRef 时依赖变一次后文本冻结", async () => {
    const t = createSignal("a");
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("span", { vOnce: true, children: t } as Record<string, unknown>),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("a");
    t.value = "c";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("c");
    t.value = "a";
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("c");
    document.body.removeChild(container);
  });
}, { sanitizeOps: false, sanitizeResources: false });
