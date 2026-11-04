import "../dom-setup.ts";
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { For, Show } from "@dreamer/view/control-flow";
import { createSignal } from "@dreamer/view/reactivity";
import { jsx } from "@dreamer/view/jsx-runtime";
import { mount } from "@dreamer/view/csr";
import { clearEagerControlFlowWarns } from "../../../src/runtime/utils.ts";

describe("runtime/control-flow eager when/each DEV tip (P1)", () => {
  const g = globalThis as { VIEW_DEV?: boolean };
  let prev: boolean | undefined;
  let warns: string[];
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    prev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    clearEagerControlFlowWarns();
    warns = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.warn = originalWarn;
    clearEagerControlFlowWarns();
    if (prev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prev;
  });

  it("warns once for plain when boolean under VIEW_DEV", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(
      () =>
        Show({ when: true as const, children: jsx("span", { children: "x" }) }),
      root,
    );
    expect(warns.some((w) => w.includes("when=") && w.includes("plain value")))
      .toBe(true);
    const n = warns.length;
    const dispose2 = mount(
      () =>
        Show({
          when: false as const,
          children: jsx("span", { children: "y" }),
        }),
      root,
    );
    expect(warns.length).toBe(n); // once-per-kind
    dispose();
    dispose2();
    root.remove();
  });

  it("does not warn for Signal getter when={open}", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const [open] = createSignal(true);
    const dispose = mount(
      () =>
        Show({
          when: open,
          children: jsx("span", { id: "ok", children: "x" }),
        }),
      root,
    );
    expect(warns.length).toBe(0);
    expect(root.querySelector("#ok")).toBeTruthy();
    dispose();
    root.remove();
  });

  it("warns once for plain each array under VIEW_DEV", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dispose = mount(
      () =>
        For({
          each: [1, 2] as number[],
          children: (n) => jsx("span", { children: String(n) }),
        }),
      root,
    );
    expect(warns.some((w) => w.includes("each=") && w.includes("plain value")))
      .toBe(true);
    dispose();
    root.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });
