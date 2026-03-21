/**
 * @fileoverview 手写 jsx→VNode→mountVNodeTree 路径应对自定义指令调用 applyDirectives（与 compileSource 一致）。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";
import { registerDirective } from "@dreamer/view/directive";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";

describe("mountVNodeTree + 自定义指令（手写 VNode）", () => {
  it("mounted 应在微任务内执行", async () => {
    let mountedEl: Element | null = null;
    registerDirective("v-vnode-hand-mounted", {
      mounted(el) {
        mountedEl = el;
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("div", {
      "v-vnode-hand-mounted": true,
      children: "x",
    });
    mountVNodeTree(container, vnode);
    expect(mountedEl).toBeNull();
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(mountedEl).toBe(container.firstElementChild);
    document.body.removeChild(container);
  });

  it("binding 为 signal getter 时 updated 应随依赖重跑", async () => {
    let updates = 0;
    registerDirective("v-vnode-hand-upd", {
      updated(_el, b) {
        updates++;
        expect(b.value).toBeDefined();
      },
    });
    const count = createSignal(0);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vnode = jsx("span", {
      "v-vnode-hand-upd": count,
      children: "c",
    });
    mountVNodeTree(container, vnode);
    await new Promise<void>((r) => queueMicrotask(() => r()));
    const initial = updates;
    count.value = 1;
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(updates).toBeGreaterThan(initial);
    document.body.removeChild(container);
  });
}, { sanitizeOps: false, sanitizeResources: false });
