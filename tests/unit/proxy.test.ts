/**
 * @fileoverview 嵌套响应式 Proxy 单元测试：createNestedProxy
 */

import { describe, expect, it } from "@dreamer/test";
import { createNestedProxy } from "../../src/proxy.ts";

describe("createNestedProxy", () => {
  it("应返回代理，get 返回与 target 一致的值", () => {
    const target = { a: 1, b: "x" };
    const subs = new Set<() => void>();
    const cache = new WeakMap<object, object>();
    const proxy = createNestedProxy(target, subs, cache);
    expect(proxy.a).toBe(1);
    expect(proxy.b).toBe("x");
  });

  it("set 后 get 应返回新值", () => {
    const target = { a: 1 };
    const subs = new Set<() => void>();
    const cache = new WeakMap<object, object>();
    const proxy = createNestedProxy(target, subs, cache);
    (proxy as { a: number }).a = 2;
    expect(proxy.a).toBe(2);
    expect(target.a).toBe(2);
  });

  it("嵌套对象应返回代理且读写一致", () => {
    const target = { nested: { x: 10 } };
    const subs = new Set<() => void>();
    const cache = new WeakMap<object, object>();
    const proxy = createNestedProxy(target, subs, cache);
    expect(proxy.nested).toBeDefined();
    expect((proxy.nested as { x: number }).x).toBe(10);
    (proxy.nested as { x: number }).x = 20;
    expect((proxy.nested as { x: number }).x).toBe(20);
    expect(target.nested.x).toBe(20);
  });

  it("同一 target 多次 get 应返回同一代理（proxyCache）", () => {
    const target = { inner: {} };
    const subs = new Set<() => void>();
    const cache = new WeakMap<object, object>();
    const proxy = createNestedProxy(target, subs, cache);
    const first = proxy.inner;
    const second = proxy.inner;
    expect(first).toBe(second);
  });
});
