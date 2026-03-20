/**
 * @fileoverview scheduleFunctionRef：已接入 document 时同步 ref(el)；已摘除节点不得写回 ref。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { scheduleFunctionRef } from "../../src/compiler/ref-dom.ts";

describe("scheduleFunctionRef", () => {
  it("el 已接入 document 时应同步 ref(el)", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const input = document.createElement("input");
    root.appendChild(input);
    let last: Element | null | undefined;
    const ref = (n: Element | null) => {
      last = n;
    };
    scheduleFunctionRef(input, ref);
    expect(last).toBe(input);
    expect(last?.isConnected).toBe(true);
    await Promise.resolve();
    expect(last).toBe(input);
    root.remove();
  });

  it("父链尚未挂进 document 时仍应在微任务阶段 ref(el)", async () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    root.appendChild(input);
    let last: Element | null | undefined;
    scheduleFunctionRef(input, (n) => {
      last = n as Element | null | undefined;
    });
    expect(last).toBe(null);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(last).toBe(input);
    expect(input.isConnected).toBe(false);
  });

  it("调用前 el 已 removeChild 时应保持 ref(null)，微任务内不得 ref(旧 el)", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const input = document.createElement("input");
    root.appendChild(input);
    root.removeChild(input);
    let last: Element | null | undefined;
    scheduleFunctionRef(input, (n) => {
      last = n;
    });
    expect(last).toBe(null);
    await Promise.resolve();
    expect(last).toBe(null);
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });
