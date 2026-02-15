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
  mount,
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

  /**
   * SSR 时子节点为「普通函数」应被调用并渲染其返回值，而不是把函数源码当文本输出。
   * 对应 hybrid 场景下 { () => ( <> ... </> ) } 写法，修复前会看到 _jsx/=> 等 JS 代码。
   */
  it("子节点为普通函数时 SSR 应渲染函数返回值而非函数源码", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: () =>
          ({
            type: "span",
            props: {},
            children: [{
              type: "#text",
              props: { nodeValue: "from-function" },
              children: [] as VNode[],
            }],
          }) as VNode,
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("from-function");
    expect(html).toContain("<span>");
    // 若未对函数做“调用再展开”，会输出函数源码，HTML 中会出现 "() =>" 或 "function"
    expect(html).not.toContain("() =>");
  });

  /** 边界：children 为 null 或 undefined 时输出空，不报错 */
  it("children 为 null 时输出空子节点", () => {
    const html = renderToString(() => ({
      type: "div",
      props: { children: null },
      children: [] as VNode[],
    }));
    expect(html).toContain("<div>");
    expect(html).toContain("</div>");
  });

  it("children 为 undefined 时输出空子节点", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("<div>");
    expect(html).toContain("</div>");
  });

  /** SSR 时 signal getter 作为子节点应调用一次取当前值并渲染 */
  it("子节点为 signal getter 时 SSR 应渲染当前值", () => {
    const [getVal] = createSignal("signal-value");
    const html = renderToString(() => ({
      type: "div",
      props: { children: getVal },
      children: [] as VNode[],
    }));
    expect(html).toContain("signal-value");
    expect(html).not.toContain("() =>");
  });

  /** 数组子节点中含函数时，函数应被调用并展开 */
  it("子节点为数组且含函数时，函数被调用并展开", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: [
          { type: "#text", props: { nodeValue: "before" }, children: [] },
          () =>
            ({
              type: "span",
              props: {},
              children: [{
                type: "#text",
                props: { nodeValue: "mid" },
                children: [] as VNode[],
              }],
            }) as VNode,
          { type: "#text", props: { nodeValue: "after" }, children: [] },
        ],
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("before");
    expect(html).toContain("mid");
    expect(html).toContain("after");
    expect(html).not.toContain("() =>");
  });

  /** 子节点为普通函数且返回 null 时，该位置输出空 */
  it("子节点为函数且返回 null 时输出空", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: () => null as unknown as VNode,
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("<div>");
    expect(html).toContain("</div>");
  });

  /** 子节点为数字或字符串时，转为文本节点输出 */
  it("子节点为数字时转为文本输出", () => {
    const html = renderToString(() => ({
      type: "span",
      props: { children: 42 },
      children: [] as VNode[],
    }));
    expect(html).toContain("42");
  });

  it("子节点为字符串时转为文本输出", () => {
    const html = renderToString(() => ({
      type: "span",
      props: { children: "plain-text" },
      children: [] as VNode[],
    }));
    expect(html).toContain("plain-text");
  });

  /** 子节点为字符串且含 < > & 时应转义，避免注入 */
  it("子节点字符串中的 < > & 应转义输出", () => {
    const html = renderToString(() => ({
      type: "span",
      props: { children: "<script>&" },
      children: [] as VNode[],
    }));
    expect(html).toContain("&lt;script&gt;&amp;");
    expect(html).not.toContain("<script>");
  });

  /** 子节点为函数且返回 VNode 数组（非 Fragment）时，全部渲染 */
  it("子节点为函数且返回 VNode 数组时全部渲染", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: () =>
          [
            {
              type: "span",
              props: {},
              children: [{
                type: "#text",
                props: { nodeValue: "a" },
                children: [] as VNode[],
              }],
            },
            {
              type: "span",
              props: {},
              children: [{
                type: "#text",
                props: { nodeValue: "b" },
                children: [] as VNode[],
              }],
            },
          ] as unknown as VNode,
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("a");
    expect(html).toContain("b");
    expect(html).not.toContain("() =>");
  });

  /** 子节点为函数且返回多子节点（Fragment 结构）时，应全部渲染 */
  it("子节点为函数且返回多子节点时全部渲染", async () => {
    const { FragmentType } = await import("../../src/dom/shared.ts");
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: () =>
          ({
            type: FragmentType,
            props: {
              children: [
                { type: "#text", props: { nodeValue: "one" }, children: [] },
                { type: "#text", props: { nodeValue: "two" }, children: [] },
              ],
            },
            children: [] as VNode[],
          }) as VNode,
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("one");
    expect(html).toContain("two");
    expect(html).not.toContain("() =>");
  });

  /** 根为 Fragment、children 为函数时，应调用函数并渲染其返回值 */
  it("根为 Fragment 且 children 为函数时 SSR 正常渲染", async () => {
    const { FragmentType } = await import("../../src/dom/shared.ts");
    const html = renderToString(() =>
      ({
        type: FragmentType,
        props: {
          children: () =>
            ({
              type: "span",
              props: {},
              children: [{
                type: "#text",
                props: { nodeValue: "fragment-root" },
                children: [] as VNode[],
              }],
            }) as VNode,
        },
        children: [] as VNode[],
      }) as VNode
    );
    expect(html).toContain("fragment-root");
    expect(html).toContain("<span>");
    expect(html).not.toContain("() =>");
  });

  // ---------- 分支覆盖：函数组件、keyed、void、attributes、options ----------

  /** 根为函数组件时，SSR 调用组件并渲染其返回值 */
  it("根为函数组件时 SSR 渲染组件返回值", () => {
    const Comp = (_props: Record<string, unknown>) =>
      ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: "from-component" },
          children: [] as VNode[],
        }],
      }) as VNode;
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("from-component");
    expect(html).toContain("<span>");
  });

  /** 函数组件返回 null 时输出空字符串 */
  it("函数组件返回 null 时输出空", () => {
    const Comp = (_props: Record<string, unknown>) => null as unknown as VNode;
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toBe("");
  });

  /** 函数组件返回 VNode 数组时全部渲染 */
  it("函数组件返回 VNode 数组时全部渲染", () => {
    const Comp = (_props: Record<string, unknown>) =>
      [
        {
          type: "span",
          props: {},
          children: [{
            type: "#text",
            props: { nodeValue: "c1" },
            children: [],
          }],
        },
        {
          type: "span",
          props: {},
          children: [{
            type: "#text",
            props: { nodeValue: "c2" },
            children: [],
          }],
        },
      ] as unknown as VNode;
    const html = renderToString(() => ({
      type: Comp,
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("c1");
    expect(html).toContain("c2");
  });

  /** 子节点带 key 时输出 data-view-keyed 包裹与 data-key */
  it("带 key 的子节点输出 data-view-keyed 与 data-key", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: [
          {
            type: "span",
            props: {},
            key: "k1",
            children: [{
              type: "#text",
              props: { nodeValue: "a" },
              children: [],
            }],
          },
        ],
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("data-view-keyed");
    expect(html).toContain('data-key="k1"');
    expect(html).toContain("a");
  });

  /** void 元素（如 br）无闭合标签、无 inner 内容 */
  it("void 元素无闭合标签且无 inner", () => {
    const html = renderToString(() => ({
      type: "br",
      props: {},
      children: [] as VNode[],
    }));
    expect(html).toContain("<br");
    expect(html).not.toContain("</br>");
    expect(html).not.toContain("><");
  });

  /** 数组 children 含 null 时仅渲染非 null 项 */
  it("数组 children 含 null 时仅渲染非 null 项", () => {
    const html = renderToString(() => ({
      type: "div",
      props: {
        children: [
          null,
          { type: "#text", props: { nodeValue: "only" }, children: [] },
          undefined,
        ],
      },
      children: [] as VNode[],
    }));
    expect(html).toContain("only");
  });

  /** htmlFor 输出为 for 属性 */
  it("htmlFor 输出为 for 属性", () => {
    const html = renderToString(() => ({
      type: "label",
      props: { htmlFor: "input-id" },
      children: [] as VNode[],
    }));
    expect(html).toContain('for="input-id"');
  });

  /** style 对象输出为 style 字符串 */
  it("style 对象输出为 style 字符串", () => {
    const html = renderToString(() => ({
      type: "div",
      props: { style: { color: "red", marginTop: "8px" } },
      children: [] as VNode[],
    }));
    expect(html).toContain("color");
    expect(html).toContain("red");
    expect(html).toContain("margin-top");
    expect(html).toContain("8px");
  });

  /** vCloak 输出 data-view-cloak（SSR 时用于 FOUC 隐藏） */
  it("vCloak 输出 data-view-cloak", () => {
    const html = renderToString(() => ({
      type: "div",
      props: { vCloak: true },
      children: [] as VNode[],
    }));
    expect(html).toContain("data-view-cloak");
  });

  /** renderToString 传入 options 不报错 */
  it("传入 options 不报错", () => {
    const html = renderToString(
      () => ({
        type: "div",
        props: {},
        children: [] as VNode[],
      }),
      { allowRawHtml: false },
    );
    expect(html).toContain("<div>");
  });

  /** 根返回 null 时 createElementToString 会访问 null.type 导致抛错；renderToString 行为明确 */
  it("根返回 null 时抛错", () => {
    expect(() => renderToString(() => null as unknown as VNode)).toThrow();
  });

  /** ErrorBoundary：子组件抛错时 SSR 渲染 fallback */
  it("ErrorBoundary 子组件抛错时 SSR 渲染 fallback", async () => {
    const { ErrorBoundary } = await import("../../src/boundary.ts");
    function ThrowComp(_props: Record<string, unknown>): VNode {
      throw new Error("child throw");
    }
    const fallbackVNode = (e: unknown) =>
      ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: `caught: ${(e as Error).message}` },
          children: [] as VNode[],
        }],
      }) as VNode;
    const html = renderToString(() =>
      ({
        type: ErrorBoundary,
        props: {
          fallback: fallbackVNode,
          children: { type: ThrowComp, props: {}, children: [] as VNode[] },
        },
        children: [] as VNode[],
      }) as unknown as VNode
    );
    expect(html).toContain("caught: child throw");
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

  it("forceRender：外部路由等场景可手动触发根 effect 重跑", async () => {
    const container = document.createElement("div");
    let tick = 0;
    const root = createRoot(
      () => ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: String(++tick) },
          children: [],
        }],
      }),
      container,
    );
    expect(root.forceRender).toBeDefined();
    expect(container.textContent).toBe("1");
    root.forceRender!();
    await Promise.resolve();
    expect(container.textContent).toBe("2");
    root.forceRender!();
    await Promise.resolve();
    expect(container.textContent).toBe("3");
    root.unmount();
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

