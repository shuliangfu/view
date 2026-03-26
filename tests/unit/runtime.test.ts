/**
 * @fileoverview Runtime 单元测试：generateHydrationScript、createRoot/render/mount（编译路径 fn(container)=>void）
 * 注：renderToString 为编译路径，见 tests/unit/ssr-compiled.test.ts
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createRoot,
  createSignal,
  generateHydrationScript,
  insert,
  insertReactive,
  markMountFn,
  mount,
  render,
} from "@dreamer/view";

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
}, { sanitizeOps: false, sanitizeResources: false });

describe("createRoot / render (DOM，新标准 fn(container)=>void)", () => {
  it("应挂载到 container 并返回 Root", () => {
    const container = document.createElement("div");
    const root = createRoot((el) => {
      const span = document.createElement("span");
      el.appendChild(span);
    }, container);
    expect(root.container).toBe(container);
    expect(root.unmount).toBeDefined();
    expect(container.querySelector("span")).not.toBeNull();
    root.unmount();
    expect(container.textContent).toBe("");
  });

  it("render 等同于 createRoot", () => {
    const container = document.createElement("div");
    const root = render((el) => {
      const p = document.createElement("p");
      el.appendChild(p);
    }, container);
    expect(container.querySelector("p")).not.toBeNull();
    root.unmount();
  });

  it("fn 内用 insert(getter) 时，signal 变更后应更新 DOM", async () => {
    const container = document.createElement("div");
    const s = createSignal(0);
    const root = createRoot((el) => {
      insert(el, () => String(s.value));
    }, container);
    expect(container.textContent).toBe("0");
    s.value = 1;
    await Promise.resolve();
    expect(container.textContent).toBe("1");
    root.unmount();
  });

  /**
   * JSX `{ count }` 会编成 getter 返回 `count` 引用而非 `count()`；insertReactive 须在 effect 内对 signal getter 解包，
   * 否则文本为空且 set 后不刷新（Globals 示例曾表现为「按钮点了没反应」）。
   */
  it("insert(getter) 在 getter 直接返回 SignalRef 时应显示当前值并随 .value 更新", async () => {
    const container = document.createElement("div");
    const s = createSignal(99);
    const root = createRoot((el) => {
      insert(el, () => s as unknown as string);
    }, container);
    expect(container.textContent).toBe("99");
    s.value = 100;
    await Promise.resolve();
    expect(container.textContent).toBe("100");
    root.unmount();
  });

  it("边界：fn 空实现时挂载空", () => {
    const container = document.createElement("div");
    const root = createRoot((_el) => {}, container);
    expect(root.container).toBe(container);
    expect(container.childNodes.length).toBe(0);
    root.unmount();
  });

  it("边界：container 已有子节点时 createRoot 追加内容（不抛错）", () => {
    const container = document.createElement("div");
    const existing = document.createElement("p");
    existing.textContent = "existing";
    container.appendChild(existing);
    const root = createRoot((el) => {
      const span = document.createElement("span");
      el.appendChild(span);
    }, container);
    expect(container.querySelector("span")).not.toBeNull();
    expect(container.querySelector("p")).not.toBeNull();
    root.unmount();
  });

  it("边界：unmount 后再次 set signal 不抛错、不更新 DOM", async () => {
    const container = document.createElement("div");
    const s = createSignal(0);
    const root = createRoot((el) => {
      insert(el, () => String(s.value));
    }, container);
    root.unmount();
    expect(() => s.value = 1).not.toThrow();
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("mount", () => {
  it("mount(container, fn) 传入 Element 时与 render 一致", () => {
    const container = document.createElement("div");
    const root = mount(container, (el) => {
      const span = document.createElement("span");
      el.appendChild(span);
    });
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
      const root = mount("#" + id, (el) => {
        const p = document.createElement("p");
        el.appendChild(p);
      });
      expect(container.querySelector("p")).not.toBeNull();
      root.unmount();
    } finally {
      document.body.removeChild(container);
    }
  });

  it("mount(selector, fn, { noopIfNotFound: true }) 查不到时返回空 Root 不抛错", () => {
    const root = mount(
      "#non-existent-mount-id-xyz",
      (el) => insert(el, "x"),
      { noopIfNotFound: true },
    );
    expect(root.container).toBeNull();
    expect(() => root.unmount()).not.toThrow();
  });

  it("mount(selector, fn) 查不到且未设 noopIfNotFound 时抛错", () => {
    expect(() => mount("#non-existent-mount-id-abc", (el) => insert(el, "x")))
      .toThrow(/container not found/);
  });

  it("mount 始终走 render 路径，fn(container) 只执行一次", () => {
    const container = document.createElement("div");
    const root = mount(container, (el) => {
      const span = document.createElement("span");
      el.appendChild(span);
    });
    expect(container.querySelector("span")).not.toBeNull();
    root.unmount();
  });

  /**
   * insertReactive 收到非空 DocumentFragment 时应用 appendChild 移动子树，并把真实子节点记入 currentNodes
   * （避免把已消费的 fragment 当作唯一节点，导致后续 effect 用空 fragment replaceChildren 清空父级）。
   */
  /**
   * 条件 JSX 编译为 `insertReactive(父, () => cond && mountFn)`；cond 为假时 getter 得 false/null 等，
   * 若用 replaceChildren 会清空父下全部子节点，误删先挂载的兄弟（如 Form），与 form 示例白屏同源。
   */
  it("insertReactive 在 getter 返回 null 时不得 replaceChildren 清空父级兄弟节点", () => {
    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const form = document.createElement("form");
    form.setAttribute("data-testid", "keep-form");
    holder.appendChild(form);
    createRoot((el) => {
      insertReactive(el, () => null);
    }, holder);
    expect(holder.querySelector("form[data-testid=keep-form]")).not.toBeNull();
    document.body.removeChild(holder);
  });

  /**
   * 编译器为自定义组件 children 生成单参挂载函数；Form 内 `insertReactive(form, () => props.children)`
   * 须在首次 effect 中识别并调用该函数，否则 form 内无子节点（用户看到「空表单」）。
   */
  it("insertReactive(槽位) 在 getter 返回 (parent)=>void 时应把子树挂到槽位父节点", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    createRoot((el) => {
      const childMount = markMountFn((p: Node) => {
        const span = document.createElement("span");
        span.className = "fm-child";
        span.textContent = "in-form";
        p.appendChild(span);
      });
      const props = { children: childMount };
      const formMount = (parent: Element) => {
        const f = document.createElement("form");
        parent.appendChild(f);
        insertReactive(f, () => props.children);
      };
      formMount(el);
    }, container);
    expect(container.querySelector("form .fm-child")?.textContent).toBe(
      "in-form",
    );
    document.body.removeChild(container);
  });

  it("insertReactive(getter→DocumentFragment) 应把 fragment 内子节点挂到父级", () => {
    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const frag = document.createDocumentFragment();
    const s = document.createElement("span");
    s.textContent = "frag-child";
    frag.appendChild(s);
    createRoot((el) => {
      insertReactive(el, () => frag);
    }, holder);
    expect(holder.querySelector("span")?.textContent).toBe("frag-child");
    document.body.removeChild(holder);
  });

  /**
   * 组件返回 `() => VNode`（零参 getter，如示例 Form/FormItem）时，mountVNodeTree 不得当成 MountFn
   * 也不得落成空文本节点，应展开为真实 DOM（与 Fragment 子为函数同理）。
   */
  it("insert(getter→VNode) 内函数组件返回 () => VNode 时应渲染子元素", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    /** 模拟返回 `() => VNode` 的组件；与 Form 示例一致，公类型未单独建模 */
    const GetterSpan = (_props: Record<string, unknown>) => () => ({
      type: "span",
      props: { children: "getter-inner" },
    });
    createRoot((el) => {
      insert(
        el,
        (() => ({
          type: GetterSpan as unknown as import("@dreamer/view").VNode["type"],
          props: {},
        })) as never,
      );
    }, container);
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("getter-inner");
    document.body.removeChild(container);
  });

  /**
   * 未走 compileSource 时，打包器可能对静态 JSX 生成 `insert(parent, jsx(...))`（第二参为 VNode 对象而非 getter）。
   * 须走 mountVNodeTree，不得落入 insertStatic→toNodeForInsert。
   */
  it("insert(静态 VNode) 应展开本征子树（模拟 esbuild 静态 JSX）", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const staticVNode = {
      type: "p" as const,
      props: { className: "static-jsx", children: "leaf" },
      key: undefined,
      children: "leaf" as unknown,
    } as import("@dreamer/view").VNode;
    createRoot((el) => {
      insert(el, staticVNode as never);
    }, container);
    const p = container.querySelector("p.static-jsx");
    expect(p?.textContent).toBe("leaf");
    document.body.removeChild(container);
  });

  /**
   * 同一父下先有 insertReactive(VNode) 后有静态兄弟时，响应式更新须在**原位置**替换；
   * 若错误地 append 到父末尾，DOM 会变成 [main, aside]（文档站侧栏跑到右侧）。
   */
  it("insertReactive 更新 VNode 时应保持在兄弟节点之前而非追加到父末尾", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const n = createSignal(0);
    createRoot((el) => {
      insert(el, () => ({
        type: "aside",
        props: { children: String(n.value) },
      }));
      const main = document.createElement("main");
      main.textContent = "main";
      el.appendChild(main);
    }, container);
    /** 首轮 insertReactive 可能在微任务中挂载，须先 flush 再验初始顺序 */
    await Promise.resolve();
    const tags = () =>
      Array.from(container.children).map((c) => c.tagName.toLowerCase());
    expect(tags()).toEqual(["aside", "main"]);
    n.value = 1;
    await Promise.resolve();
    expect(tags()).toEqual(["aside", "main"]);
    expect(container.querySelector("aside")?.textContent).toBe("1");
    document.body.removeChild(container);
  });
}, { sanitizeOps: false, sanitizeResources: false });
