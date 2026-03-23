/**
 * @fileoverview Boundary 单元测试：ErrorBoundary（编译态）、Suspense、isErrorBoundary、getErrorBoundaryFallback
 * 全量编译：ErrorBoundary / Suspense 均返回 (parent)=>void；Suspense 的 children 可为无参 getter 或 VNode/Promise（兼容手写）。
 */
import "../dom-setup.ts";

import { describe, expect, it } from "@dreamer/test";
import { createRoot, createSignal, insert } from "@dreamer/view";
import type { VNode } from "@dreamer/view";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";
import { jsx } from "../../src/jsx-runtime.ts";
import {
  ErrorBoundary,
  getErrorBoundaryFallback,
  isErrorBoundary,
  Suspense,
} from "@dreamer/view/boundary";

type ComponentFn = (props: Record<string, unknown>) => unknown;
const textVNode = (s: string) => ({
  type: "#text",
  props: { nodeValue: s },
  children: [],
});

describe("isErrorBoundary", () => {
  it("对 ErrorBoundary 组件应返回 true", () => {
    expect(isErrorBoundary(ErrorBoundary as ComponentFn)).toBe(true);
  });

  it("对任意其他函数应返回 false", () => {
    expect(isErrorBoundary(() => null)).toBe(false);
    expect(isErrorBoundary(function Comp() {
      return null;
    })).toBe(false);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("getErrorBoundaryFallback", () => {
  it("fallback 为函数时返回该函数", () => {
    const fn = (_err: unknown) => "err" as const;
    const fallback = getErrorBoundaryFallback({ fallback: fn });
    expect(typeof fallback).toBe("function");
    expect(fallback("x")).toBe("err");
  });

  it("fallback 为非函数时返回的函数返回可插入值（编译态 InsertValue）", () => {
    const fallback = getErrorBoundaryFallback({ fallback: "oops" });
    expect(fallback(null)).toBe("oops");
  });

  it("边界：fallback 为 undefined 时返回的函数在 insert 后容器显示 'undefined'", () => {
    const fallback = getErrorBoundaryFallback({ fallback: undefined });
    const value = fallback(null);
    const container = document.createElement("div");
    createRoot((el) => insert(el, value), container);
    expect(container.textContent).toBe("undefined");
  });

  it("边界：fallback 为 null 时返回的函数在 insert 后容器显示 'null'", () => {
    const fallback = getErrorBoundaryFallback({ fallback: null });
    const value = fallback(null);
    const container = document.createElement("div");
    createRoot((el) => insert(el, value), container);
    expect(container.textContent).toBe("null");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("ErrorBoundary", () => {
  it("返回挂载函数，执行时 try children(parent)，catch 时插入 fallback", () => {
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: () => "fallback",
      children: (parent: globalThis.Node) => {
        const el = document.createElement("span");
        el.textContent = "child";
        parent.appendChild(el);
      },
    });
    mount(container);
    expect(container.textContent).toBe("child");

    const container2 = document.createElement("div");
    const mount2 = ErrorBoundary({
      fallback: () => "fallback",
      children: () => {
        throw new Error("oops");
      },
    });
    mount2(container2);
    expect(container2.textContent).toBe("fallback");
  });

  it("无 children 时返回的挂载函数执行不抛错", () => {
    const mount = ErrorBoundary({
      fallback: () => "fallback",
    });
    const container = document.createElement("div");
    expect(() => mount(container)).not.toThrow();
    expect(container.textContent).toBe("");
  });

  /**
   * 内层 ErrorBoundary 在 try/catch 内消化同步抛错，外层不应落到外层 fallback。
   */
  it("嵌套 ErrorBoundary：内层抛错应显示内层 fallback", () => {
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: () => "outer",
      children: (parent: globalThis.Node) => {
        const inner = ErrorBoundary({
          fallback: () => "inner",
          children: () => {
            throw new Error("nested");
          },
        });
        inner(parent);
      },
    });
    mount(container);
    expect(container.textContent).toBe("inner");
  });

  it("children 为 VNode（手写 jsx-runtime）时子组件同步抛错应显示 fallback", () => {
    function Bad(_props: Record<string, unknown>): VNode {
      throw new Error("vnode-sync");
    }
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: (e) => `E:${(e as Error).message}`,
      children: jsx(Bad as (p: Record<string, unknown>) => VNode, {}),
    });
    createRoot((el) => insert(el, mount), container);
    expect(container.textContent).toContain("vnode-sync");
  });

  it("children 为无参 getter 时依赖 signal 更新后重跑，抛错则显示 fallback", async () => {
    const st = createSignal(false);
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: (e) => `err:${(e as Error).message}`,
      children: () => {
        if (st.value) throw new Error("boom");
        return textVNode("ok");
      },
    });
    createRoot((el) => insert(el, mount), container);
    expect(container.textContent).toBe("ok");
    st.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toContain("boom");
  });

  /**
   * 编译产物常见 `() => () => (parent)=>void`：`isMountFn` 对最外层为 false，须剥壳后再包 try/catch。
   */
  it("children 为无参 getter 且返回双层无参箭头包裹的 MountFn、执行时抛错应显示 fallback", async () => {
    const st = createSignal(false);
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: (e) => `err:${(e as Error).message}`,
      children: () => () => (parent: globalThis.Node) => {
        if (st.value) throw new Error("peel-throw");
        parent.appendChild(document.createTextNode("ok"));
      },
    });
    createRoot((el) => insert(el, mount), container);
    expect(container.textContent).toBe("ok");
    st.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toContain("peel-throw");
  });

  /**
   * 全量编译下 `{() => <Thrower />}` 常在 getter 内返回 MountFn，抛错发生在 insertReactive 调用 MountFn 时，
   * 须在 MountFn 外包一层 try/catch 才能落到 fallback（与「getter 内直接 throw」不同）。
   */
  it("children 为无参 getter 且返回的 MountFn 执行时抛错应显示 fallback", async () => {
    const st = createSignal(false);
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: (e) => `err:${(e as Error).message}`,
      children: () => (parent: globalThis.Node) => {
        if (st.value) throw new Error("mount-throw");
        const t = document.createTextNode("ok");
        parent.appendChild(t);
      },
    });
    createRoot((el) => insert(el, mount), container);
    expect(container.textContent).toBe("ok");
    st.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toContain("mount-throw");
  });

  /**
   * jsx runtime：不经 compileSource，子节点为 `() => jsx(组件)`；与 examples `jsx: "runtime"` 对齐。
   */
  it("mountVNodeTree + ErrorBoundary + ()=>jsx 子组件，signal 切换抛错应显示 fallback", async () => {
    const st = createSignal(false);
    function RtThrow(props: { x?: boolean }): VNode {
      if (props.x) throw new Error("runtime-jsx-throw");
      return jsx("span", { children: "ok" });
    }
    /** jsx 类型假定组件返回 VNode；ErrorBoundary 实际返回 MountFn，挂载由 mountVNodeTree 处理 */
    const EB = ErrorBoundary as unknown as (
      props: Record<string, unknown>,
    ) => VNode;
    const tree = jsx(EB, {
      fallback: (e: unknown) =>
        `fb:${e instanceof Error ? e.message : String(e)}`,
      children: () => jsx(RtThrow, { x: st.value }),
    });
    const container = document.createElement("div");
    mountVNodeTree(container, tree);
    expect(container.textContent).toContain("ok");
    st.value = true;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toContain("fb:runtime-jsx-throw");
  });
});

