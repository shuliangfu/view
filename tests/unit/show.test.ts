/**
 * @fileoverview `Show`：真假分支、markMountFn 子节点、与 `when` accessor
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";
import { isMountFn, markMountFn } from "@dreamer/view/compiler";
import { Show } from "@dreamer/view/show";

describe("Show", () => {
  it("when 为假时应走 fallback", () => {
    const g = Show({
      when: () => false,
      children: () => "yes",
      fallback: () => "no",
    });
    expect(g()).toBe("no");
  });

  it("when 为真且 children 为单参函数时应传入窄化值", () => {
    const g = Show({
      when: () => "hi" as string | false,
      children: (s: string) => `got:${s}`,
    });
    expect(g()).toBe("got:hi");
  });

  it("when 为真且 children 为无参函数时应调用该函数", () => {
    const g = Show({
      when: () => true,
      children: () => 42,
    });
    expect(g()).toBe(42);
  });

  it("children 为 markMountFn 时不应把其当 (value)=> 调用", () => {
    const mf = markMountFn((_p: Node) => {});
    expect(isMountFn(mf)).toBe(true);
    const g = Show({
      when: () => true,
      children: mf,
    });
    expect(g()).toBe(mf);
  });

  it("when 为 SignalRef 时 getter 应在 effect 中随 .value 更新", async () => {
    const flag = createSignal(false);
    const g = Show({
      when: flag,
      children: () => "on",
      fallback: () => "off",
    });
    const snaps: unknown[] = [];
    createEffect(() => {
      snaps.push(g());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(snaps.at(-1)).toBe("off");
    flag.value = true;
    await Promise.resolve();
    await Promise.resolve();
    expect(snaps.at(-1)).toBe("on");
  });

  it("when 随 signal 变化时 getter 应在 effect 中更新", async () => {
    const flag = createSignal(false);
    const g = Show({
      when: () => flag.value,
      children: () => "on",
      fallback: () => "off",
    });
    const snaps: unknown[] = [];
    createEffect(() => {
      snaps.push(g());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(snaps.at(-1)).toBe("off");
    flag.value = true;
    await Promise.resolve();
    await Promise.resolve();
    expect(snaps.at(-1)).toBe("on");
  });
});
