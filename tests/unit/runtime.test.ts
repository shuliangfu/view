/**
 * @fileoverview Runtime 单元测试：renderToString、generateHydrationScript、createRoot/render（DOM）、hydrate
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import type { VNode } from "@dreamer/view";
import {
  createReactiveRoot,
  createRoot,
  createSignal,
  generateHydrationScript,
  hydrate,
  render,
  renderToString,
} from "@dreamer/view";

describe("renderToString", () => {
  it("应返回根组件渲染的 HTML 字符串", () => {
    const html = renderToString(() => ({
      type: "div",
      props: { className: "root" },
      children: [{
        type: "#text",
        props: { nodeValue: "hello" },
        children: [],
      }],
    }));
    expect(typeof html).toBe("string");
    expect(html).toContain("hello");
    expect(html).toContain("div");
    expect(html).toContain("root");
  });

  it("支持 Fragment 与多子节点", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {},
      children: [
        { type: "#text", props: { nodeValue: "a" }, children: [] },
        { type: "#text", props: { nodeValue: "b" }, children: [] },
      ],
    }));
    expect(html).toContain("a");
    expect(html).toContain("b");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("generateHydrationScript", () => {
  it("无参数时应返回空字符串或仅含默认 dataKey 的 script", () => {
    const out = generateHydrationScript();
    expect(typeof out).toBe("string");
  });

  it("传入 data 时应注入 window[dataKey] 的 JSON", () => {
    const out = generateHydrationScript({
      data: { foo: 1 },
      dataKey: "__VIEW__",
    });
    expect(out).toContain("__VIEW__");
    expect(out).toContain("foo");
  });

  it("传入 scriptSrc 时应包含 script type=module src", () => {
    const out = generateHydrationScript({ scriptSrc: "/client.js" });
    expect(out).toContain("script");
    expect(out).toContain("/client.js");
  });
});

describe("createRoot / render (DOM)", () => {
  it("应挂载到 container 并返回 Root", () => {
    const container = document.createElement("div");
    const root = createRoot(
      () => ({ type: "span", props: {}, children: [] }),
      container,
    );
    expect(root.container).toBe(container);
    expect(root.unmount).toBeDefined();
    expect(container.querySelector("span")).not.toBeNull();
    root.unmount();
    expect(container.textContent).toBe("");
  });

  it("render 等同于 createRoot", () => {
    const container = document.createElement("div");
    const root = render(
      () => ({ type: "p", props: {}, children: [] }),
      container,
    );
    expect(container.querySelector("p")).not.toBeNull();
    root.unmount();
  });

  it("根组件依赖 signal 时，signal 变更后应更新 DOM", async () => {
    const container = document.createElement("div");
    const [get, set] = createSignal(0);
    const root = createRoot(
      () => ({
        type: "span",
        props: {},
        children: [
          {
            type: "#text",
            props: { nodeValue: String(get()) },
            children: [],
          },
        ],
      }),
      container,
    );
    expect(container.textContent).toBe("0");
    set(1);
    await Promise.resolve();
    expect(container.textContent).toBe("1");
    root.unmount();
  });

  it("边界：fn 返回空 Fragment 时挂载空（根返回 null 当前会报错，以空 Fragment 代测）", async () => {
    const container = document.createElement("div");
    const { Fragment } = await import("@dreamer/view/jsx-runtime");
    const root = createRoot(
      () =>
        ({ type: Fragment, props: { children: [] }, children: [] }) as VNode,
      container,
    );
    expect(root.container).toBe(container);
    root.unmount();
  });

  it("边界：container 已有子节点时 createRoot 会覆盖或追加（由实现决定，不抛错）", () => {
    const container = document.createElement("div");
    const existing = document.createElement("p");
    existing.textContent = "existing";
    container.appendChild(existing);
    const root = createRoot(
      () => ({ type: "span", props: {}, children: [] }),
      container,
    );
    expect(container.querySelector("span")).not.toBeNull();
    root.unmount();
  });

  it("边界：unmount 后再次 set signal 不抛错、不更新 DOM", async () => {
    const container = document.createElement("div");
    const [get, set] = createSignal(0);
    const root = createRoot(
      () => ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: String(get()) },
          children: [],
        }],
      }),
      container,
    );
    root.unmount();
    expect(() => set(1)).not.toThrow();
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("createReactiveRoot", () => {
  it("应挂载初始状态对应的 DOM 并返回 Root", () => {
    const container = document.createElement("div");
    const getState = () => ({ count: 0, label: "zero" });
    const root = createReactiveRoot(
      container,
      getState,
      (state) => ({
        type: "div",
        props: { "data-count": state.count },
        children: [{
          type: "#text",
          props: { nodeValue: state.label },
          children: [],
        }],
      }),
    );
    expect(root.container).toBe(container);
    expect(root.unmount).toBeDefined();
    const div = container.querySelector("div");
    expect(div).not.toBeNull();
    expect(div?.getAttribute("data-count")).toBe("0");
    expect(container.textContent).toBe("zero");
    root.unmount();
    expect(container.textContent).toBe("");
  });

  it("getState 为 signal 时，状态变更后应 patch 更新 DOM", async () => {
    const container = document.createElement("div");
    const [getCount, setCount] = createSignal(0);
    const root = createReactiveRoot(
      container,
      getCount,
      (count) => ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: String(count) },
          children: [],
        }],
      }),
    );
    expect(container.textContent).toBe("0");
    setCount(1);
    await Promise.resolve();
    expect(container.textContent).toBe("1");
    setCount(42);
    await Promise.resolve();
    expect(container.textContent).toBe("42");
    root.unmount();
  });

  it("unmount 后容器应清空且无泄漏", () => {
    const container = document.createElement("div");
    const getState = () => "mounted";
    const root = createReactiveRoot(
      container,
      getState,
      (text) => ({
        type: "p",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: text },
          children: [],
        }],
      }),
    );
    expect(container.querySelector("p")).not.toBeNull();
    root.unmount();
    expect(container.textContent).toBe("");
    expect(container.querySelector("p")).toBeNull();
  });

  it("状态为对象时，signal 变更后应 patch 更新 DOM", async () => {
    const container = document.createElement("div");
    const [getState, setState] = createSignal({ count: 0 });
    const root = createReactiveRoot(
      container,
      getState,
      (state) => ({
        type: "div",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: String(state.count) },
          children: [],
        }],
      }),
    );
    expect(container.textContent).toBe("0");
    setState({ count: 1 });
    await Promise.resolve();
    expect(container.textContent).toBe("1");
    root.unmount();
  });

  it("边界：unmount 后再次 set state 不抛错、不更新 DOM", async () => {
    const container = document.createElement("div");
    const [getState, setState] = createSignal(0);
    const root = createReactiveRoot(
      container,
      getState,
      (n) => ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: String(n) },
          children: [],
        }],
      }),
    );
    root.unmount();
    expect(container.textContent).toBe("");
    expect(() => setState(1)).not.toThrow();
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("hydrate", () => {
  it("container 已有子节点时应复用并激活（移除 cloak）", () => {
    const container = document.createElement("div");
    container.setAttribute("data-view-cloak", "");
    container.innerHTML = "<span>hi</span>";
    const root = hydrate(
      () => ({
        type: "span",
        props: {},
        children: [{ type: "#text", props: { nodeValue: "hi" }, children: [] }],
      }),
      container,
    );
    expect(container.hasAttribute("data-view-cloak")).toBe(false);
    root.unmount();
  });
});
