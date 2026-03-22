/**
 * @fileoverview 开发期 runtime 诊断：多参受控、嵌套 style（需 __VIEW_DEV__）
 */

import "../dom-setup.ts";
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  disableViewRuntimeDevWarnings,
  enableViewRuntimeDevWarnings,
  resetViewRuntimeDevWarningsForTesting,
} from "../../src/dev-runtime-warn.ts";
import "../../src/compiler/mod.ts";
import { jsx } from "../../src/jsx-runtime.ts";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";

describe("viewRuntimeDevWarn（手写 VNode 路径）", () => {
  const originalWarn = console.warn;
  let warnSpy: typeof console.warn;

  beforeEach(() => {
    resetViewRuntimeDevWarningsForTesting();
    enableViewRuntimeDevWarnings();
    warnSpy = (...args: unknown[]) => {
      originalWarn(...args);
    };
    console.warn = warnSpy as typeof console.warn;
  });

  afterEach(() => {
    console.warn = originalWarn;
    disableViewRuntimeDevWarnings();
    resetViewRuntimeDevWarningsForTesting();
  });

  it("关闭诊断时不应 warn", () => {
    disableViewRuntimeDevWarnings();
    let calls = 0;
    console.warn = () => {
      calls++;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("input", {
        type: "text",
        value: ((a: number) => a) as unknown as string,
      }),
    );
    expect(calls).toBe(0);
    document.body.removeChild(container);
    console.warn = warnSpy as typeof console.warn;
  });

  it("value 为多参函数时应提示一次", () => {
    let msg = "";
    console.warn = (m: string) => {
      msg = m;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("input", {
        type: "text",
        value: ((a: number) => String(a)) as unknown as string,
      }),
    );
    expect(msg).toContain("[view/runtime]");
    expect(msg).toContain("多参函数");
    document.body.removeChild(container);
  });

  it("style 含嵌套对象时应提示", () => {
    let msg = "";
    console.warn = (m: string) => {
      msg = m;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    mountVNodeTree(
      container,
      jsx("div", {
        style: { outer: { inner: "1" } } as unknown as Record<string, string>,
        children: "x",
      }),
    );
    expect(msg).toContain("嵌套");
    document.body.removeChild(container);
  });
}, { sanitizeOps: false, sanitizeResources: false });
