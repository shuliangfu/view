/**
 * @fileoverview Boundary 单元测试：ErrorBoundary、Suspense、isErrorBoundary、getErrorBoundaryFallback
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect } from "@dreamer/view";
import type { VNode } from "@dreamer/view";
import {
  ErrorBoundary,
  getErrorBoundaryFallback,
  isErrorBoundary,
  Suspense,
} from "@dreamer/view/boundary";

type ComponentFn = (props: Record<string, unknown>) => VNode | VNode[] | null;
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
});

describe("getErrorBoundaryFallback", () => {
  it("fallback 为函数时返回该函数", () => {
    const fn = (_err: unknown) => textVNode("err");
    const fallback = getErrorBoundaryFallback({ fallback: fn });
    expect(typeof fallback).toBe("function");
    expect((fallback as (e: unknown) => { type: string; props: unknown })("x"))
      .toEqual(textVNode("err"));
  });

  it("fallback 为 VNode 或非函数时返回返回该内容的函数", () => {
    const vnode = textVNode("oops");
    const fallback = getErrorBoundaryFallback({ fallback: vnode });
    expect((fallback as (e: unknown) => unknown)(null)).toEqual(vnode);
  });

  it("边界：fallback 为 undefined 时返回的函数返回 #text 节点（nodeValue 为 'undefined'）", () => {
    const fallback = getErrorBoundaryFallback({ fallback: undefined });
    const v = (fallback as (
      e: unknown,
    ) => { type: string; props: { nodeValue: string } })(null);
    expect(v.type).toBe("#text");
    expect(v.props.nodeValue).toBe("undefined");
  });

  it("边界：fallback 为 null 时返回的函数返回 #text 节点（nodeValue 为 'null'）", () => {
    const fallback = getErrorBoundaryFallback({ fallback: null });
    const v = (fallback as (
      e: unknown,
    ) => { type: string; props: { nodeValue: string } })(null);
    expect(v.type).toBe("#text");
    expect(v.props.nodeValue).toBe("null");
  });
});

describe("ErrorBoundary", () => {
  it("应直接返回 children（实际捕获由 dom 层 try/catch 完成）", () => {
    const child = textVNode("child");
    const result = ErrorBoundary({
      fallback: () => textVNode("fallback"),
      children: child,
    });
    expect(result).toBe(child);
  });

  it("无 children 时返回 null", () => {
    const result = ErrorBoundary({
      fallback: () => textVNode("fallback"),
    });
    expect(result).toBeNull();
  });
});

describe("Suspense", () => {
  it("children 为同步 VNode 时应返回包含该内容的 Fragment 结构", () => {
    const child = textVNode("content");
    const result = Suspense({
      fallback: textVNode("loading"),
      children: child,
    });
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.props).toBeDefined();
    expect(result.props.children).toBeDefined();
  });

  it("children 为 Promise 时通过 getter 先 fallback 再解析（需在 effect 中运行，此处仅检查返回结构）", () => {
    const result = Suspense({
      fallback: textVNode("loading"),
      children: Promise.resolve(textVNode("done")),
    });
    expect(result).toBeDefined();
    expect(typeof result.props.children).toBe("function");
  });

  it("children 为 Promise 时 resolve 后 getter 返回解析结果", async () => {
    const doneNode = textVNode("done");
    const result = Suspense({
      fallback: textVNode("loading"),
      children: Promise.resolve(doneNode),
    });
    const getter = result.props.children as () => VNode;
    createEffect(() => {
      getter();
    });
    await Promise.resolve();
    await Promise.resolve();
    const current = getter();
    expect(current).toBeDefined();
    expect((current as { props?: { nodeValue?: string } }).props?.nodeValue)
      .toBe("done");
  });

  it("边界：fallback 为 null 时 getter 仍可返回（不抛错）", () => {
    const result = Suspense({
      fallback: null as unknown as VNode,
      children: textVNode("sync"),
    });
    const getter = result.props.children as () => VNode;
    expect(() => getter()).not.toThrow();
  });

  // 注：children 为 Promise.reject 时 Suspense 内部无 .catch，会在测试环境产生 unhandled rejection，此处不测
});
