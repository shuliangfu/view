/**
 * @fileoverview JSX 运行时真实测试：jsx/jsxs 产出 VNode 结构、Fragment、key 与 children
 */

import { describe, expect, it } from "@dreamer/test";
import { mergeProps } from "@dreamer/view/compiler";
import { createSignal } from "@dreamer/view";
import {
  Fragment,
  jsx,
  jsxDEV,
  jsxMerge,
  jsxMerges,
  jsxs,
} from "@dreamer/view/jsx-runtime";

describe("jsx", () => {
  it("产出 type/props/children 结构正确", () => {
    const v = jsx("div", { className: "c", children: [] });
    expect(v.type).toBe("div");
    expect(v.props.className).toBe("c");
    expect(v.props.children).toEqual([]);
  });

  it("key 从 props 提取并置顶", () => {
    const v = jsx("span", { key: 1, children: [] });
    expect(v.key).toBe(1);
    expect((v.props as { key?: number }).key).toBeUndefined();
  });

  it("第三参 maybeKey 覆盖 props.key", () => {
    const v = jsx("span", { key: 0, children: [] }, 2);
    expect(v.key).toBe(2);
  });
});

describe("jsxs", () => {
  it("静态子节点数组放入 props.children", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "x" },
      children: [],
    };
    const v = jsxs("div", { children: [child] });
    expect(v.props.children).toEqual([child]);
  });

  /**
   * 与 `jsx` 区分：单子项仍保留数组形态（TS `jsxs` 与 compiler 静态多子列表一致）。
   */
  it("单子项时仍保留数组（不折叠）", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "only" },
      children: [],
    };
    const v = jsxs("p", { children: [child] });
    expect(Array.isArray(v.props.children)).toBe(true);
    expect(v.props.children).toEqual([child]);
  });
});

describe("jsxDEV（react-jsx 开发路径）", () => {
  it("isStaticChildren 为 true 时与 jsxs 同语义（单子项仍为数组）", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "d" },
      children: [],
    };
    const v = jsxDEV("div", { children: [child] }, undefined, true);
    expect(Array.isArray(v.props.children)).toBe(true);
    expect(v.props.children).toEqual([child]);
  });

  it("isStaticChildren 为 false 或未传时与 jsx 同语义（单子项折叠）", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "one" },
      children: [],
    };
    const v = jsxDEV("span", { children: [child] }, undefined, false);
    expect(v.props.children).toEqual(child);
  });

  it("剥离 __source / __self，不进入 props", () => {
    const v = jsx("i", {
      children: "x",
      __source: { fileName: "a.tsx", lineNumber: 1 },
      __self: {},
    } as Record<string, unknown>);
    expect("__source" in v.props).toBe(false);
    expect("__self" in v.props).toBe(false);
  });
});

describe("jsx 与 compiler 挂载路径对齐", () => {
  it("SignalRef 子节点规范化为无参 getter（与 normalizeChildren 一致）", () => {
    const n = createSignal(42);
    const v = jsx("span", { children: n });
    expect(typeof v.props.children).toBe("function");
    expect((v.props.children as () => number)()).toBe(42);
  });

  it("单文本子节点折叠为 #text VNode", () => {
    const v = jsx("b", { children: "hi" });
    expect(v.props.children).toEqual({
      type: "#text",
      props: { nodeValue: "hi" },
      children: [],
    });
  });
});

describe("Fragment", () => {
  it("Fragment 为 Symbol 类型供 dom 识别", () => {
    expect(typeof Fragment).toBe("symbol");
  });
});

describe("jsxMerge / mergeProps + jsx", () => {
  it("jsxMerge 应等价于 mergeProps 后再 jsx", () => {
    const a = { className: "a", id: "1" };
    const b = { className: "b" };
    const v1 = jsxMerge("div", a, b);
    const v2 = jsx("div", mergeProps(a, b));
    expect(v1).toEqual(v2);
    /** 多档均为字符串时 {@link mergeProps} 按 同类方案 同向拼接 className，而非后者单独覆盖 */
    expect(v1.props.className).toBe("a b");
    expect(v1.props.id).toBe("1");
  });
});

/**
 * {@link jsxMerges}：合并多段 props 后按 `jsxs` 子项数组语义规范化（单子项不折叠）。
 */
describe("jsxMerges / mergeProps + jsxs", () => {
  it("jsxMerges 应等价于 mergeProps 后再 jsxs（含单子项仍为数组）", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "m" },
      children: [],
    };
    const a = { className: "a" } as Record<string, unknown>;
    const b = { children: [child] } as Record<string, unknown>;
    const v1 = jsxMerges("div", a, b);
    const v2 = jsxs("div", mergeProps(a, b));
    expect(v1).toEqual(v2);
    expect(Array.isArray(v1.props.children)).toBe(true);
    expect(v1.props.children).toEqual([child]);
  });
});
