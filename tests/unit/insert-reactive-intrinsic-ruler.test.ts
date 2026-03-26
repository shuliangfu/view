/**
 * ANALYSIS.md「步骤 0：标尺测试」——本征树结构不变、仅响应式叶节点变化时的验收基线。
 *
 * - **始终执行**：验证 `insertReactive(parent, () => vnode)` 在仅 signal 驱动叶文本时，界面内容会更新。
 * - **严格标尺**：断言多轮更新后 **根 `Element` 引用不变**（`===`）及 **input 焦点**；由常量 `VIEW_INTRINSIC_RULER_ASSERT_ROOT_STABLE` 控制（步骤 2 完成后应为 `true`）。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, insertReactive } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

/**
 * 等待一轮微任务，使 signal 触发的 effect / insertReactive 已 flush（与同目录其它 insertReactive 测试一致）。
 */
function flushEffects(): Promise<void> {
  return new Promise<void>((resolve) =>
    globalThis.queueMicrotask(() => resolve())
  );
}

/**
 * 步骤 2 完成后改为 `true`，启用「根引用 ===」与 input 焦点标尺用例。
 */
const VIEW_INTRINSIC_RULER_ASSERT_ROOT_STABLE = true;

describe(
  "insertReactive：本征标尺（结构不变、仅叶响应式）",
  () => {
    it("叶文本随 signal 变化时 span 内容更新", async () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);

      const text = createSignal("first");
      const dispose = insertReactive(parent, () =>
        jsx("div", {
          id: "intrinsic-ruler-root",
          children: jsx("span", {
            id: "intrinsic-ruler-label",
            children: text.value,
          }),
        }));

      await flushEffects();
      expect(
        parent.querySelector("#intrinsic-ruler-label")?.textContent,
      ).toBe("first");

      text.value = "second";
      await flushEffects();
      expect(
        parent.querySelector("#intrinsic-ruler-label")?.textContent,
      ).toBe("second");

      dispose();
      globalThis.document.body.removeChild(parent);
    });

    it.skipIf(
      !VIEW_INTRINSIC_RULER_ASSERT_ROOT_STABLE,
      "标尺：多轮更新后根 div 与第一轮为同一 Element（步骤 2 后启用）",
      async () => {
        const parent = globalThis.document.createElement("div");
        globalThis.document.body.appendChild(parent);

        const text = createSignal("a");
        const dispose = insertReactive(parent, () =>
          jsx("div", {
            id: "intrinsic-ruler-root",
            children: jsx("span", {
              id: "intrinsic-ruler-label",
              children: text.value,
            }),
          }));

        await flushEffects();
        const root1 = parent.querySelector(
          "#intrinsic-ruler-root",
        ) as HTMLDivElement | null;
        expect(root1).not.toBeNull();

        text.value = "b";
        await flushEffects();
        const root2 = parent.querySelector(
          "#intrinsic-ruler-root",
        ) as HTMLDivElement | null;
        expect(root2).not.toBeNull();
        expect(root2).toBe(root1);

        dispose();
        globalThis.document.body.removeChild(parent);
      },
    );

    it.skipIf(
      !VIEW_INTRINSIC_RULER_ASSERT_ROOT_STABLE,
      "标尺：多轮更新后聚焦的 input 仍为同一节点且保持焦点（步骤 2 后启用）",
      async () => {
        const parent = globalThis.document.createElement("div");
        globalThis.document.body.appendChild(parent);

        const value = createSignal("x");
        const dispose = insertReactive(parent, () =>
          jsx("div", {
            id: "intrinsic-ruler-root",
            children: jsx("input", {
              id: "intrinsic-ruler-input",
              type: "text",
              value: () => value.value,
            }),
          }));

        await flushEffects();
        const input1 = parent.querySelector(
          "#intrinsic-ruler-input",
        ) as HTMLInputElement | null;
        expect(input1).not.toBeNull();
        input1!.focus();
        expect(globalThis.document.activeElement).toBe(input1);

        value.value = "y";
        await flushEffects();
        const input2 = parent.querySelector(
          "#intrinsic-ruler-input",
        ) as HTMLInputElement | null;
        expect(input2).not.toBeNull();
        expect(input2).toBe(input1);
        expect(globalThis.document.activeElement).toBe(input2);

        dispose();
        globalThis.document.body.removeChild(parent);
      },
    );
  },
  { sanitizeOps: false, sanitizeResources: false },
);
