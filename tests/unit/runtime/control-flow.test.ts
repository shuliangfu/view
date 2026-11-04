import { describe, expect, it } from "@dreamer/test";
import { createSignal, For, Match, Show, Switch } from "@dreamer/view";
import { flushPendingSync } from "../../../src/scheduler/batch.ts";
import { jsx } from "@dreamer/view/jsx-runtime";
import "../dom-setup.ts";

describe("runtime/control-flow", () => {
  it("Show: 应当根据条件切换内容", async () => {
    const [visible, setVisible] = createSignal(true);
    const parent = document.createElement("div");

    const content = document.createElement("span");
    content.textContent = "Visible";

    const fallback = document.createTextNode("Fallback");

    const fragment = Show({
      when: () => visible(),
      children: content,
      fallback: fallback as any,
    });

    parent.appendChild(fragment);

    // 初始执行一次 flush
    await Promise.resolve();

    // 初始状态
    expect(parent.contains(content)).toBe(true);
    expect(parent.textContent).toBe("Visible");

    // 切换到不可见
    setVisible(false);
    await Promise.resolve();
    expect(parent.contains(content)).toBe(false);
    expect(parent.textContent).toBe("Fallback");

    // 切换回可见
    setVisible(true);
    await Promise.resolve();
    expect(parent.textContent).toBe("Visible");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("Show: when 可直接传 Signal getter（MaybeAccessor）", async () => {
    const [visible, setVisible] = createSignal(true);
    const parent = document.createElement("div");
    const content = document.createElement("span");
    content.textContent = "On";
    const fallback = document.createTextNode("Off");

    const fragment = Show({
      when: visible,
      children: content,
      fallback: fallback as any,
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    expect(parent.textContent).toBe("On");

    setVisible(false);
    await Promise.resolve();
    expect(parent.textContent).toBe("Off");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("For: 应当渲染列表并支持物理复用", async () => {
    const [list, setList] = createSignal([{ id: 1, text: "A" }, {
      id: 2,
      text: "B",
    }]);
    const parent = document.createElement("div");

    const fragment = For({
      each: () => list(),
      children: (item: { text: string }) => {
        const span = document.createElement("span");
        span.textContent = item.text;
        return span;
      },
    });

    parent.appendChild(fragment);

    // 初始异步 flush
    await Promise.resolve();
    expect(parent.querySelectorAll("span").length).toBe(2);
    expect(parent.textContent).toBe("AB");

    // 更新列表（添加一项）
    setList([...list(), { id: 3, text: "C" }]);
    await Promise.resolve();
    expect(parent.textContent).toBe("ABC");

    // 检查第一个节点是否复用 (物理复用) - 简化检查
    expect(parent.querySelectorAll("span").length).toBe(3);

    // 更新列表（删除第一项）
    const secondItem = list()[1];
    setList([secondItem]);
    await Promise.resolve();
    expect(parent.textContent).toBe("B");
    expect(parent.querySelectorAll("span").length).toBe(1);
  });

  it("For: each 可直接传 Signal getter（MaybeAccessor）", async () => {
    const [list, setList] = createSignal([{ id: 1, text: "X" }]);
    const parent = document.createElement("div");
    const fragment = For({
      each: list,
      children: (item: { text: string }) => {
        const span = document.createElement("span");
        span.textContent = item.text;
        return span;
      },
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    expect(parent.textContent).toBe("X");

    setList([{ id: 2, text: "Y" }]);
    await Promise.resolve();
    expect(parent.textContent).toBe("Y");
  });

  it("Switch/Match: 只应显示第一个 when 为真的分支", async () => {
    const [tab, setTab] = createSignal<"a" | "b" | "none">("a");
    const parent = document.createElement("div");

    const fb = document.createElement("span");
    fb.textContent = "fallback";

    const elA = document.createElement("span");
    elA.className = "sw-a";
    elA.textContent = "A";
    const elB = document.createElement("span");
    elB.className = "sw-b";
    elB.textContent = "B";

    const fragment = Switch({
      fallback: fb,
      children: [
        jsx(Match, {
          when: () => tab() === "a",
          children: elA,
        }),
        jsx(Match, {
          when: () => tab() === "b",
          children: elB,
        }),
      ],
    });

    parent.appendChild(fragment);
    await Promise.resolve();

    expect(parent.querySelector(".sw-a")).not.toBeNull();
    expect(parent.querySelector(".sw-b")).toBeNull();
    expect(parent.contains(fb)).toBe(false);

    setTab("b");
    await Promise.resolve();
    expect(parent.querySelector(".sw-a")).toBeNull();
    expect(parent.querySelector(".sw-b")).not.toBeNull();

    setTab("none");
    await Promise.resolve();
    expect(parent.querySelector(".sw-a")).toBeNull();
    expect(parent.querySelector(".sw-b")).toBeNull();
    expect(parent.textContent).toContain("fallback");
  });

  it("Match: when 可为静态真值（MaybeAccessor）", async () => {
    const parent = document.createElement("div");
    const fragment = Switch({
      fallback: document.createTextNode("fb"),
      children: [
        jsx(Match, {
          when: true,
          children: document.createTextNode("static-true"),
        }),
        jsx(Match, {
          when: false,
          children: document.createTextNode("static-false"),
        }),
      ],
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    expect(parent.textContent).toBe("static-true");
  });

  it("For + key：反转/洗牌后节点身份保持且顺序正确（LIS 重排）", async () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      text: id.toUpperCase(),
    }));
    const [list, setList] = createSignal(items.slice());
    const parent = document.createElement("div");
    const fragment = For<{ id: string; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const span = document.createElement("span");
        span.dataset.id = item.id;
        span.textContent = item.text;
        return span;
      },
    });
    parent.appendChild(fragment);
    flushPendingSync();
    await Promise.resolve();

    const nodeById = new Map<string, HTMLElement>();
    for (const id of ["a", "b", "c", "d", "e"]) {
      nodeById.set(
        id,
        parent.querySelector(`[data-id="${id}"]`) as HTMLElement,
      );
    }
    expect(parent.textContent).toBe("ABCDE");

    // 全反转
    setList([...list()].reverse());
    flushPendingSync();
    await Promise.resolve();
    expect(parent.textContent).toBe("EDCBA");
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(parent.querySelector(`[data-id="${id}"]`)).toBe(nodeById.get(id));
    }

    // 局部洗牌：a c e b d
    const byId = Object.fromEntries(items.map((x) => [x.id, x]));
    setList([byId.a!, byId.c!, byId.e!, byId.b!, byId.d!]);
    flushPendingSync();
    await Promise.resolve();
    expect(parent.textContent).toBe("ACEBD");
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(parent.querySelector(`[data-id="${id}"]`)).toBe(nodeById.get(id));
    }
    expect(
      Array.from(parent.querySelectorAll("span")).map((el) =>
        (el as HTMLElement).dataset.id
      ),
    ).toEqual(["a", "c", "e", "b", "d"]);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("For + key：中间插入一项时前后节点应保持身份（最小移动）", async () => {
    const a = { id: "a", text: "A" };
    const b = { id: "b", text: "B" };
    const c = { id: "c", text: "C" };
    const [list, setList] = createSignal([a, c]);
    const parent = document.createElement("div");
    const fragment = For<{ id: string; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const span = document.createElement("span");
        span.dataset.id = item.id;
        span.textContent = item.text;
        return span;
      },
    });
    parent.appendChild(fragment);
    flushPendingSync();
    await Promise.resolve();

    const elA = parent.querySelector('[data-id="a"]') as HTMLElement;
    const elC = parent.querySelector('[data-id="c"]') as HTMLElement;
    expect(elA && elC).toBeTruthy();

    setList([a, b, c]);
    flushPendingSync();
    await Promise.resolve();

    expect(parent.querySelector('[data-id="a"]')).toBe(elA);
    expect(parent.querySelector('[data-id="c"]')).toBe(elC);
    expect(parent.textContent).toBe("ABC");
    expect(parent.children[0]).toBe(elA);
    expect(parent.children[2]).toBe(elC);
  }, { sanitizeOps: false, sanitizeResources: false });

  it("For + key：重排后应复用同一 DOM 节点（同对象引用）", async () => {
    const itemA = { id: "a", text: "A" };
    const itemB = { id: "b", text: "B" };
    const [list, setList] = createSignal([itemA, itemB]);
    const parent = document.createElement("div");

    const fragment = For<{ id: string; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const span = document.createElement("span");
        span.dataset.id = item.id;
        span.textContent = item.text;
        return span;
      },
    });

    parent.appendChild(fragment);
    await Promise.resolve();
    await Promise.resolve();

    // 键控行无元素壳：行内容为父级直接子元素
    expect(parent.querySelector("[data-view-for-keyed]")).toBeNull();
    const elA = parent.querySelector('[data-id="a"]') as HTMLElement;
    const elB = parent.querySelector('[data-id="b"]') as HTMLElement;
    expect(elA?.textContent).toBe("A");
    expect(elB?.textContent).toBe("B");
    expect(parent.children[0]).toBe(elA);
    expect(parent.children[1]).toBe(elB);

    // 同对象引用重排：仅改下标，不重跑 children → 节点身份保持
    setList([itemB, itemA]);
    flushPendingSync();
    await Promise.resolve();

    expect(parent.children[0]).toBe(elB);
    expect(parent.children[1]).toBe(elA);
    expect(parent.querySelector('[data-id="b"]')).toBe(elB);
    expect(parent.querySelector('[data-id="a"]')).toBe(elA);
    expect(parent.textContent).toBe("BA");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("For + key：同序更新字段后文案正确且仍为直接子元素", async () => {
    const [list, setList] = createSignal([
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ]);
    const parent = document.createElement("div");
    const fragment = For<{ id: string; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const span = document.createElement("span");
        span.className = "row";
        span.dataset.id = item.id;
        span.textContent = item.text;
        return span;
      },
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    flushPendingSync();

    expect(parent.children.length).toBe(2);

    setList([
      { id: "a", text: "A2" },
      { id: "b", text: "B2" },
    ]);
    flushPendingSync();
    await Promise.resolve();

    expect(parent.querySelectorAll(":scope > .row").length).toBe(2);
    expect(parent.querySelector('[data-id="a"]')?.textContent).toBe("A2");
    expect(parent.querySelector('[data-id="b"]')?.textContent).toBe("B2");
    expect(parent.textContent).toBe("A2B2");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("For + key：末尾追加项时已有元素仍复用（同对象引用）", async () => {
    const itemA = { id: "a", text: "A" };
    const [list, setList] = createSignal([itemA]);
    const parent = document.createElement("div");
    const fragment = For<{ id: string; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const span = document.createElement("span");
        span.dataset.id = item.id;
        span.textContent = item.text;
        return span;
      },
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    flushPendingSync();

    const elA = parent.querySelector('[data-id="a"]') as HTMLElement;
    setList([itemA, { id: "b", text: "B" }]);
    flushPendingSync();
    await Promise.resolve();

    expect(parent.children.length).toBe(2);
    expect(parent.querySelector('[data-id="a"]')).toBe(elA);
    expect(parent.textContent).toBe("AB");
  }, { sanitizeOps: false, sanitizeResources: false });

  it("For + key：行内容为父级直接子元素（无 span 壳）", async () => {
    const [list] = createSignal([
      { id: "1", text: "x" },
      { id: "2", text: "y" },
    ]);
    const parent = document.createElement("div");
    const fragment = For<{ id: string; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const div = document.createElement("div");
        div.className = "item";
        div.textContent = item.text;
        return div;
      },
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    flushPendingSync();

    expect(parent.querySelectorAll(":scope > .item").length).toBe(2);
    expect(parent.querySelector("[data-view-for-keyed]")).toBeNull();
    // 注释锚点存在于 childNodes，但不进入 .children
    const comments = Array.from(parent.childNodes).filter(
      (n) => n.nodeType === Node.COMMENT_NODE,
    );
    expect(comments.length).toBeGreaterThanOrEqual(2);
  }, { sanitizeOps: false, sanitizeResources: false });


  it("Switch: 使用注释锚点且无 data-view-switch 节点", async () => {
    const [tab, setTab] = createSignal<"a" | "b">("a");
    const parent = document.createElement("div");
    const fragment = Switch({
      fallback: document.createTextNode("none"),
      children: [
        jsx(Match, {
          when: () => tab() === "a",
          children: document.createTextNode("A"),
        }),
        jsx(Match, {
          when: () => tab() === "b",
          children: document.createTextNode("B"),
        }),
      ],
    });
    parent.appendChild(fragment);
    await Promise.resolve();
    expect(parent.querySelector("[data-view-switch]")).toBeNull();
    const comments = Array.from(parent.childNodes).filter(
      (n) => n.nodeType === Node.COMMENT_NODE,
    ) as Comment[];
    expect(comments.some((c) => c.data === "view:switch")).toBe(true);
    expect(comments.some((c) => c.data === "/view:switch")).toBe(true);
    expect(parent.textContent).toContain("A");
    setTab("b");
    await Promise.resolve();
    expect(parent.querySelector("[data-view-switch]")).toBeNull();
    expect(parent.textContent).toContain("B");
  });

  it("Switch: 切换分支时不应删除插槽外的兄弟节点（如上方按钮区）", async () => {
    const [tab, setTab] = createSignal<"a" | "b">("a");
    const section = document.createElement("section");
    const buttons = document.createElement("div");
    buttons.id = "switch-demo-buttons";
    buttons.textContent = "buttons";
    section.appendChild(buttons);

    const fragment = Switch({
      fallback: document.createTextNode("none"),
      children: [
        jsx(Match, {
          when: () => tab() === "a",
          children: document.createTextNode("A-out"),
        }),
        jsx(Match, {
          when: () => tab() === "b",
          children: document.createTextNode("B-out"),
        }),
      ],
    });
    section.appendChild(fragment);
    await Promise.resolve();

    expect(section.contains(buttons)).toBe(true);
    expect(section.textContent).toContain("buttons");

    setTab("b");
    await Promise.resolve();
    expect(section.contains(buttons)).toBe(true);
    expect(section.textContent).toContain("buttons");
  });
}, { sanitizeOps: false, sanitizeResources: false });
