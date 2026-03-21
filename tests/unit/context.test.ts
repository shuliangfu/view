/**
 * @fileoverview Context 单元测试：createContext、Provider、useContext、pushContext/popContext
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import type { VNode } from "@dreamer/view";
import {
  CONTEXT_SCOPE_TYPE,
  createContext,
  getContext,
  getProviderContextId,
  popContext,
  pushContext,
} from "@dreamer/view/context";

type ProviderFn = (p: Record<string, unknown>) => VNode | VNode[] | null;

describe("createContext", () => {
  it("应返回 Provider 与 useContext", () => {
    const ctx = createContext("default");
    expect(typeof ctx.Provider).toBe("function");
    expect(typeof ctx.useContext).toBe("function");
  });

  it("无 Provider 时 useContext 应返回 defaultValue", () => {
    const ctx = createContext<string>("default");
    expect(ctx.useContext()).toBe("default");
  });

  it("边界：defaultValue 为 undefined 时无 Provider 则 useContext() 为 undefined", () => {
    const ctx = createContext<undefined | string>(undefined);
    expect(ctx.useContext()).toBeUndefined();
  });

  it("有 Provider 时需在渲染路径中 pushContext，useContext 才返回 value", () => {
    const ctx = createContext<number>(0);
    const id = getProviderContextId(ctx.Provider as ProviderFn);
    expect(id).toBeDefined();
    pushContext(id!, 42);
    expect(getContext(id!)).toBe(42);
    expect(ctx.useContext()).toBe(42);
    popContext(id!);
    expect(getContext(id!)).toBe(0);
    expect(ctx.useContext()).toBe(0);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("Provider", () => {
  it("应返回 Fragment，children 为 getter，getter 返回 ContextScope(id, value, children) 供 dom 层 push/render/pop", () => {
    const ctx = createContext(1);
    const child = { type: "span", props: {}, children: [] } as VNode;
    const result = ctx.Provider({ value: 2, children: child }) as VNode;
    expect(result.type).toBe("Fragment");
    expect(typeof (result.props.children as () => unknown)).toBe("function");
    const scope = (result.props.children as () => VNode)();
    expect(scope.type).toBe(CONTEXT_SCOPE_TYPE);
    expect(
      (scope.props as { id: symbol; value: unknown; children: VNode }).value,
    ).toBe(2);
    expect(
      (scope.props as { id: symbol; value: unknown; children: VNode }).children,
    ).toBe(child);
  });

  it("边界：Provider value 为 null 时 pushContext 后 useContext 为 null", () => {
    const ctx = createContext<number | null>(0);
    const id = getProviderContextId(ctx.Provider as ProviderFn);
    pushContext(id!, null);
    expect(ctx.useContext()).toBeNull();
    popContext(id!);
  });
});

// 旧版 createRoot(() => VNode) 已废弃；Context 与 compileSource 产物 + insert 配合使用，不再单独测 createRoot+Provider DOM 更新。
