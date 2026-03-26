/**
 * 编译期运行时单元测试：手写「编译产物」形态，验证 insert + createRoot + createSignal。
 * 使用 @dreamer/test；不经过真实 JSX 编译器，仅验证细粒度更新与组件只跑一次的模型。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createRoot,
  createSignal,
  hydrate,
  insert,
  insertReactive,
  markMountFn,
  render,
  renderToString,
} from "@dreamer/view/compiler";
import type { InsertValue } from "@dreamer/view/compiler";

describe("runtime", () => {
  it("insert 静态文本应直接挂到容器", () => {
    const container = document.createElement("div");
    createRoot((el: Element) => {
      insert(el, "hello");
    }, container);
    expect(container.textContent).toBe("hello");
  });

  it("insert 静态数字应转为文本挂到容器", () => {
    const container = document.createElement("div");
    createRoot((el: Element) => {
      insert(el, 42);
    }, container);
    expect(container.textContent).toBe("42");
  });

  it("insert 静态 null/undefined 应挂空文本节点", () => {
    const container = document.createElement("div");
    createRoot((el: Element) => {
      insert(el, null);
      insert(el, undefined);
    }, container);
    expect(container.childNodes.length).toBe(2);
    expect(container.textContent).toBe("");
  });

  it("insert 静态 Node 应直接追加该节点", () => {
    const container = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = "from-node";
    createRoot((el: Element) => {
      insert(el, span);
    }, container);
    expect(container.firstChild).toBe(span);
    expect(container.textContent).toBe("from-node");
  });

  it("insert getter 返回 null/undefined 时应显示空文本", async () => {
    const container = document.createElement("div");
    const s = createSignal<string | null>("a");
    createRoot((el: Element) => {
      insert(el, () => s.value);
    }, container);
    expect(container.textContent).toBe("a");
    s.value = null;
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });

  it("insert getter 返回 Node 时应替换为该节点", async () => {
    const container = document.createElement("div");
    const s = createSignal<"a" | "b">("a");
    const nodeA = document.createTextNode("A");
    const nodeB = document.createTextNode("B");
    createRoot((el: Element) => {
      insert(el, () => (s.value === "a" ? nodeA : nodeB));
    }, container);
    expect(container.textContent).toBe("A");
    s.value = "b";
    await Promise.resolve();
    expect(container.textContent).toBe("B");
    expect(container.firstChild).toBe(nodeB);
  });

  /** insert 的 toNode 对非 string/number/Node/null/undefined 会落为空文本 */
  it("insert getter 返回非标准值（如普通对象）时应显示空文本", async () => {
    const container = document.createElement("div");
    const s = createSignal<unknown>("ok");
    createRoot((el: Element) => {
      insert(
        el,
        () =>
          (typeof s.value === "string" ? s.value : {}) as
            | string
            | number
            | Node
            | null
            | undefined,
      );
    }, container);
    expect(container.textContent).toBe("ok");
    s.value = { not: "a node" };
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });

  it("render 与 createRoot 等价", () => {
    const container = document.createElement("div");
    const root = render((el: Element) => {
      insert(el, "from render");
    }, container);
    expect(container.textContent).toBe("from render");
    expect(root.container).toBe(container);
    root.unmount();
  });

  it("insert getter 应细粒度更新（仅该插入点随 signal 变）", async () => {
    const container = document.createElement("div");
    const count = createSignal(0);
    let runCount = 0;
    createRoot((el: Element) => {
      const wrap = document.createElement("span");
      el.appendChild(wrap);
      insert(wrap, () => {
        runCount++;
        return count.value;
      });
    }, container);

    expect(container.textContent).toBe("0");
    expect(runCount).toBe(1);

    count.value = 1;
    await Promise.resolve();
    expect(container.textContent).toBe("1");
    /**
     * `insertReactive` 重跑前 `onCleanup` 内 {@link runInsertReactiveIntrinsicVNodeCleanup} 会
     * `untrack(() => readReactiveInsertRawFromGetter(getter))` 预读下一轮，故每次依赖更新 getter 执行 2 次（peek + 正跑）。
     */
    expect(runCount).toBe(3);

    count.value = 2;
    await Promise.resolve();
    expect(container.textContent).toBe("2");
    expect(runCount).toBe(5);
  });

  it("unmount 后应回收 effect，不再响应 signal", async () => {
    const container = document.createElement("div");
    const count = createSignal(0);
    const root = createRoot((el: Element) => {
      insert(el, () => String(count.value));
    }, container);

    expect(container.textContent).toBe("0");
    root.unmount();
    // unmount 会清空容器，故此处为 ""；且 set 后 effect 已回收，不会把内容写回
    expect(container.textContent).toBe("");
    count.value = 1;
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });

  /**
   * 手写「编译后」简单列表：列表项由 signal 驱动，仅插入点更新，无整树 replace。
   */
  it("简单列表：items 为 signal，仅各 insert 随依赖更新", async () => {
    const container = document.createElement("div");
    const items = createSignal([1, 2, 3]);
    const runCounts: number[] = [];
    createRoot((el: Element) => {
      const ul = document.createElement("ul");
      el.appendChild(ul);
      const list = () => items.value;
      for (let i = 0; i < 3; i++) {
        const li = document.createElement("li");
        ul.appendChild(li);
        const idx = i;
        insert(li, () => {
          runCounts[idx] = (runCounts[idx] ?? 0) + 1;
          return String(list()[idx]);
        });
      }
    }, container);

    expect(container.querySelector("ul")?.childElementCount).toBe(3);
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3");
    expect(runCounts).toEqual([1, 1, 1]);

    items.value = [10, 2, 3];
    await Promise.resolve();
    expect(container.textContent).toContain("10");
    /** 同上：每条 insert 的 effect 每次重跑前 peek + 体各调一次 getter */
    expect(runCounts).toEqual([3, 3, 3]);

    items.value = [10, 20, 3];
    await Promise.resolve();
    expect(container.textContent).toContain("20");
    expect(runCounts).toEqual([5, 5, 5]);
  });

  /**
   * 手写「编译后」轮播：current 为 signal，只显示 slides[current.value]，无子组件 replace。
   */
  it("轮播形态：current 变化仅更新单插入点，无整块 replace", async () => {
    const container = document.createElement("div");
    const slides = ["slide0", "slide1", "slide2"];
    const current = createSignal(0);
    let getterRuns = 0;
    createRoot((el: Element) => {
      const wrap = document.createElement("div");
      wrap.className = "carousel";
      el.appendChild(wrap);
      insert(wrap, () => {
        getterRuns++;
        return slides[current.value];
      });
    }, container);

    expect(container.querySelector(".carousel")?.textContent).toBe("slide0");
    expect(getterRuns).toBe(1);

    current.value = 1;
    await Promise.resolve();
    expect(container.querySelector(".carousel")?.textContent).toBe("slide1");
    expect(getterRuns).toBe(3);

    current.value = 2;
    await Promise.resolve();
    expect(container.querySelector(".carousel")?.textContent).toBe("slide2");
    expect(getterRuns).toBe(5);
  });

  it("container 为 null 时应抛明确错误", () => {
    expect(() => createRoot((_el: Element) => {}, null as unknown as Element))
      .toThrow(/container is null or undefined/);
  });

  it("createRoot 返回的 Root.container 与传入的 container 一致", () => {
    const container = document.createElement("div");
    const root = createRoot((el: Element) => insert(el, "x"), container);
    expect(root.container).toBe(container);
    root.unmount();
  });

  it("unmount 多次调用不抛错", () => {
    const container = document.createElement("div");
    const root = createRoot((el: Element) => insert(el, "x"), container);
    expect(() => {
      root.unmount();
      root.unmount();
    }).not.toThrow();
  });

  it("unmount 后容器子节点被清空", () => {
    const container = document.createElement("div");
    const root = createRoot((el: Element) => {
      insert(el, "foo");
    }, container);
    expect(container.textContent).toBe("foo");
    root.unmount();
    expect(container.childNodes.length).toBe(0);
    expect(container.textContent).toBe("");
  });
}, { sanitizeOps: false, sanitizeResources: false });

