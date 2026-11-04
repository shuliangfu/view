import "../dom-setup.ts";
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { For, Index } from "@dreamer/view/control-flow";
import { jsx } from "@dreamer/view/jsx-runtime";
import { mount } from "@dreamer/view/csr";
import { clearMissingListKeyWarns } from "../../../src/runtime/utils.ts";

describe("runtime/control-flow missing key DEV tip (P1)", () => {
  const g = globalThis as { VIEW_DEV?: boolean };
  let prev: boolean | undefined;
  let warns: string[];
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    prev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    clearMissingListKeyWarns();
    warns = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.warn = originalWarn;
    clearMissingListKeyWarns();
    if (prev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prev;
  });

  it("warns once for For without key under VIEW_DEV", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(
      () =>
        For({
          each: () => [1, 2],
          children: (n) => jsx("span", { children: String(n) }),
        }),
      root,
    );
    expect(warns.some((w) => w.includes("<For>") && w.includes("without key")))
      .toBe(
        true,
      );
    const n = warns.filter((w) =>
      w.includes("<For>") && w.includes("without key")
    )
      .length;
    const dispose2 = mount(
      () =>
        For({
          each: () => ["a"],
          children: (s) => jsx("span", { children: s }),
        }),
      root,
    );
    expect(
      warns.filter((w) => w.includes("<For>") && w.includes("without key"))
        .length,
    ).toBe(n);
    dispose();
    dispose2();
    root.remove();
  });

  it("does not warn when For has key", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(
      () =>
        For({
          each: () => [{ id: 1 }, { id: 2 }],
          key: (it) => it.id,
          children: (it) => jsx("span", { children: String(it.id) }),
        }),
      root,
    );
    expect(warns.some((w) => w.includes("<For>") && w.includes("without key")))
      .toBe(
        false,
      );
    dispose();
    root.remove();
  });

  it("warns once for Index without key under VIEW_DEV", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(
      () =>
        Index({
          each: () => [10, 20],
          children: (n) => jsx("span", { children: String(n) }),
        }),
      root,
    );
    expect(
      warns.some((w) => w.includes("<Index>") && w.includes("without key")),
    ).toBe(true);
    dispose();
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });
