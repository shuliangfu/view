/**
 * @fileoverview 编译路径下 Props 工具单元测试：mergeProps、mergeRefs、defaultProps、splitProps
 */

import { describe, expect, it } from "@dreamer/test";
import {
  createSignal,
  defaultProps,
  isSignalRef,
  mergeProps,
  mergeRefs,
  splitProps,
} from "@dreamer/view/compiler";
import type { SignalRef } from "@dreamer/view/types";

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

  it("合并后保留 SignalRef（响应式）", () => {
    const count = createSignal(0);
    const out = mergeProps({ value: count } as Record<string, unknown>);
    const v = (out as { value: unknown }).value;
    expect(isSignalRef(v)).toBe(true);
    expect((v as SignalRef<number>).value).toBe(0);
  });

  it("返回的代理 ownKeys 应为各来源 key 的并集", () => {
    const out = mergeProps({ a: 1, b: 2 }, { b: 3, c: 4 });
    const keys = Reflect.ownKeys(out) as string[];
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
    expect(keys.length).toBe(3);
  });

  it("Object.keys 与对象展开应能枚举合并键（依赖 getOwnPropertyDescriptor trap）", () => {
    const out = mergeProps({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(Object.keys(out).sort()).toEqual(["a", "b", "c"]);
    expect({ ...out }).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("嵌套 mergeProps 时 ownKeys 应包含内层代理上的键", () => {
    const inner = mergeProps(
      { a: 1 } as Record<string, unknown>,
      { b: 2 } as Record<string, unknown>,
    );
    const outer = mergeProps(inner, { c: 3 } as Record<string, unknown>);
    expect(Object.keys(outer).sort()).toEqual(["a", "b", "c"]);
    const o = outer as Record<string, unknown>;
    expect(o.a).toBe(1);
    expect(o.c).toBe(3);
  });

  /**
   * 同类方案：`mergeProps` 对 `on*` / `on*Capture` 多函数合并为一次监听内按来源顺序调用。
   */
  it("onClick 多来源均为函数时合并依次调用", () => {
    const calls: string[] = [];
    const f1 = () => calls.push("1");
    const f2 = () => calls.push("2");
    const p = mergeProps(
      { onClick: f1 } as Record<string, unknown>,
      { onClick: f2 } as Record<string, unknown>,
    );
    const h = (p as { onClick: (e?: unknown) => void }).onClick;
    expect(typeof h).toBe("function");
    h.call(null, {});
    expect(calls).toEqual(["1", "2"]);
  });

  /** 最后一档显式为非函数时整键以最后一档为准（覆盖前档函数）。 */
  it("onClick 最后一档非函数时以最后一档为准", () => {
    const f1 = () => {};
    const p = mergeProps(
      { onClick: f1 } as Record<string, unknown>,
      { onClick: "nope" } as Record<string, unknown>,
    );
    expect((p as { onClick: unknown }).onClick).toBe("nope");
  });

  it("onClickCapture 同样合并多个函数", () => {
    const calls: number[] = [];
    const p = mergeProps(
      { onClickCapture: () => calls.push(1) } as Record<string, unknown>,
      { onClickCapture: () => calls.push(2) } as Record<string, unknown>,
    );
    (p as { onClickCapture: (e: unknown) => void }).onClickCapture({});
    expect(calls).toEqual([1, 2]);
  });

  /**
   * 同类方案：`class` / `className` 多段字符串拼成空格分隔的单一 class。
   */
  it("class 多来源字符串合并为空格分隔", () => {
    const p = mergeProps(
      { class: "a b" } as Record<string, unknown>,
      { class: "c" } as Record<string, unknown>,
    );
    expect((p as { class: string }).class).toBe("a b c");
    expect((p as { className: string }).className).toBe("a b c");
  });

  it("class 与 className 跨来源合并为同一字符串", () => {
    const p = mergeProps(
      { class: "foo" } as Record<string, unknown>,
      { className: "bar" } as Record<string, unknown>,
    );
    expect((p as { class: string }).class).toBe("foo bar");
    expect((p as { className: string }).className).toBe("foo bar");
  });

  it("class 含数组片段时与 spread 本征语义一致（filter + join）", () => {
    const p = mergeProps(
      { class: ["x", "", "y"] } as unknown as Record<string, unknown>,
      { class: "z" } as Record<string, unknown>,
    );
    expect((p as { class: string }).class).toBe("x y z");
  });

  /** 任一档为非字符串类值时退回最后一档 className / class（模拟响应式 class）。 */
  it("含函数 class 时以最后一档有值者为准", () => {
    const dyn = () => "dyn";
    const p = mergeProps(
      { class: "a" } as Record<string, unknown>,
      { class: dyn } as unknown as Record<string, unknown>,
    );
    expect((p as { class: unknown }).class).toBe(dyn);
  });

  /**
   * 同类方案：`mergeProps` 对多档普通 `style` 对象做浅合并，后者覆盖同名键。
   */
  it("style 多来源普通对象浅合并", () => {
    const p = mergeProps(
      { style: { color: "red", margin: "0" } } as Record<string, unknown>,
      { style: { backgroundColor: "blue", margin: "8px" } } as Record<
        string,
        unknown
      >,
    );
    const st = (p as { style: Record<string, string> }).style;
    expect(st).toEqual({
      color: "red",
      backgroundColor: "blue",
      margin: "8px",
    });
  });

  /**
   * 多来源走代理时，单档普通 style 经 `Object.assign` 产出新对象，避免与来源共用引用。
   */
  it("style 经 mergeProps 代理读取时为浅拷贝而非来源引用", () => {
    const inner = { color: "red" };
    const p = mergeProps(
      {} as Record<string, unknown>,
      { style: inner } as Record<string, unknown>,
    );
    const st = (p as { style: Record<string, string> }).style;
    expect(st).toEqual({ color: "red" });
    expect(st).not.toBe(inner);
  });

  /** 含非普通 style（函数）时整键以最后一档为准。 */
  it("style 含函数时以最后一档有值者为准", () => {
    const dyn = () => ({ display: "flex" });
    const p = mergeProps(
      { style: { color: "red" } } as Record<string, unknown>,
      { style: dyn } as unknown as Record<string, unknown>,
    );
    expect((p as { style: unknown }).style).toBe(dyn);
  });

  /**
   * 同类方案：`mergeProps` 对多档 `ref` 合并为单次回调内按来源顺序调用（同 `mergeRefs`）。
   */
  it("ref 多档均为函数时合并依次调用", () => {
    const calls: (string | null)[] = [];
    const p = mergeProps(
      { ref: (n: unknown) => calls.push(n === null ? "null" : "a") } as Record<
        string,
        unknown
      >,
      { ref: (n: unknown) => calls.push(n === null ? "null" : "b") } as Record<
        string,
        unknown
      >,
    );
    const r = (p as { ref: (n: unknown) => void }).ref;
    expect(typeof r).toBe("function");
    const el = {};
    r(el);
    expect(calls).toEqual(["a", "b"]);
    r(null);
    expect(calls).toEqual(["a", "b", "null", "null"]);
  });

  it("ref 回调与对象 ref 合并时先回调再写 current", () => {
    const calls: string[] = [];
    const obj = { current: null as unknown };
    const p = mergeProps(
      { ref: () => calls.push("fn") } as Record<string, unknown>,
      { ref: obj } as Record<string, unknown>,
    );
    /** 占位节点，无需真实 DOM（本文件未统一 `dom-setup`） */
    const el = { tag: "div" } as unknown as Element;
    (p as { ref: (n: Element | null) => void }).ref(el);
    expect(calls).toEqual(["fn"]);
    expect(obj.current).toBe(el);
  });

  /** 最后一档显式 `null` 时整键以 `null` 为准（清空）。 */
  it("ref 最后一档为 null 时以 null 为准", () => {
    const p = mergeProps(
      { ref: () => {} } as Record<string, unknown>,
      { ref: null } as Record<string, unknown>,
    );
    expect((p as { ref: unknown }).ref).toBeNull();
  });
});

describe("mergeRefs", () => {
  it("无参时为空操作", () => {
    const m = mergeRefs();
    expect(() => m(null)).not.toThrow();
  });

  it("单个函数 ref 原样返回", () => {
    const f = (n: unknown) => n;
    expect(mergeRefs(f)).toBe(f);
  });

  it("多个函数按顺序调用", () => {
    const seq: string[] = [];
    const m = mergeRefs(
      () => seq.push("a"),
      () => seq.push("b"),
    );
    m(null);
    expect(seq).toEqual(["a", "b"]);
  });
});

describe("defaultProps", () => {
  it("语义同 mergeProps：后者覆盖前者", () => {
    const p = defaultProps(
      { a: 1, b: 2 } as Record<string, unknown>,
      { b: 3, c: 4 } as Record<string, unknown>,
    );
    expect(p.a).toBe(1);
    expect(p.b).toBe(3);
    expect(p.c).toBe(4);
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
