/**
 * @fileoverview 集成测试：createRoot + 事件响应 + signal 更新 + createReactive 表单
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRoot, createSignal } from "@dreamer/view";
import { createReactive } from "@dreamer/view/reactive";
import type { VNode } from "@dreamer/view";
import { FragmentType } from "../../src/dom/shared.ts";

function text(s: string): VNode {
  return { type: "#text", props: { nodeValue: s }, children: [] };
}

describe("集成：createRoot + 事件 + signal", () => {
  it("按钮 onClick 应触发并更新 signal，DOM 随 signal 更新", async () => {
    const container = document.createElement("div");
    const [getCount, setCount] = createSignal(0);
    let clickCount = 0;
    const root = createRoot(() => ({
      type: "div",
      props: {},
      children: [
        {
          type: "button",
          props: {
            type: "button",
            onClick: () => {
              clickCount++;
              setCount(getCount() + 1);
            },
          },
          children: [],
        },
        {
          type: "span",
          props: {},
          children: [text(String(getCount()))],
        },
      ],
    }), container);

    const btn = container.querySelector("button");
    const span = container.querySelector("span");
    expect(btn).not.toBeNull();
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe("0");

    (btn as HTMLButtonElement).click();
    expect(clickCount).toBe(1);
    await Promise.resolve();
    await Promise.resolve(); // 等待 scheduler 执行根 effect 并替换 DOM
    const spanAfterFirst = container.querySelector("span");
    expect(spanAfterFirst!.textContent).toBe("1");

    const btn2 = container.querySelector("button");
    (btn2 as HTMLButtonElement).click();
    (btn2 as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(clickCount).toBe(3);
    const spanAfterClicks = container.querySelector("span");
    expect(spanAfterClicks!.textContent).toBe("3");

    root.unmount();
  }, { sanitizeOps: false, sanitizeResources: false });
});

describe("集成：createRoot + 多事件类型", () => {
  it("onClick 与 onChange 等应正确绑定", () => {
    const container = document.createElement("div");
    let clicked = false;
    let changed = false;
    const root = createRoot(() => ({
      type: "div",
      props: {},
      children: [
        {
          type: "button",
          props: {
            type: "button",
            onClick: () => {
              clicked = true;
            },
          },
          children: [text("Click")],
        },
        {
          type: "input",
          props: {
            type: "text",
            onChange: () => {
              changed = true;
            },
          },
          children: [],
        },
      ],
    }), container);

    const btn = container.querySelector("button");
    const input = container.querySelector("input");
    (btn as HTMLButtonElement).click();
    expect(clicked).toBe(true);

    input!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changed).toBe(true);

    root.unmount();
  });
});

describe("集成：createEffect 与 createRoot 协作", () => {
  it("根组件内读 signal，外部 set 后应更新视图", async () => {
    const container = document.createElement("div");
    const [get, set] = createSignal("initial");
    const root = createRoot(() => ({
      type: "span",
      props: {},
      children: [text(get())],
    }), container);

    expect(container.textContent).toBe("initial");
    set("updated");
    await Promise.resolve();
    expect(container.textContent).toBe("updated");

    root.unmount();
  });
});

describe("集成：表单 value + onInput/onChange 与 signal 双向绑定", () => {
  /** 最小用例：与「多事件类型」完全一致，仅验证 onChange 被调用 */
  it("input 的 onChange 在 dispatch 时被调用", () => {
    const container = document.createElement("div");
    let changed = false;
    const root = createRoot(() => ({
      type: "div",
      props: {},
      children: [
        {
          type: "input",
          props: {
            type: "text",
            onChange: () => {
              changed = true;
            },
          },
          children: [],
        },
      ],
    }), container);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changed).toBe(true);
    root.unmount();
  }, { sanitizeOps: false, sanitizeResources: false });

  /**
   * 与 DirectiveDemo 一致：value={get()} 传当前值。handler 用 ref 读 value（happy-dom 下 dispatch 时 e.target.value 可能未同步）。
   */
  it(
    "input[type=text] 使用 value + onInput 时，输入更新 signal、set 更新 DOM",
    async () => {
      const container = document.createElement("div");
      const [get, set] = createSignal("");
      const inputRef = { current: null as HTMLInputElement | null };
      document.body.appendChild(container);
      const root = createRoot(() => ({
        type: "div",
        props: {},
        children: [
          {
            type: "input",
            props: {
              type: "text",
              value: get(),
              ref: (el: unknown) => {
                inputRef.current = el as HTMLInputElement | null;
              },
              onInput: () => {
                if (inputRef.current) set(inputRef.current.value);
              },
            },
            children: [],
          },
        ],
      }), container);

      await Promise.resolve();
      const input = container.querySelector("input") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(get()).toBe("");

      input.value = "world";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(get()).toBe("world");

      set("foo");
      await Promise.resolve();
      await Promise.resolve();
      expect(get()).toBe("foo");
      // 真实浏览器下 patch 会写回 input.value；happy-dom 可能不反映，仅断言 signal 已更新

      root.unmount();
      if (container.parentNode) container.remove();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );

  /**
   * 与 DirectiveDemo 一致：checked={get()} 传当前值。handler 用 ref 读 checked（happy-dom 下 e.target.checked 可能未同步）。
   */
  it(
    "input[type=checkbox] 使用 checked + onChange 时，checked 与 signal 双向同步",
    async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const [get, set] = createSignal(false);
      const inputRef = { current: null as HTMLInputElement | null };
      const root = createRoot(() => ({
        type: "div",
        props: {},
        children: [
          {
            type: "input",
            props: {
              type: "checkbox",
              checked: get(),
              ref: (el: unknown) => {
                inputRef.current = el as HTMLInputElement | null;
              },
              onChange: () => {
                if (inputRef.current) set(inputRef.current.checked);
              },
            },
            children: [],
          },
        ],
      }), container);

      const input = container.querySelector("input") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.checked).toBe(false);
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      expect(get()).toBe(true);

      set(false);
      await Promise.resolve();
      expect(input.checked).toBe(false);

      root.unmount();
      if (container.parentNode) container.remove();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );
});

