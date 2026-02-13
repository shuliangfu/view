/**
 * @fileoverview Signal 单元测试：createSignal、getter/setter、isSignalGetter、markSignalGetter
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal, isSignalGetter } from "@dreamer/view";
import { markSignalGetter } from "../../src/signal.ts";

describe("createSignal", () => {
  it("应返回 [getter, setter] 元组", () => {
    const [get, set] = createSignal(0);
    expect(typeof get).toBe("function");
    expect(typeof set).toBe("function");
  });

  it("getter 应返回初始值", () => {
    const [get] = createSignal(42);
    expect(get()).toBe(42);
  });

  it("setter 设置值后 getter 应返回新值", () => {
    const [get, set] = createSignal(0);
    set(10);
    expect(get()).toBe(10);
    set(20);
    expect(get()).toBe(20);
  });

  it("setter 接受 updater 函数时应基于前值更新", () => {
    const [get, set] = createSignal(1);
    set((prev) => prev + 1);
    expect(get()).toBe(2);
    set((prev) => prev * 2);
    expect(get()).toBe(4);
  });

  it("setter 传入相同值（Object.is）时不应改变引用", () => {
    const obj = { x: 1 };
    const [get, set] = createSignal(obj);
    set(obj);
    expect(get()).toBe(obj);
  });

  it("应支持任意类型初始值", () => {
    const [getStr, setStr] = createSignal("hello");
    expect(getStr()).toBe("hello");
    setStr("world");
    expect(getStr()).toBe("world");

    const [getArr, setArr] = createSignal([1, 2]);
    expect(getArr()).toEqual([1, 2]);
    setArr([3, 4]);
    expect(getArr()).toEqual([3, 4]);

    const [getObj, setObj] = createSignal({ a: 1 });
    expect(getObj()).toEqual({ a: 1 });
    setObj({ a: 2 });
    expect(getObj()).toEqual({ a: 2 });
  });

  it("边界：初始值为 undefined 时 get 返回 undefined，set 后更新", () => {
    const [get, set] = createSignal<number | undefined>(undefined);
    expect(get()).toBeUndefined();
    set(1);
    expect(get()).toBe(1);
    set(undefined);
    expect(get()).toBeUndefined();
  });

  it("边界：初始值为 null 时 get 返回 null，set 后更新", () => {
    const [get, set] = createSignal<number | null>(null);
    expect(get()).toBeNull();
    set(1);
    expect(get()).toBe(1);
    set(null);
    expect(get()).toBeNull();
  });
});

describe("isSignalGetter", () => {
  it("对 createSignal 返回的 getter 应返回 true", () => {
    const [get] = createSignal(0);
    expect(isSignalGetter(get)).toBe(true);
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

describe("markSignalGetter", () => {
  it("应返回与原函数行为一致的函数", () => {
    const fn = () => 42;
    const marked = markSignalGetter(fn);
    expect(marked()).toBe(42);
  });
});