describe("mount", () => {
  it("mount(container, fn) 传入 Element 时与 render 一致", () => {
    const container = document.createElement("div");
    const root = mount(
      container,
      () => ({ type: "span", props: {}, children: [] }),
    );
    expect(root.container).toBe(container);
    expect(container.querySelector("span")).not.toBeNull();
    root.unmount();
  });

  it("mount(selector, fn) 传入选择器时解析并挂载", () => {
    const id = "mount-selector-test";
    const container = document.createElement("div");
    container.id = id;
    document.body.appendChild(container);
    try {
      const root = mount(
        "#" + id,
        () => ({ type: "p", props: {}, children: [] }),
      );
      expect(container.querySelector("p")).not.toBeNull();
      root.unmount();
    } finally {
      document.body.removeChild(container);
    }
  });

  it("mount(selector, fn, { noopIfNotFound: true }) 查不到时返回空 Root 不抛错", () => {
    const root = mount(
      "#non-existent-mount-id-xyz",
      () => ({ type: "div", props: {}, children: [] }),
      { noopIfNotFound: true },
    );
    expect(root.container).toBeNull();
    expect(() => root.unmount()).not.toThrow();
  });

  it("mount(selector, fn) 查不到且未设 noopIfNotFound 时抛错", () => {
    expect(() =>
      mount(
        "#non-existent-mount-id-abc",
        () => ({ type: "div", props: {}, children: [] }),
      )
    ).toThrow(/container not found/);
  });

  it("有子节点时走 hydrate 路径（移除 cloak）", () => {
    const container = document.createElement("div");
    container.setAttribute("data-view-cloak", "");
    container.innerHTML = "<span>hydrated</span>";
    const root = mount(
      container,
      () => ({
        type: "span",
        props: {},
        children: [{
          type: "#text",
          props: { nodeValue: "hydrated" },
          children: [],
        }],
      }),
    );
    expect(container.hasAttribute("data-view-cloak")).toBe(false);
    root.unmount();
  });

  it("无子节点时走 render 路径", () => {
    const container = document.createElement("div");
    const root = mount(
      container,
      () => ({ type: "span", props: {}, children: [] }),
    );
    expect(container.querySelector("span")).not.toBeNull();
    root.unmount();
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

  it("首次 hydrate 后，状态变化时应走 patchRoot 细粒度更新（未变节点保持同一 DOM 引用）", async () => {
    const [getCount, setCount] = createSignal(0);
    const container = document.createElement("div");
    container.innerHTML =
      '<div><input data-testid="input"><span data-testid="count">0</span></div>';
    const root = hydrate(
      () =>
        ({
          type: "div",
          props: {},
          children: [
            {
              type: "input",
              props: { type: "text", "data-testid": "input" },
              children: [],
            },
            {
              type: "span",
              props: { "data-testid": "count" },
              children: [{
                type: "#text",
                props: { nodeValue: String(getCount()) },
                children: [],
              }],
            },
          ],
        }) as VNode,
      container,
    );
    await Promise.resolve();
    await Promise.resolve();
    const inputRef = container.querySelector('[data-testid="input"]');
    const countSpan = container.querySelector('[data-testid="count"]');
    expect(inputRef).not.toBeNull();
    expect(countSpan?.textContent).toBe("0");

    setCount(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(countSpan?.textContent).toBe("1");
    expect(container.contains(inputRef)).toBe(true);
    const inputStillSame = container.querySelector('[data-testid="input"]');
    expect(inputStillSame).toBe(inputRef);

    root.unmount();
  });
});
