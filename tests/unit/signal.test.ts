/**
 * @fileoverview Signal 单元测试：createSignal（SignalRef）、isSignalGetter、isSignalRef、markSignalGetter、unwrapSignalGetterValue
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal, isSignalGetter, isSignalRef } from "@dreamer/view";
import { markSignalGetter, unwrapSignalGetterValue } from "../../src/signal.ts";

describe("createSignal", () => {
  it("应返回带 .value 读写的 SignalRef", () => {
    const s = createSignal(0);
    expect(isSignalRef(s)).toBe(true);
    expect(s.value).toBe(0);
    s.value = 1;
    expect(s.value).toBe(1);
  });

  it("初始值应可通过 .value 读取", () => {
    const s = createSignal(42);
    expect(s.value).toBe(42);
  });

  it("赋值 .value 后应得到新值", () => {
    const s = createSignal(0);
    s.value = 10;
    expect(s.value).toBe(10);
    s.value = 20;
    expect(s.value).toBe(20);
  });

  it(".value 接受 updater 函数时应基于前值更新", () => {
    const s = createSignal(1);
    s.value = (prev) => prev + 1;
    expect(s.value).toBe(2);
    s.value = (prev) => prev * 2;
    expect(s.value).toBe(4);
  });

  it("赋相同值（Object.is）时不应触发无效更新语义", () => {
    const obj = { x: 1 };
    const s = createSignal(obj);
    s.value = obj;
    expect(s.value).toBe(obj);
  });

  it("应支持任意类型初始值", () => {
    const str = createSignal("hello");
    expect(str.value).toBe("hello");
    str.value = "world";
    expect(str.value).toBe("world");

    const arr = createSignal([1, 2]);
    expect(arr.value).toEqual([1, 2]);
    arr.value = [3, 4];
    expect(arr.value).toEqual([3, 4]);

    const o = createSignal({ a: 1 });
    expect(o.value).toEqual({ a: 1 });
    o.value = { a: 2 };
    expect(o.value).toEqual({ a: 2 });
  });

  it("边界：初始值为 undefined", () => {
    const s = createSignal<number | undefined>(undefined);
    expect(s.value).toBeUndefined();
    s.value = 1;
    expect(s.value).toBe(1);
    s.value = undefined;
    expect(s.value).toBeUndefined();
  });

  it("边界：初始值为 null", () => {
    const s = createSignal<number | null>(null);
    expect(s.value).toBeNull();
    s.value = 1;
    expect(s.value).toBe(1);
    s.value = null;
    expect(s.value).toBeNull();
  });
});

describe("isSignalGetter", () => {
  it("createSignal 返回值不是 signal getter（是 SignalRef 对象）", () => {
    const s = createSignal(0);
    expect(isSignalGetter(s)).toBe(false);
  });

  it("对普通函数应返回 false", () => {
    expect(isSignalGetter(() => 1)).toBe(false);
    expect(isSignalGetter(function () {
      return 1;
    })).toBe(false);
  });

  it("对非函数应返回 false", () => {
    expect(isSignalGetter(1)).toBe(false);
    expect(isSignalGetter(null)).toBe(false);
    expect(isSignalGetter("get")).toBe(false);
  });

  it("对 markSignalGetter 包装后的函数应返回 true", () => {
    const fn = () => 0;
    expect(isSignalGetter(fn)).toBe(false);
    const marked = markSignalGetter(fn);
    expect(isSignalGetter(marked)).toBe(true);
    expect(marked()).toBe(0);
  });
});

describe("isSignalRef", () => {
  it("对 createSignal 返回值应返回 true", () => {
    expect(isSignalRef(createSignal(0))).toBe(true);
  });

  it("对普通对象应返回 false", () => {
    expect(isSignalRef({ value: 1 })).toBe(false);
    expect(isSignalRef(null)).toBe(false);
  });
});

describe("markSignalGetter", () => {
  it("应返回与原函数行为一致的函数", () => {
    const fn = () => 42;
    const marked = markSignalGetter(fn);
    expect(marked()).toBe(42);
  });
});

describe("unwrapSignalGetterValue", () => {
  it("对 createMemo 式 getter 应调用并返回值", () => {
    const marked = markSignalGetter(() => 7);
    expect(unwrapSignalGetterValue(marked)).toBe(7);
  });

  it("对 SignalRef 应读 .value", () => {
    const s = createSignal(7);
    expect(unwrapSignalGetterValue(s)).toBe(7);
  });

  it("对非标记函数应原样返回", () => {
    const f = () => 1;
    expect(unwrapSignalGetterValue(f)).toBe(f);
    expect(unwrapSignalGetterValue("x")).toBe("x");
  });
});
