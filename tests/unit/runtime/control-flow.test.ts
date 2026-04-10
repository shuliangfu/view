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

  it("For + key：重排后应复用同一 DOM 节点", async () => {
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
        span.textContent = item.text;
        return span;
      },
    });

    parent.appendChild(fragment);
    await Promise.resolve();
    await Promise.resolve();

    // 键控 For 每行有外层壳 span[data-view-for-keyed] + 内层 children，勿用 querySelectorAll("span") 按文档序当下标
    const shellsBefore = parent.querySelectorAll("[data-view-for-keyed]");
    const shellA = shellsBefore[0] as HTMLElement;
    const shellB = shellsBefore[1] as HTMLElement;
    expect(shellA?.firstElementChild?.textContent).toBe("A");
    expect(shellB?.firstElementChild?.textContent).toBe("B");

    setList([
      { id: "b", text: "B" },
      { id: "a", text: "A" },
    ]);
    flushPendingSync();
    await Promise.resolve();

    const shellsAfter = parent.querySelectorAll("[data-view-for-keyed]");
    expect(shellsAfter[0]).toBe(shellB);
    expect(shellsAfter[1]).toBe(shellA);
    expect(shellsAfter[0]?.firstElementChild?.textContent).toBe("B");
    expect(shellsAfter[1]?.firstElementChild?.textContent).toBe("A");
    expect(parent.textContent).toBe("BA");
  }, { sanitizeOps: false, sanitizeResources: false });

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
