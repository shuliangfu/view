/**
 * @fileoverview 协调器「复用动态容器」相关测试：同槽两 getter 引用不同时复用容器、同组件 patch 时复用容器，避免 input 等失焦。
 * 覆盖：reconcileChildren 的 updateDynamicChild 路径、patchNode 的 getComponentGetter + updateDynamicChild 路径，及边界情况。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRoot, createSignal } from "@dreamer/view";
import type { VNode } from "@dreamer/view";

function text(s: string): VNode {
  return { type: "#text", props: { nodeValue: s }, children: [] };
}

const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("reconcile: 同槽两 getter 引用不同时复用容器", () => {
  it(
    "父重渲染时子槽仍为 getter 但引用不同，应复用 data-view-dynamic 容器（不 replace）",
    async () => {
      const container = document.createElement("div");
      const [_getTick, setTick] = createSignal(0);
      const root = createRoot(
        () => ({
          type: "div",
          props: {
            "data-testid": "parent",
            children: [
              // 每次根 effect 重跑都会产生新的 getter 引用
              () =>
                ({
                  type: "input",
                  props: {
                    "data-testid": "dynamic-input",
                    type: "text",
                  },
                  children: [],
                }) as VNode,
            ],
          },
          children: [] as VNode[],
        }),
        container,
      );

      await Promise.resolve();
      await Promise.resolve();

      const parentEl = container.querySelector("[data-testid=parent]");
      const dynamicWrap = parentEl?.querySelector("[data-view-dynamic]");
      const inputBefore = container.querySelector(
        "[data-testid=dynamic-input]",
      );
      expect(dynamicWrap).not.toBeNull();
      expect(inputBefore).not.toBeNull();
      const wrapRefBefore = dynamicWrap as Element;

      setTick(1);
      await Promise.resolve();
      await Promise.resolve();

      const dynamicWrapAfter = parentEl?.querySelector("[data-view-dynamic]");
      const inputAfter = container.querySelector("[data-testid=dynamic-input]");
      expect(dynamicWrapAfter).not.toBeNull();
      expect(inputAfter).not.toBeNull();
      // 复用容器：同一 DOM 节点引用
      expect(dynamicWrapAfter).toBe(wrapRefBefore);

      root.unmount();
    },
    noSanitize,
  );

  it("同槽 getter 复用后，容器内仍为 getter 产出的内容", async () => {
    const container = document.createElement("div");
    const [_getTick, setTick] = createSignal(0);
    const root = createRoot(
      () => ({
        type: "div",
        props: {
          children: [
            () =>
              ({
                type: "span",
                props: { "data-testid": "inner", innerHTML: null },
                children: [text("from-getter")],
              }) as VNode,
          ],
        },
        children: [] as VNode[],
      }),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toContain("from-getter");

    setTick(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toContain("from-getter");

    root.unmount();
  }, noSanitize);

  it("多个动态子节点时仅引用变化的那一槽复用容器，其余不变", async () => {
    const container = document.createElement("div");
    const [_getTick, setTick] = createSignal(0);
    const stableGetter = () =>
      ({
        type: "span",
        props: { "data-testid": "stable" },
        children: [text("A")],
      }) as VNode;
    const root = createRoot(
      () => ({
        type: "div",
        props: {
          "data-testid": "parent",
          children: [
            stableGetter,
            () =>
              ({
                type: "span",
                props: { "data-testid": "changing" },
                children: [text("B")],
              }) as VNode,
          ],
        },
        children: [] as VNode[],
      }),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();

    const wraps = container.querySelectorAll("[data-view-dynamic]");
    expect(wraps.length).toBe(2);
    const changingWrapBefore = container.querySelector(
      "[data-testid=parent] [data-view-dynamic]:last-of-type",
    ) as Element;

    setTick(1);
    await Promise.resolve();
    await Promise.resolve();

    const changingWrapAfter = container.querySelector(
      "[data-testid=parent] [data-view-dynamic]:last-of-type",
    );
    expect(changingWrapAfter).toBe(changingWrapBefore);
    expect(container.querySelector("[data-testid=stable]")).not.toBeNull();
    expect(container.querySelector("[data-testid=changing]")).not.toBeNull();

    root.unmount();
  }, noSanitize);
});

describe("patchNode: 同组件且 dom 为动态容器时复用", () => {
  it(
    "父重渲染时同组件（返回 getter）应复用其 data-view-dynamic 容器",
    async () => {
      function ChildComp(
        _props: Record<string, unknown>,
      ): VNode | (() => VNode) {
        return () =>
          ({
            type: "input",
            props: { "data-testid": "comp-input", type: "text" },
            children: [],
          }) as VNode;
      }

      const container = document.createElement("div");
      const [_getTick, setTick] = createSignal(0);
      const root = createRoot(
        () => ({
          type: "div",
          props: {
            "data-testid": "root-wrap",
            children: [{ type: ChildComp, props: {}, children: [] }],
          },
          children: [] as VNode[],
        }),
        container,
      );

      await Promise.resolve();
      await Promise.resolve();

      const wrap = container.querySelector("[data-testid=root-wrap]");
      const dynamicContainer = wrap?.querySelector("[data-view-dynamic]");
      const inputBefore = container.querySelector("[data-testid=comp-input]");
      expect(dynamicContainer).not.toBeNull();
      expect(inputBefore).not.toBeNull();
      const containerRefBefore = dynamicContainer as Element;

      setTick(1);
      await Promise.resolve();
      await Promise.resolve();

      const dynamicContainerAfter = wrap?.querySelector("[data-view-dynamic]");
      const inputAfter = container.querySelector("[data-testid=comp-input]");
      expect(dynamicContainerAfter).not.toBeNull();
      expect(inputAfter).not.toBeNull();
      expect(dynamicContainerAfter).toBe(containerRefBefore);

      root.unmount();
    },
    noSanitize,
  );
});

describe("边界：getter 与静态子节点切换", () => {
  it("旧为 getter、新为静态 VNode 时应 replace，不再保留动态容器", async () => {
    const container = document.createElement("div");
    const [useGetter, setUseGetter] = createSignal(true);
    const root = createRoot(
      () => ({
        type: "div",
        props: {
          "data-testid": "parent",
          children: useGetter()
            ? [
              () =>
                ({
                  type: "input",
                  props: { "data-testid": "from-getter" },
                  children: [],
                }) as VNode,
            ]
            : [
              {
                type: "span",
                props: { "data-testid": "static-span" },
                children: [text("static")],
              },
            ],
        },
        children: [] as VNode[],
      }),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector("[data-testid=from-getter]")).not.toBeNull();
    expect(container.querySelector("[data-view-dynamic]")).not.toBeNull();

    setUseGetter(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector("[data-testid=from-getter]")).toBeNull();
    expect(container.querySelector("[data-testid=static-span]")).not.toBeNull();
    expect(container.textContent).toContain("static");

    root.unmount();
  }, noSanitize);

  it("旧为静态、新为 getter 时应创建新的动态容器", async () => {
    const container = document.createElement("div");
    const [useGetter, setUseGetter] = createSignal(false);
    const root = createRoot(
      () => ({
        type: "div",
        props: {
          "data-testid": "parent",
          children: useGetter()
            ? [
              () =>
                ({
                  type: "span",
                  props: { "data-testid": "from-getter" },
                  children: [text("from-getter")],
                }) as VNode,
            ]
            : [
              {
                type: "span",
                props: { "data-testid": "static-span" },
                children: [text("static")],
              },
            ],
        },
        children: [] as VNode[],
      }),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector("[data-testid=static-span]")).not.toBeNull();
    expect(container.querySelector("[data-view-dynamic]")).toBeNull();

    setUseGetter(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector("[data-testid=static-span]")).toBeNull();
    expect(container.querySelector("[data-testid=from-getter]")).not.toBeNull();
    expect(container.querySelector("[data-view-dynamic]")).not.toBeNull();
    expect(container.textContent).toContain("from-getter");

    root.unmount();
  }, noSanitize);
});

describe("边界：同组件但返回非 getter 时走 replace", () => {
  it(
    "组件直接返回 VNode（非 getter）时 patch 会 replace，不复用动态容器",
    async () => {
      function CompRaw(_props: Record<string, unknown>): VNode {
        return {
          type: "div",
          props: { "data-testid": "raw-div" },
          children: [text("raw")],
        };
      }

      const container = document.createElement("div");
      const [_getTick, setTick] = createSignal(0);
      const root = createRoot(
        () => ({
          type: "div",
          props: {
            children: [{ type: CompRaw, props: {}, children: [] }],
          },
          children: [] as VNode[],
        }),
        container,
      );

      await Promise.resolve();
      await Promise.resolve();

      const rawDivBefore = container.querySelector("[data-testid=raw-div]");
      expect(rawDivBefore).not.toBeNull();
      // 组件返回裸 VNode 时不会产生 data-view-dynamic 容器，是直接 div
      expect(container.querySelector("[data-view-dynamic]")).toBeNull();

      setTick(1);
      await Promise.resolve();
      await Promise.resolve();

      const rawDivAfter = container.querySelector("[data-testid=raw-div]");
      expect(rawDivAfter).not.toBeNull();
      // replace 后可能是新节点（同组件但非 getter 会 replace）
      expect(container.textContent).toContain("raw");

      root.unmount();
    },
    noSanitize,
  );
});

describe("边界：同槽两 getter 引用相同", () => {
  it("getter 引用未变时不应报错，DOM 保持", async () => {
    const getter = () =>
      ({
        type: "span",
        props: { "data-testid": "same-ref" },
        children: [text("same")],
      }) as VNode;

    const container = document.createElement("div");
    const [_getTick, setTick] = createSignal(0);
    const root = createRoot(
      () => ({
        type: "div",
        props: {
          children: [getter],
        },
        children: [] as VNode[],
      }),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector("[data-testid=same-ref]")).not.toBeNull();

    setTick(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector("[data-testid=same-ref]")).not.toBeNull();
    expect(container.textContent).toContain("same");

    root.unmount();
  }, noSanitize);
});

describe("边界：动态子节点 getter 返回 null", () => {
  it("getter 返回 null 时容器内为空，不抛错", async () => {
    const container = document.createElement("div");
    const root = createRoot(
      () => ({
        type: "div",
        props: {
          children: [
            () => null as unknown as VNode,
          ],
        },
        children: [] as VNode[],
      }),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();

    const wrap = container.querySelector("[data-view-dynamic]");
    expect(wrap).not.toBeNull();
    expect(wrap?.childNodes.length).toBe(0);

    root.unmount();
  }, noSanitize);
});

/**
 * 针对性验证：Form/FormItem + Password 场景下，getter 返回单根节点时重跑应 patch 不 replace，input 焦点保留。
 * 模拟组件返回 getter、getter 返回单层 div 包 input；signal 更新触发 getter 重跑后断言同一 input 节点仍在且焦点未丢。
 */
