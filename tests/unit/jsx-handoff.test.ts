/**
 * @fileoverview jsx-handoff：聚合导出入口可加载且含 formatVNodeForDebug / mountVNodeTree
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  Dynamic,
  For,
  formatVNodeForDebug,
  insertVNode,
  jsx,
  jsxMerges,
  lazy,
  mapArray,
  Match,
  mergeProps,
  mountVNodeTree,
  Show,
  Switch,
} from "../../src/jsx-handoff.ts";

describe("@dreamer/view/jsx-handoff", () => {
  it(
    "应导出 mergeProps 与 mountVNodeTree 且桥接已注册",
    () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const vnode = jsx(
        "p",
        mergeProps(
          { className: "p1" } as Record<string, unknown>,
          { children: "ok" } as Record<string, unknown>,
        ),
      );
      mountVNodeTree(container, vnode);
      expect(container.querySelector("p")?.textContent).toBe("ok");
      document.body.removeChild(container);
    },
    { sanitizeOps: false, sanitizeResources: false },
  );

  it("formatVNodeForDebug 应可用", () => {
    const s = formatVNodeForDebug(jsx("a", { href: "#", children: "x" }));
    expect(s).toContain('"a"');
    expect(s).toContain("href");
  });

  it("insertVNode 应将 VNode 挂入 parent", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    insertVNode(el, jsx("em", { children: "iv" }));
    expect(el.querySelector("em")?.textContent).toBe("iv");
    document.body.removeChild(el);
  });

  it("应透传 lazy / mapArray / For / Show / Switch / Match / Dynamic（与 compiler 聚合一致）", () => {
    expect(typeof lazy).toBe("function");
    expect(typeof mapArray).toBe("function");
    expect(typeof For).toBe("function");
    expect(typeof Show).toBe("function");
    expect(typeof Switch).toBe("function");
    expect(typeof Match).toBe("function");
    expect(typeof Dynamic).toBe("function");
  });

  /**
   * {@link jsxMerges} 与 {@link jsx} 同源从 jsx-handoff 透出，便于聚合入口手写 merge + 静态多子。
   */
  it("应导出 jsxMerges 且单子项 children 仍为数组", () => {
    const child = {
      type: "#text" as const,
      props: { nodeValue: "h" },
      children: [],
    };
    const v = jsxMerges(
      "span",
      { className: "c" } as Record<string, unknown>,
      { children: [child] } as Record<string, unknown>,
    );
    expect(Array.isArray(v.props.children)).toBe(true);
    expect(v.props.children).toEqual([child]);
  });
});