describe("Suspense", () => {
  it("应返回单参挂载函数 (parent)=>void", () => {
    const mount = Suspense({
      fallback: textVNode("loading"),
      children: textVNode("x"),
    });
    expect(typeof mount).toBe("function");
    expect(mount.length).toBe(1);
  });

  it("children 为同步 VNode 时挂载后显示内容", () => {
    const container = document.createElement("div");
    const mount = Suspense({
      fallback: textVNode("loading"),
      children: textVNode("content"),
    });
    createRoot((el) => insert(el, mount), container);
    expect(container.textContent).toBe("content");
  });

  it("children 为无参 getter（编译态）时挂载后显示 slot", () => {
    const container = document.createElement("div");
    const mount = Suspense({
      fallback: textVNode("loading"),
      children: () => textVNode("sync"),
    });
    createRoot((el) => insert(el, mount), container);
    expect(container.textContent).toBe("sync");
  });

  it("children 为 Promise 时 resolve 后显示解析内容", async () => {
    const container = document.createElement("div");
    const doneNode = textVNode("done");
    const mount = Suspense({
      fallback: textVNode("loading"),
      children: Promise.resolve(doneNode),
    });
    createRoot((el) => insert(el, mount), container);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("done");
  });

  it("children 为 Promise<MountFn> 时 resolve 后挂载到槽位（compileSource 下 .then 内 JSX）", async () => {
    const container = document.createElement("div");
    /** 延后到 macrotask，确保先跑完 insertReactive 的 fallback 再 setResolved */
    const children = new Promise<(parent: Node) => void>((resolve) => {
      setTimeout(() => {
        resolve((parent: Node) => {
          parent.appendChild(document.createTextNode("mounted"));
        });
      }, 0);
    });
    /**
     * 须在 createRoot(fn) 内调用 Suspense（与 compileSource 页面一致）；
     * 若在 createRoot 之前调用，effect 登记时机与根 scope 不一致，易导致 epoch 竞态、一直停在 fallback。
     */
    createRoot((el) => {
      const mount = Suspense({
        fallback: textVNode("loading"),
        children,
      });
      insert(el, mount);
    }, container);
    expect(container.textContent).toBe("loading");
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(container.textContent).toBe("mounted");
  });

  it("children 为 Promise.reject 时保持 fallback 且无 unhandled rejection", async () => {
    const container = document.createElement("div");
    const mount = Suspense({
      fallback: textVNode("loading"),
      children: Promise.reject(new Error("boom")),
    });
    createRoot((el) => insert(el, mount), container);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(container.textContent).toBe("loading");
  });

  it("边界：fallback 为 null 且 children 为同步 VNode 时不抛错", () => {
    const container = document.createElement("div");
    const mount = Suspense({
      fallback: null as unknown as VNode,
      children: textVNode("sync"),
    });
    expect(() => createRoot((el) => insert(el, mount), container)).not
      .toThrow();
    expect(container.textContent).toBe("sync");
  });
});
