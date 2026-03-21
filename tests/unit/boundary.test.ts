/**
 * @fileoverview Boundary 单元测试：ErrorBoundary（编译态）、Suspense、isErrorBoundary、getErrorBoundaryFallback
 * 全量编译：ErrorBoundary / Suspense 均返回 (parent)=>void；Suspense 的 children 可为无参 getter 或 VNode/Promise（兼容手写）。
 */
import "../dom-setup.ts";

import { describe, expect, it } from "@dreamer/test";
import { createRoot, insert } from "@dreamer/view";
import type { VNode } from "@dreamer/view";
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
});

describe("ErrorBoundary", () => {
  it("返回挂载函数，执行时 try children(parent)，catch 时插入 fallback", () => {
    const container = document.createElement("div");
    const mount = ErrorBoundary({
      fallback: () => "fallback",
      children: (parent) => {
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
      children: (parent) => {
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
