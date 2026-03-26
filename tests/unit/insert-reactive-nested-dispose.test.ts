/**
 * 回归：外层 insertReactive 返回 VNode 且子树内另有 insertReactive 同读一 signal 时，
 * 外层重跑须先 dispose 子 insertReactive，否则子 effect 残留会导致重复 DOM（compileSource + DatePicker）。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, insertReactive } from "@dreamer/view";
import { insertReactive as insertReactiveCompiler } from "@dreamer/view/compiler";
import { jsx } from "@dreamer/view/jsx-runtime";

/** 与主包、compiler 入口各跑一遍，避免 insert.ts / runtime 分叉 */
function runNestedDisposeCase(
  ir: typeof insertReactive,
): Promise<void> {
  const parent = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(parent);
  const s = createSignal("a");
  return (async () => {
    try {
      ir(parent, () => {
        void s.value;
        return jsx("span", {
          class: "picker",
          children: ["v:", s],
        } as Record<string, unknown>);
      });
      await Promise.resolve();
      expect(parent.querySelectorAll(".picker").length).toBe(1);
      expect(parent.textContent).toBe("v:a");

      s.value = "b";
      await Promise.resolve();
      expect(parent.querySelectorAll(".picker").length).toBe(1);
      expect(parent.textContent).toBe("v:b");
    } finally {
      globalThis.document.body.removeChild(parent);
    }
  })();
}

describe("insertReactive 嵌套 dispose（VNode 子树 + 子插值同 signal）", () => {
  it("主包 runtime：signal 更新后仅一棵 .picker", async () => {
    await runNestedDisposeCase(insertReactive);
  });

  it("@dreamer/view/compiler：signal 更新后仅一棵 .picker", async () => {
    await runNestedDisposeCase(insertReactiveCompiler);
  });
}, { sanitizeOps: false, sanitizeResources: false });
