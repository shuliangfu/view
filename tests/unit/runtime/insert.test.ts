import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRoot, createSignal, insert, onError } from "@dreamer/view";

describe("runtime/insert", () => {
  it("静态插入：应当插入普通文本", () => {
    const parent = document.createElement("div");
    insert(parent, "Hello World");
    expect(parent.textContent).toBe("Hello World");
  });

  it("动态插入：应当随 Signal 更新 (异步测试)", async () => {
    const parent = document.createElement("div");
    const [count, setCount] = createSignal(0);

    // 注入锚点
    const marker = document.createTextNode("");
    parent.appendChild(marker);

    insert(parent, () => count(), marker);

    // 初始异步执行一次 flush
    await Promise.resolve();
    expect(marker.textContent).toBe("0");

    setCount(1);
    await Promise.resolve();
    expect(marker.textContent).toBe("1");
  });

  /**
   * 同步 Thunk 超过 insert 内 MAX_SYNC_THUNK_DEPTH 时由 insert 抛错；
   * createEffect 会 catch 并走 catchError，故用根 onError 断言。
   */
  it("同步 Thunk 链过深应产生可捕获错误", () => {
    const parent = document.createElement("div");
    const marker = document.createTextNode("");
    parent.appendChild(marker);

    /** 每层返回下一层 Thunk，共 depth 层后落到字符串 */
    function deepThunk(n: number): () => unknown {
      if (n <= 0) return () => "end";
      return () => deepThunk(n - 1);
    }

    let caught: unknown;
    createRoot((_dispose) => {
      onError((e) => {
        caught = e;
      });
      insert(parent, deepThunk(5000), marker);
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/同步 Thunk 嵌套超过/);
  });

  /**
   * `<details>` 下多子若被包在元素壳里，壳会成为第一个元素子，浏览器不再把内层 `<summary>` 当作标题，
   * 会显示本地化默认文案（如「详情」）。插入逻辑须把子节点直接挂在 `details` 下。
   */
  /**
   * `space-y-*` 等依赖「多个元素子节点」；数组插入须让这些节点成为父级直接子元素，且不在其前插注释（避免破坏 :first-child）。
   */
  it("数组子项为父级直接元素子节点，且尾锚为注释", async () => {
    const parent = document.createElement("div");
    const a = document.createElement("div");
    a.textContent = "a";
    const b = document.createElement("div");
    b.textContent = "b";
    insert(parent, [a, b]);
    await Promise.resolve();

    expect(parent.querySelector("[data-view-array-shell]")).toBeNull();
    const elChildren = Array.from(parent.children);
    expect(elChildren.length).toBe(2);
    expect(elChildren[0]).toBe(a);
    expect(elChildren[1]).toBe(b);
    const last = parent.lastChild;
    expect(last?.nodeType).toBe(Node.COMMENT_NODE);
    expect((last as Comment).data).toBe("view:array-end");
  });

  it("details 多子：首子须为 summary，不得出现 data-view-array-shell", async () => {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "基础组件";
    const ul = document.createElement("ul");
    const li = document.createElement("li");
    li.textContent = "Button";
    ul.appendChild(li);

    insert(details, [summary, ul]);
    await Promise.resolve();

    expect(details.querySelector("[data-view-array-shell]")).toBeNull();
    expect(details.firstElementChild).toBe(summary);
    expect(details.firstElementChild?.textContent).toBe("基础组件");
  });

  it("details 多子：Signal 更新后仍保持 summary 为直接子元素", async () => {
    const details = document.createElement("details");
    const [label, setLabel] = createSignal("A");

    insert(details, () => {
      const s = document.createElement("summary");
      s.textContent = String(label());
      const d = document.createElement("div");
      d.textContent = "body";
      return [s, d];
    });

    await Promise.resolve();
    expect(details.firstElementChild?.nodeName).toBe("SUMMARY");
    expect(details.firstElementChild?.textContent).toBe("A");

    setLabel("B");
    await Promise.resolve();
    expect(details.querySelector("[data-view-array-shell]")).toBeNull();
    expect(details.firstElementChild?.nodeName).toBe("SUMMARY");
    expect(details.firstElementChild?.textContent).toBe("B");
  });
}, { sanitizeOps: false, sanitizeResources: false });
