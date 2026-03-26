/**
 * @fileoverview `Dynamic`：`component` 为字符串本征 / 函数 / accessor
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";
import { Dynamic } from "@dreamer/view/dynamic";
import { isMountFn, markMountFn } from "@dreamer/view/compiler";

describe("Dynamic", () => {
  /**
   * `component` 为标签名字符串时应产出 VNode（由 `insertReactive` / reconcile 消费）。
   */
  it("component 为字符串时应 jsx 本征", () => {
    const g = Dynamic({
      component: "em",
      children: "hi",
    } as Record<string, unknown>);
    const out = g();
    expect(out).not.toBeNull();
    expect(typeof out).toBe("object");
  });

  /**
   * `SignalRef` 作 component 时在 memo 内读 `.value`（本征标签名），与 `() => ref.value` 等价。
   */
  it("component 为 SignalRef 时应随 .value 切换本征标签", async () => {
    const tag = createSignal<"span" | "em">("span");
    const g = Dynamic({
      component: tag,
      children: "hi",
    } as Record<string, unknown>);
    const refs: unknown[] = [];
    createEffect(() => {
      refs.push(g());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    const first = refs.at(-1) as { type?: string };
    expect(first?.type).toBe("span");
    tag.value = "em";
    await Promise.resolve();
    await Promise.resolve();
    const second = refs.at(-1) as { type?: string };
    expect(second?.type).toBe("em");
  });

  /**
   * 无参 accessor 应解析为当前组件并调用。
   */
  it("component 为 accessor 时应随 signal 切换", async () => {
    const pick = createSignal<"a" | "b">("a");
    const A = markMountFn((_p: Node) => {});
    const B = markMountFn((_p: Node) => {});
    const g = Dynamic({
      component: () => (pick.value === "a" ? A : B),
    } as Record<string, unknown>);
    const refs: unknown[] = [];
    createEffect(() => {
      refs.push(g());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(isMountFn(refs.at(-1) as object)).toBe(true);
    pick.value = "b";
    await Promise.resolve();
    await Promise.resolve();
    expect(refs.at(-1)).toBe(B);
  });

  /**
   * `component` 为假值时应返回 null。
   */
  it("component 为 false 时应为 null", () => {
    const g = Dynamic({
      component: () => false,
    } as Record<string, unknown>);
    expect(g()).toBeNull();
  });
});