/**
 * compiler/insert 与 runtime 对齐：单参 MountFn 不得误走 insertReactive；insertReactive 须支持 DocumentFragment。
 */
describe("compiler insert：MountFn 与 insertReactive(DocumentFragment)", () => {
  it("insert(markMountFn) 在 createRoot 下应挂载子节点", () => {
    const container = document.createElement("div");
    createRoot((el: Element) => {
      insert(
        el,
        markMountFn((p: Node) => {
          const span = document.createElement("span");
          span.className = "mf-node";
          span.textContent = "mf";
          p.appendChild(span);
        }) as unknown as InsertValue,
      );
    }, container);
    expect(container.querySelector(".mf-node")?.textContent).toBe("mf");
  });

  it("insertReactive 返回 DocumentFragment 时应挂入子节点（compiler 路径）", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    try {
      insertReactive(parent, () => {
        const f = document.createDocumentFragment();
        const span = document.createElement("span");
        span.className = "frag-child";
        span.textContent = "frag";
        f.appendChild(span);
        return f;
      });
      expect(parent.querySelector(".frag-child")?.textContent).toBe("frag");
    } finally {
      document.body.removeChild(parent);
    }
  });

  it("hydrate 与 insert(markMountFn) 应对齐 SSR DOM", () => {
    const fn = (el: Element) => {
      insert(
        el,
        markMountFn((p: Node) => {
          const span = document.createElement("span");
          span.className = "hy-mf";
          span.textContent = "h";
          p.appendChild(span);
        }) as unknown as InsertValue,
      );
    };
    const html = renderToString(
      fn as unknown as (
        el: import("@dreamer/view/compiler").SSRElement,
      ) => void,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const root = hydrate(fn, container);
    expect(container.querySelector(".hy-mf")?.textContent).toBe("h");
    root.unmount();
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("hydrate", () => {
  /**
   * 同一 fn：服务端 renderToString 出 HTML，客户端 hydrate 复用已有 DOM 并只绑 effect。
   */
  it("复用服务端 DOM、仅绑 effect，signal 更新后仅插入点变化", async () => {
    const count = createSignal(0);
    const fn = (el: Element) => {
      const span = document.createElement("span");
      el.appendChild(span);
      insert(span, () => String(count.value));
    };

    const html = renderToString(
      fn as unknown as (
        el: import("@dreamer/view/compiler").SSRElement,
      ) => void,
    );
    expect(html).toContain("0");

    const container = document.createElement("div");
    container.innerHTML = html;

    const root = hydrate(fn, container);
    expect(container.textContent).toBe("0");
    expect(container.querySelector("span")).not.toBeNull();

    count.value = 1;
    await Promise.resolve();
    expect(container.textContent).toBe("1");

    count.value = 2;
    await Promise.resolve();
    expect(container.textContent).toBe("2");

    root.unmount();
  });

  it("hydrate 后 unmount 应回收 effect", async () => {
    const count = createSignal(0);
    const fn = (el: Element) => {
      insert(el, () => String(count.value));
    };
    const html = renderToString(
      fn as unknown as (
        el: import("@dreamer/view/compiler").SSRElement,
      ) => void,
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    const root = hydrate(fn, container);
    root.unmount();
    count.value = 1;
    await Promise.resolve();
    expect(container.textContent).toBe("0");
  });

  it("多层级 DOM（div > span > 文本）应正确复用并绑 effect", async () => {
    const count = createSignal(0);
    const fn = (el: Element) => {
      const div = document.createElement("div");
      div.className = "wrap";
      el.appendChild(div);
      const span = document.createElement("span");
      div.appendChild(span);
      insert(span, () => String(count.value));
    };
    const html = renderToString(
      fn as unknown as (
        el: import("@dreamer/view/compiler").SSRElement,
      ) => void,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const root = hydrate(fn, container);
    expect(container.querySelector(".wrap span")?.textContent).toBe("0");
    count.value = 1;
    await Promise.resolve();
    expect(container.querySelector(".wrap span")?.textContent).toBe("1");
    root.unmount();
  });

  it("hydrate container 为 null 时应抛明确错误", () => {
    const fn = (el: Element) => insert(el, "x");
    expect(() => hydrate(fn, null as unknown as Element)).toThrow(
      /container is null or undefined/,
    );
  });

  it("hydrate 时服务端 HTML 与 fn 结构不一致（标签不匹配）应抛错", () => {
    const fn = (el: Element) => {
      const span = document.createElement("span");
      el.appendChild(span);
      insert(span, "x");
    };
    const html = renderToString(
      fn as unknown as (
        el: import("@dreamer/view/compiler").SSRElement,
      ) => void,
    );
    const container = document.createElement("div");
    container.innerHTML = "<p>x</p>";
    expect(() => hydrate(fn, container)).toThrow(/mismatch/);
  });

  /** 服务端 DOM 节点少于客户端期望时，迭代器会耗尽，createTextNode 应抛错 */
  it("hydrate 时服务端节点少于客户端期望（迭代器耗尽）应抛错", () => {
    const fn = (el: Element) => {
      const span = document.createElement("span");
      el.appendChild(span);
      insert(span, "x");
    };
    const container = document.createElement("div");
    container.innerHTML = "<span></span>";
    expect(() => hydrate(fn, container)).toThrow(
      /no more server nodes|iterator exhausted/,
    );
  });
}, { sanitizeOps: false, sanitizeResources: false });
