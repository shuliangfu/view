/**
 * @fileoverview insertReplacing：占位节点被 getter 产出替换，并随 signal 更新。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import { insertReplacing } from "../../src/compiler/insert-replacing.ts";

describe("insertReplacing", () => {
  it("首次应用应将占位 Comment 替换为文本节点", () => {
    const parent = document.createElement("div");
    const ph = document.createComment("p");
    parent.appendChild(ph);
    const dispose = insertReplacing(parent, ph, () => "hello");
    expect(parent.textContent).toBe("hello");
    expect(parent.querySelector("*")).toBeNull();
    dispose();
  });

  it("signal 变化时应 replaceChild 更新内容", async () => {
    const parent = document.createElement("div");
    const ph = document.createComment("p");
    parent.appendChild(ph);
    const [text, setText] = createSignal("a");
    const dispose = insertReplacing(parent, ph, () => text());
    expect(parent.textContent).toBe("a");
    setText("b");
    await Promise.resolve();
    await Promise.resolve();
    expect(parent.textContent).toBe("b");
    dispose();
  });

  it("占位已脱离父节点时应 appendChild 而非 replaceChild", () => {
    const parent = document.createElement("div");
    const ph = document.createComment("orphan");
    const dispose = insertReplacing(parent, ph, () => "x");
    expect(parent.textContent).toBe("x");
    dispose();
  });
}, { sanitizeOps: false, sanitizeResources: false });
