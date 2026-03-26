/**
 * {@link getIrMetrics}：开发向 insertReactive patch / 重挂计数（须显式开启 global 键）。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createSignal,
  getIrMetrics,
  insertReactive,
  KEY_VIEW_IR_METRICS_ENABLED,
  resetIrMetrics,
} from "@dreamer/view";
import { setGlobal } from "@dreamer/view/globals";
import { jsx } from "@dreamer/view/jsx-runtime";

/** 等待 effect / microtask 一轮 */
function flush(): Promise<void> {
  return new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
}

describe("ir-metrics", () => {
  it("未开启全局开关时不累计 patch / remount", async () => {
    setGlobal(KEY_VIEW_IR_METRICS_ENABLED, false);
    resetIrMetrics();
    const phase = createSignal(0);
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(parent, () =>
      jsx("div", {
        "data-p": String(phase.value),
        children: jsx("span", { children: "x" }),
      }));
    await flush();
    phase.value = 1;
    await flush();
    const m = getIrMetrics();
    expect(m.patchAfterPriorDom).toBe(0);
    expect(m.remountAfterPriorDom).toBe(0);
    dispose();
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 开启开关后：连续本征 patch 仅增加 patchAfterPriorDom；首帧不计数。
   */
  it("开启开关时连续本征 patch 累计 patchAfterPriorDom", async () => {
    setGlobal(KEY_VIEW_IR_METRICS_ENABLED, true);
    resetIrMetrics();
    const phase = createSignal(0);
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(parent, () =>
      jsx("div", {
        "data-p": String(phase.value),
        children: jsx("span", { children: "x" }),
      }));
    await flush();
    phase.value = 1;
    await flush();
    phase.value = 2;
    await flush();
    const m = getIrMetrics();
    expect(m.patchAfterPriorDom).toBe(2);
    expect(m.remountAfterPriorDom).toBe(0);
    dispose();
    setGlobal(KEY_VIEW_IR_METRICS_ENABLED, false);
    resetIrMetrics();
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 标签切换导致不可 patch 时须计 remountAfterPriorDom。
   */
  it("开启开关且结构不兼容时累计 remountAfterPriorDom", async () => {
    setGlobal(KEY_VIEW_IR_METRICS_ENABLED, true);
    resetIrMetrics();
    const wide = createSignal(false);
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(
      parent,
      () =>
        wide.value
          ? jsx("p", { children: "p" })
          : jsx("div", { children: "d" }),
    );
    await flush();
    wide.value = true;
    await flush();
    const m = getIrMetrics();
    expect(m.patchAfterPriorDom).toBe(0);
    expect(m.remountAfterPriorDom).toBe(1);
    dispose();
    setGlobal(KEY_VIEW_IR_METRICS_ENABLED, false);
    resetIrMetrics();
    globalThis.document.body.removeChild(parent);
  });
}, { sanitizeOps: false, sanitizeResources: false });
