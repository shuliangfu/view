/**
 * @fileoverview jsx-handoff：聚合导出入口可加载且含 formatVNodeForDebug / mountVNodeTree
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  formatVNodeForDebug,
  insertVNode,
  jsx,
  mergeProps,
  mountVNodeTree,
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
});