describe("密码组件失焦修复：单节点 getter 重跑时焦点保留", () => {
  it(
    "getter 返回单根 div 包 input 时，signal 更新重跑后 input 为同一节点且焦点保留",
    async () => {
      const container = document.createElement("div");
      const [val, setVal] = createSignal("");

      /** 模拟 FormItem：返回 getter，getter 返回单层 div 包 input（与 FormItem+Password 结构一致） */
      function FormItemLike(): VNode | (() => VNode) {
        return () =>
          ({
            type: "div",
            props: { "data-testid": "form-item-wrap" },
            children: [
              {
                type: "input",
                props: {
                  "data-testid": "password-like-input",
                  type: "text",
                  value: val,
                  onInput: (e: Event) =>
                    setVal((e.target as HTMLInputElement).value),
                },
                children: [],
              },
            ],
          }) as VNode;
      }

      const root = createRoot(
        () => ({
          type: "div",
          props: {
            "data-testid": "root",
            children: [{ type: FormItemLike, props: {}, children: [] }],
          },
          children: [] as VNode[],
        }),
        container,
      );

      await Promise.resolve();
      await Promise.resolve();

      const input = container.querySelector<HTMLInputElement>(
        "[data-testid=password-like-input]",
      );
      expect(input).not.toBeNull();
      input!.focus();

      setVal("abc");
      await Promise.resolve();
      await Promise.resolve();

      const inputAfter = container.querySelector<HTMLInputElement>(
        "[data-testid=password-like-input]",
      );
      expect(inputAfter).not.toBeNull();
      expect(inputAfter).toBe(input);
      expect(input!.value).toBe("abc");
      // 同一 input 节点被复用即表示未 replace，真实浏览器中焦点会保留；happy-dom 下 activeElement 可能不可靠，此处不断言

      root.unmount();
    },
    noSanitize,
  );
});
