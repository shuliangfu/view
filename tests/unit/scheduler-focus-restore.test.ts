/**
 * @fileoverview 步骤 6：`flushQueue` 批末焦点恢复（默认关）；依赖 dom-setup
 */

import { describe, expect, it } from "@dreamer/test";
import {
  getViewSchedulerFocusRestoreEnabled,
  schedule,
  setViewSchedulerFocusRestoreEnabled,
} from "../../src/scheduler.ts";
import "../dom-setup.ts";

describe("步骤 6：flushQueue 焦点恢复", () => {
  /**
   * 与 {@link getViewSchedulerFocusRestoreEnabled} 一致：未写入严格 `true` 时始终为关（不因存在 document 自动开）。
   */
  it("未显式开启时 getViewSchedulerFocusRestoreEnabled 为 false", () => {
    expect(getViewSchedulerFocusRestoreEnabled()).toBe(false);
  });

  it("setViewSchedulerFocusRestoreEnabled(true) 后 getter 为 true，false 后恢复 false", () => {
    setViewSchedulerFocusRestoreEnabled(true);
    expect(getViewSchedulerFocusRestoreEnabled()).toBe(true);
    setViewSchedulerFocusRestoreEnabled(false);
    expect(getViewSchedulerFocusRestoreEnabled()).toBe(false);
  });

  /**
   * 开启后：flush 前焦点在旧 input，批内替换为同 id 新 input，批末应聚焦新节点。
   */
  it("开启焦点恢复且同 id 替换后 activeElement 指向新 input", async () => {
    setViewSchedulerFocusRestoreEnabled(true);
    try {
      const host = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(host);
      const input0 = globalThis.document.createElement("input");
      input0.type = "text";
      input0.id = "fr-step6-inp";
      host.appendChild(input0);
      input0.focus();
      expect(globalThis.document.activeElement).toBe(input0);

      schedule(() => {
        host.textContent = "";
        const input1 = globalThis.document.createElement("input");
        input1.type = "text";
        input1.id = "fr-step6-inp";
        host.appendChild(input1);
      });
      await Promise.resolve();

      const input1 = globalThis.document.getElementById(
        "fr-step6-inp",
      ) as HTMLInputElement;
      expect(input1).not.toBeNull();
      expect(globalThis.document.activeElement).toBe(input1);
      expect(input1).not.toBe(input0);
      globalThis.document.body.removeChild(host);
    } finally {
      setViewSchedulerFocusRestoreEnabled(false);
    }
  });

  /**
   * 无 id/name 的 input（如 Transfer 搜索框）：全文档同类控件中仅一条 value 与快照一致时可恢复。
   */
  it("开启焦点恢复且无 id/name 时凭 value 唯一可聚焦新 input", async () => {
    setViewSchedulerFocusRestoreEnabled(true);
    try {
      const host = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(host);
      const input0 = globalThis.document.createElement("input");
      input0.type = "text";
      input0.value = "only-one-val";
      host.appendChild(input0);
      input0.focus();
      expect(globalThis.document.activeElement).toBe(input0);

      schedule(() => {
        host.textContent = "";
        const input1 = globalThis.document.createElement("input");
        input1.type = "text";
        input1.value = "only-one-val";
        host.appendChild(input1);
      });
      await Promise.resolve();

      const input1 = host.querySelector("input") as HTMLInputElement;
      expect(input1).not.toBeNull();
      expect(globalThis.document.activeElement).toBe(input1);
      expect(input1).not.toBe(input0);
      globalThis.document.body.removeChild(host);
    } finally {
      setViewSchedulerFocusRestoreEnabled(false);
    }
  });

  /**
   * 关闭时：旧节点被卸后焦点通常落到 body，不会自动跳到同 id 新节点（与开启对比）。
   */
  it("关闭焦点恢复时替换 input 后不一定聚焦新节点", async () => {
    setViewSchedulerFocusRestoreEnabled(false);
    expect(getViewSchedulerFocusRestoreEnabled()).toBe(false);
    const host = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(host);
    const input0 = globalThis.document.createElement("input");
    input0.type = "text";
    input0.id = "fr-step6-off";
    host.appendChild(input0);
    input0.focus();

    schedule(() => {
      host.textContent = "";
      const input1 = globalThis.document.createElement("input");
      input1.type = "text";
      input1.id = "fr-step6-off";
      host.appendChild(input1);
    });
    await Promise.resolve();

    const input1 = globalThis.document.getElementById("fr-step6-off");
    expect(input1).not.toBeNull();
    expect(globalThis.document.activeElement).not.toBe(input1);
    globalThis.document.body.removeChild(host);
  });
}, { sanitizeOps: false, sanitizeResources: false });
