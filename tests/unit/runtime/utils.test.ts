import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { isObject, isSignal, unwrap } from "../../../src/runtime/utils.ts";
import { createSignal } from "../../../src/reactivity/signal.ts";

describe("runtime/utils", () => {
  it("应当能正确识别普通对象和数组 (isObject)", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject([1, 2, 3])).toBe(true);

    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject(1)).toBe(false);
    expect(isObject("abc")).toBe(false);
    expect(isObject(true)).toBe(false);
    expect(isObject(() => {})).toBe(false);

    // Node 节点不应被视为普通对象，以防 Proxy 污染
    const div = document.createElement("div");
    const text = document.createTextNode("text");
    expect(isObject(div)).toBe(false);
    expect(isObject(text)).toBe(false);
  });

  it("应当能正确识别响应式信号 (isSignal)", () => {
    const [getter] = createSignal(0);
    expect(isSignal(getter)).toBe(true);
    expect(isSignal(() => {})).toBe(false);
    expect(isSignal(null)).toBe(false);
    expect(isSignal({})).toBe(false);
  });

  it("应当能递归解包信号 (unwrap)", () => {
    const [s1] = createSignal(10);
    const [s2] = createSignal(s1); // 嵌套信号
    const [s3] = createSignal(s2); // 双重嵌套

    expect(unwrap(100)).toBe(100);
    expect(unwrap(s1)).toBe(10);
    expect(unwrap(s2)).toBe(10);
    expect(unwrap(s3)).toBe(10);

    // 针对普通函数
    const fn = () => "not a signal";
    expect(unwrap(fn)).toBe(fn);
  });
}, { sanitizeOps: false, sanitizeResources: false });