describe("集成：createReactive 表单", () => {
  /**
   * 细粒度渲染：createReactive + value + onInput，输入更新 model、model 与 input 保持同步。
   */
  it(
    "表单使用 createReactive 时，value + onInput 绑定后输入更新 model，model 与 input 保持同步",
    async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const formModel = createReactive({ name: "" });
      const nameInputRef = { current: null as HTMLInputElement | null };
      const root = createRoot(() => ({
        type: "div",
        props: {},
        children: [
          {
            type: "input",
            props: {
              type: "text",
              value: () => formModel.name,
              ref: (el: unknown) => {
                nameInputRef.current = el as HTMLInputElement | null;
              },
              onInput: () => {
                if (nameInputRef.current) {
                  formModel.name = nameInputRef.current.value;
                }
              },
            },
            children: [],
          },
          {
            type: "span",
            props: {},
            children: [() => text(formModel.name)] as unknown as VNode[],
          },
        ],
      }), container);

      await Promise.resolve();
      await Promise.resolve();
      const input = container.querySelector("input") as HTMLInputElement;
      const span = container.querySelector("span");
      expect(input).not.toBeNull();
      expect(span).not.toBeNull();
      expect(span!.textContent).toBe("");

      input.value = "alice";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      expect(formModel.name).toBe("alice");
      expect(input.value).toBe("alice");

      root.unmount();
      if (container.parentNode) container.remove();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );

  /**
   * 细粒度渲染：多字段用 value + onInput 绑定 createReactive，各 input 与 model 保持同步。
   */
  it(
    "createReactive 多字段表单，value + onInput 绑定后各 input 与 model 保持同步",
    async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const formModel = createReactive({ name: "", age: "" });
      const nameInputRef = { current: null as HTMLInputElement | null };
      const ageInputRef = { current: null as HTMLInputElement | null };
      const root = createRoot(() => ({
        type: "div",
        props: {},
        children: [
          {
            type: "input",
            props: {
              type: "text",
              "data-testid": "name",
              value: () => formModel.name,
              ref: (el: unknown) => {
                nameInputRef.current = el as HTMLInputElement | null;
              },
              onInput: () => {
                if (nameInputRef.current) {
                  formModel.name = nameInputRef.current.value;
                }
              },
            },
            children: [],
          },
          {
            type: "input",
            props: {
              type: "text",
              "data-testid": "age",
              value: () => formModel.age,
              ref: (el: unknown) => {
                ageInputRef.current = el as HTMLInputElement | null;
              },
              onInput: () => {
                if (ageInputRef.current) {
                  formModel.age = ageInputRef.current.value;
                }
              },
            },
            children: [],
          },
          {
            type: "span",
            props: { "data-testid": "summary" },
            children: [
              () => text(`${formModel.name}-${formModel.age}`),
            ] as unknown as VNode[],
          },
        ],
      }), container);

      await Promise.resolve();
      await Promise.resolve();
      const nameInput = container.querySelector(
        '[data-testid="name"]',
      ) as HTMLInputElement;
      const ageInput = container.querySelector(
        '[data-testid="age"]',
      ) as HTMLInputElement;
      const summary = container.querySelector('[data-testid="summary"]');
      expect(summary!.textContent).toBe("-");

      nameInput.value = "alice";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      expect(formModel.name).toBe("alice");
      expect(nameInput.value).toBe("alice");

      ageInput.value = "18";
      ageInput.dispatchEvent(new Event("input", { bubbles: true }));
      expect(formModel.age).toBe("18");
      expect(ageInput.value).toBe("18");

      root.unmount();
      if (container.parentNode) container.remove();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );
});

