/**
 * @fileoverview JSX 运行时真实测试：jsx/jsxs 产出 VNode 结构、Fragment、key 与 children
 */

import { describe, expect, it } from "@dreamer/test";
import { Fragment, jsx, jsxs } from "@dreamer/view/jsx-runtime";

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
});

describe("Fragment", () => {
  it("Fragment 为 Symbol 类型供 dom 识别", () => {
    expect(typeof Fragment).toBe("symbol");
  });
});
