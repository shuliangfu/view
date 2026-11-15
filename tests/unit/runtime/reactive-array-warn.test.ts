import "../dom-setup.ts";
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { createSignal, insert } from "@dreamer/view";
import { clearReactiveArrayChildWarns } from "../../../src/runtime/utils.ts";

describe("runtime/insert reactive array DEV tip", () => {
  const g = globalThis as { VIEW_DEV?: boolean };
  let prev: boolean | undefined;
  let warns: string[];
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    prev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    clearReactiveArrayChildWarns();
    warns = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.warn = originalWarn;
    clearReactiveArrayChildWarns();
    if (prev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prev;
  });

  it("VIEW_DEV 下响应式数组子节点应只警告一次", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const [items, setItems] = createSignal(["a"]);
    insert(host, () => items().map((x) => x));
    expect(warns.some((w) => w.includes("<For") && w.includes("array"))).toBe(
      true,
    );
    const n = warns.length;
    setItems(["a", "b"]);
    insert(host, () => items().map((x) => x));
    expect(warns.length).toBe(n);
    host.remove();
  });

  it("静态数组插入不应警告", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    insert(host, ["a", "b"]);
    expect(warns.length).toBe(0);
    host.remove();
  });

  it("未开 VIEW_DEV 时不应警告", () => {
    const g2 = globalThis as { VIEW_DEV?: boolean };
    g2.VIEW_DEV = false;
    const host = document.createElement("div");
    document.body.appendChild(host);
    insert(host, () => ["a"]);
    expect(warns.length).toBe(0);
    host.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });
