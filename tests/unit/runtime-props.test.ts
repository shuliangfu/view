/**
 * @fileoverview 路线 C 运行时 Props 工具单元测试：mergeProps、splitProps
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal, mergeProps, splitProps } from "@dreamer/view/compiler";

describe("mergeProps", () => {
  it("无参数时应返回空对象", () => {
    const out = mergeProps();
    expect(out).toEqual({});
  });

  it("单来源时应返回该对象", () => {
    const a = { x: 1, y: 2 };
    const out = mergeProps(a);
    expect(out).toBe(a);
    expect(out).toEqual({ x: 1, y: 2 });
  });

  it("多来源时后者覆盖前者", () => {
    const out = mergeProps({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(out.a).toBe(1);
    expect(out.b).toBe(3);
    expect(out.c).toBe(4);
  });

  it("null/undefined 来源应被忽略", () => {
    const out = mergeProps(null, { a: 1 }, undefined, { b: 2 });
    expect(out.a).toBe(1);
    expect(out.b).toBe(2);
  });

  it("合并后读不存在的 key 应为 undefined", () => {
    const out = mergeProps({ a: 1 });
    expect((out as Record<string, unknown>).z).toBeUndefined();
  });

  it("合并后 in 操作符应正确", () => {
    const out = mergeProps({ a: 1 }, { b: 2 });
    expect("a" in out).toBe(true);
    expect("b" in out).toBe(true);
    expect("c" in out).toBe(false);
  });

  it("合并后保留 getter（响应式）", () => {
    const [get] = createSignal(0);
    const out = mergeProps({ value: get } as Record<string, unknown>);
    expect(typeof (out as { value: () => number }).value).toBe("function");
    expect((out as { value: () => number }).value()).toBe(0);
  });

  it("返回的代理 ownKeys 应为各来源 key 的并集", () => {
    const out = mergeProps({ a: 1, b: 2 }, { b: 3, c: 4 });
    const keys = Reflect.ownKeys(out) as string[];
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
    expect(keys.length).toBe(3);
  });
});

describe("splitProps", () => {
  it("按单组 key 拆出 part 与 rest", () => {
    const props = { a: 1, b: 2, c: 3 };
    const [local, rest] = splitProps(props, ["a", "b"]);
    expect(local).toEqual({ a: 1, b: 2 });
    expect(rest).toEqual({ c: 3 });
  });

  it("多组 key 时依次拆出", () => {
    const props = { a: 1, b: 2, c: 3, d: 4 };
    const [first, second, rest] = splitProps(props, ["a"], ["b"]);
    expect(first).toEqual({ a: 1 });
    expect(second).toEqual({ b: 2 });
    expect(rest).toEqual({ c: 3, d: 4 });
  });

  it("无 key 时 part 为空对象、rest 为全部", () => {
    const props = { x: 1, y: 2 };
    const [local, rest] = splitProps(props, []);
    expect(local).toEqual({});
    expect(rest).toEqual({ x: 1, y: 2 });
  });

  it("全部 key 都拆出时 rest 为空对象", () => {
    const props = { a: 1, b: 2 };
    const [local, rest] = splitProps(props, ["a", "b"]);
    expect(local).toEqual({ a: 1, b: 2 });
    expect(rest).toEqual({});
  });

  it("props 为空对象时各部分均为空", () => {
    const [local, rest] = splitProps({} as Record<string, unknown>, ["a"]);
    expect(local).toEqual({});
    expect(rest).toEqual({});
  });

  it("props 为 mergeProps 代理时仍能正确拆分", () => {
    const proxy = mergeProps({ a: 1, b: 2 }, { c: 3 });
    const [local, rest] = splitProps(proxy, ["a"]);
    expect(local).toEqual({ a: 1 });
    expect(rest).toEqual({ b: 2, c: 3 });
  });
});
