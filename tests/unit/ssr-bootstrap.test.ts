/**
 * 验证在未注入任何第三方 DOM 的 Deno 全局下，`renderToString` 能自举极简 `document`。
 * 勿在此文件 import `./dom-setup.ts`。
 */

import { describe, expect, it } from "@dreamer/test";
import { createSignal, setProperty } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";
import { renderToString } from "@dreamer/view/ssr";

describe("SSR：无预置 document 时自举极简 DOM", () => {
  it("renderToString 应输出含属性与文本的 HTML", () => {
    const tree = () => jsx("div", { id: "root", children: "ok" });
    const html = renderToString(tree);
    expect(html).toContain('id="root"');
    expect(html).toContain("ok");
  });

  /** 与 `insert` 动态子 + `schedule` 行为对齐；须在 `leaveSSRDomScope` 前同步排空 */
  it("insert 动态子中 setSignal 后仍应得到完整 HTML", () => {
    const [s, setS] = createSignal(0);
    const html = renderToString(() =>
      jsx("div", {
        id: "root",
        children: () => {
          if (s() === 0) setS(1);
          return jsx("span", { id: "dyn", children: String(s()) })();
        },
      })
    );
    expect(html).toContain('id="dyn"');
    expect(html).toContain("1");
  });

  it("拆除临时 document 后，新 document 上的事件委托仍能触发", async () => {
    renderToString(() =>
      jsx("button", {
        type: "button",
        onClick: () => {},
        children: "ssr",
      })
    );
    expect(
      typeof (globalThis as { document?: unknown }).document === "undefined",
    ).toBe(true);

    const { Window } = await import("happy-dom");
    const win = new Window();
    const g = globalThis as Record<string, unknown>;
    g.window = win;
    g.document = win.document;
    g.Event = win.Event;
    g.MouseEvent = win.MouseEvent;

    let clicks = 0;
    const btn = document.createElement("button");
    document.body!.appendChild(btn);
    setProperty(btn, "onClick", () => {
      clicks++;
    });
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toBe(1);
  });
}, { sanitizeOps: false, sanitizeResources: false });
