/**
 * insertReactive 返回 MountFn 时，同步挂载须在 `untrack` 中执行，避免 MountFn 体内的 signal 读挂到本层 effect，
 * 否则会出现「键入一字整段 DOM 重建 / 失焦」等问题（见 ui-view Transfer 搜索框）。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, insertReactive, markMountFn } from "@dreamer/view";

function flush(): Promise<void> {
  return new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
}

describe(
  "insertReactive：MountFn 同步挂载 untrack（不误订阅本层 effect）",
  () => {
    it("MountFn 内读 signal 不应使本层 insertReactive 在 signal 更新时重跑 mount 体", async () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);

      const q = createSignal("");
      let mountRuns = 0;

      const dispose = insertReactive(
        parent,
        () =>
          markMountFn((p: Node) => {
            mountRuns += 1;
            void q.value;
            const shell = globalThis.document.createElement("div");
            shell.setAttribute("data-role", "mountfn-shell");
            p.appendChild(shell);
          }),
      );

      expect(mountRuns).toBe(1);
      expect(parent.querySelectorAll("[data-role='mountfn-shell']").length)
        .toBe(
          1,
        );

      q.value = "a";
      await flush();

      expect(mountRuns).toBe(1);
      expect(parent.querySelectorAll("[data-role='mountfn-shell']").length)
        .toBe(
          1,
        );

      dispose();
      globalThis.document.body.removeChild(parent);
    });

    it("MountFn 内嵌套的 insertReactive 仍正常订阅 signal", async () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);

      const label = createSignal("x");

      const dispose = insertReactive(
        parent,
        () =>
          markMountFn((p: Node) => {
            const shell = globalThis.document.createElement("div");
            shell.setAttribute("data-role", "nested-shell");
            p.appendChild(shell);
            insertReactive(shell, () => {
              const span = globalThis.document.createElement("span");
              span.textContent = label.value;
              return span;
            });
          }),
      );

      const span0 = parent.querySelector("span");
      expect(span0?.textContent).toBe("x");

      label.value = "y";
      await flush();

      const span1 = parent.querySelector("span");
      expect(span1?.textContent).toBe("y");

      dispose();
      globalThis.document.body.removeChild(parent);
    });
  },
  { sanitizeOps: false, sanitizeResources: false },
);