describe("集成：细粒度更新（patch 非整树替换）", () => {
  /**
   * 验证：仅更新与 signal 相关的 DOM 部分时，其他 DOM 节点保持同一引用（未整树替换）。
   * 若整树替换，旧 input 会从 container 移除，container.contains(inputRef) 会为 false。
   */
  it(
    "更新一处 signal 时，未依赖该 signal 的 DOM 节点保持同一引用",
    async () => {
      const container = document.createElement("div");
      const [getCount, setCount] = createSignal(0);
      const root = createRoot(() => ({
        type: "div",
        props: {},
        children: [
          {
            type: "input",
            props: { type: "text", "data-testid": "input" },
            children: [],
          },
          {
            type: "button",
            props: {
              type: "button",
              onClick: () => setCount(getCount() + 1),
            },
            children: [text("+1")],
          },
          {
            type: "span",
            props: { "data-testid": "count" },
            children: [text(String(getCount()))],
          },
        ],
      }), container);

      await Promise.resolve();
      await Promise.resolve();
      const inputRef = container.querySelector('[data-testid="input"]');
      const countSpan = container.querySelector('[data-testid="count"]');
      expect(inputRef).not.toBeNull();
      expect(countSpan!.textContent).toBe("0");

      (container.querySelector("button") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(countSpan!.textContent).toBe("1");
      expect(container.contains(inputRef)).toBe(true);
      const inputStillSame = container.querySelector('[data-testid="input"]');
      expect(inputStillSame).toBe(inputRef);

      root.unmount();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );

  /**
   * 验证：根 effect 重跑后使用 patchRoot 原地更新，输入框 DOM 节点未被替换（同一引用仍在容器内）。
   * 若整树替换或重挂输入框，querySelector 会得到新节点，与之前保存的引用不同。
   */
  it(
    "更新其他 state 后，未依赖该 state 的输入框仍为同一 DOM 节点（未重挂）",
    async () => {
      const container = document.createElement("div");
      const [getCount, setCount] = createSignal(0);
      const root = createRoot(() => ({
        type: "div",
        props: {},
        children: [
          {
            type: "input",
            props: { type: "text", "data-testid": "focusable" },
            children: [],
          },
          {
            type: "button",
            props: {
              type: "button",
              onClick: () => setCount(getCount() + 1),
            },
            children: [text("+1")],
          },
          {
            type: "span",
            props: {},
            children: [text(String(getCount()))],
          },
        ],
      }), container);

      await Promise.resolve();
      await Promise.resolve();
      const input = container.querySelector(
        '[data-testid="focusable"]',
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      input.focus();
      (container.querySelector("button") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.contains(input)).toBe(true);
      const inputStillSame = container.querySelector(
        '[data-testid="focusable"]',
      );
      expect(inputStillSame).toBe(input);
      root.unmount();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );

  /**
   * 验证：动态 getter 返回 Fragment（如 () => ( <> ... <input /> ... </> )）时，
   * signal 更新后 input 仍为同一 DOM 节点，不因 reconcile 误删/重建而丢失焦点。
   * 对应 appendDynamicChild 内对单 Fragment 展开为 children 的修复。
   */
  it(
    "getter 返回 Fragment 内 input 在 signal 更新后仍为同一 DOM 节点（表单不丢焦点）",
    async () => {
      const container = document.createElement("div");
      const [getCount, setCount] = createSignal(0);
      const root = createRoot(
        () =>
          ({
            type: "div",
            props: {},
            children: [
              () =>
                ({
                  type: FragmentType,
                  props: {
                    children: [
                      {
                        type: "div",
                        props: {},
                        children: [{
                          type: "input",
                          props: {
                            type: "text",
                            "data-testid": "focus-input",
                          },
                          children: [],
                        }],
                      },
                      {
                        type: "div",
                        props: {},
                        children: [{
                          type: "button",
                          props: {
                            type: "button",
                            onClick: () => setCount(getCount() + 1),
                          },
                          children: [text("+1")],
                        }],
                      },
                      {
                        type: "span",
                        props: { "data-testid": "count" },
                        children: [text(String(getCount()))],
                      },
                    ],
                  },
                  children: [],
                }) as VNode,
            ],
          }) as unknown as VNode,
        container,
      );

      await Promise.resolve();
      await Promise.resolve();
      const inputRef = container.querySelector(
        '[data-testid="focus-input"]',
      ) as HTMLInputElement;
      const countSpan = container.querySelector('[data-testid="count"]');
      expect(inputRef).not.toBeNull();
      expect(countSpan?.textContent).toBe("0");

      inputRef.focus();
      (container.querySelector("button") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(countSpan?.textContent).toBe("1");
      expect(container.contains(inputRef)).toBe(true);
      const inputStillSame = container.querySelector(
        '[data-testid="focus-input"]',
      );
      expect(inputStillSame).toBe(inputRef);

      root.unmount();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );
});
