/**
 * Leak-safe DevTools labels, previews, owner stamps, and the update timeline.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { insert } from "@dreamer/view/csr";
import {
  clearTimeline,
  clearTrackedRoots,
  createRootTracked,
  DEVTOOLS_TIMELINE_CAP,
  formatSourceLabel,
  getTrackedRoots,
  inspectOwnerIndexed,
  installDevtoolsRuntimeHooks,
  isDevtoolsRuntimeHooksInstalled,
  previewValue,
  snapshotRegistrySources,
  snapshotTimeline,
  uninstallDevtoolsRuntimeHooks,
  uninstallOwnerDomTracking,
} from "@dreamer/view/devtools";
import { jsx } from "@dreamer/view/jsx-runtime";
import { createRoot, createSignal } from "@dreamer/view/reactivity";
import { resetRegistry } from "../dom-setup.ts";

const g = globalThis as { VIEW_DEV?: boolean };

describe("devtools / meta", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    uninstallDevtoolsRuntimeHooks();
    clearTimeline();
  });

  afterEach(() => {
    uninstallDevtoolsRuntimeHooks();
    clearTimeline();
    clearTrackedRoots();
    uninstallOwnerDomTracking();
    resetRegistry();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("previewValue is cheap and never deep-stringifies large objects", () => {
    expect(previewValue(null)).toBe("null");
    expect(previewValue(undefined)).toBe("undefined");
    expect(previewValue(12)).toBe("12");
    expect(previewValue(true)).toBe("true");
    expect(previewValue("hi")).toBe('"hi"');
    expect(previewValue(["a", "b", "c"])).toBe("Array(3)");
    expect(previewValue({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
    const wide: Record<string, number> = {};
    for (let i = 0; i < 20; i++) wide[`k${i}`] = i;
    const preview = previewValue(wide);
    expect(preview.startsWith("Object {")).toBe(true);
    expect(preview.includes("19")).toBe(false);
  });

  it("formatSourceLabel prefers owner.debugName, then debugName, then #index", () => {
    expect(
      formatSourceLabel({
        id: "sig:x",
        debugName: "count",
        ownerLabel: "UserCard",
        anonymous: true,
      }),
    ).toBe("UserCard.count");
    expect(formatSourceLabel({
      id: "sig:x",
      debugName: "count",
      anonymous: true,
    })).toBe("count");
    expect(formatSourceLabel({
      id: "sig:session:9",
      ownerLabel: "UserCard",
      index: 2,
      anonymous: true,
    })).toBe("UserCard #2");
    expect(formatSourceLabel({
      id: "sig:saved",
      anonymous: false,
    })).toBe("saved");
  });

  it("debugName is display-only and does not merge Signals", () => {
    const a = createSignal(1, { debugName: "count" });
    const b = createSignal(2, { debugName: "count" });
    expect(a()).toBe(1);
    expect(b()).toBe(2);
    b(9);
    expect(a()).toBe(1);
    expect(b()).toBe(9);
  });

  it("name still creates an HMR physical singleton", () => {
    const a = createSignal(1, { name: "shared-meta", debugName: "one" });
    const b = createSignal(1, { name: "shared-meta", debugName: "two" });
    expect(b()).toBe(1);
    a(4);
    expect(b()).toBe(4);
    expect(a()).toBe(4);
  });

  it("hooks record labeled snapshots and a primitive-only timeline", () => {
    installDevtoolsRuntimeHooks();
    expect(isDevtoolsRuntimeHooksInstalled()).toBe(true);
    const count = createSignal(3, { debugName: "count" });
    const rows = snapshotRegistrySources();
    const hit = rows.find((r) => r.debugName === "count");
    expect(hit).toBeDefined();
    expect(hit!.label).toBe("count");
    expect(hit!.preview).toBe("3");
    count(4);
    const snap = snapshotTimeline();
    expect(snap.total).toBe(1);
    expect(snap.events.length).toBe(1);
    const ev = snap.events[0]!;
    expect(ev.label).toBe("count");
    expect(ev.preview).toBe("4");
    expect(typeof ev.t).toBe("number");
    expect(typeof ev.id).toBe("string");
    expect(typeof ev.observers).toBe("number");
    expect(JSON.parse(JSON.stringify(ev))).toEqual(ev);
  });

  it("timeline is capped and cleared when hooks uninstall", () => {
    installDevtoolsRuntimeHooks();
    const n = createSignal(0, { debugName: "n" });
    for (let i = 1; i <= DEVTOOLS_TIMELINE_CAP + 20; i++) n(i);
    const snap = snapshotTimeline();
    expect(snap.events.length).toBe(DEVTOOLS_TIMELINE_CAP);
    expect(snap.total).toBe(DEVTOOLS_TIMELINE_CAP + 20);
    expect(snap.events[0]!.preview).toBe("21");
    expect(snap.events.at(-1)!.preview).toBe(
      String(DEVTOOLS_TIMELINE_CAP + 20),
    );
    uninstallDevtoolsRuntimeHooks();
    expect(isDevtoolsRuntimeHooksInstalled()).toBe(false);
    expect(snapshotTimeline().events.length).toBe(0);
    expect(snapshotTimeline().total).toBe(0);
    n(999);
    expect(snapshotTimeline().events.length).toBe(0);
    const hookBag = globalThis as Record<string, unknown>;
    expect(hookBag.__DREAMER_COMPONENT_OWNER__).toBeUndefined();
    expect(hookBag.__DREAMER_SIGNAL_META__).toBeUndefined();
  });

  it("stamped component names appear on the Owner tree", () => {
    installDevtoolsRuntimeHooks();
    function UserCard() {
      createSignal(1, { debugName: "likes" });
      return jsx("div", { id: "user-card", children: "hi" });
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    try {
      createRootTracked(() => {
        insert(host, jsx(UserCard, {}));
      });
      const root = getTrackedRoots()[0]!;
      const indexed = inspectOwnerIndexed(root, { rootId: "0" })!;
      const found: string[] = [];
      const walk = (node: typeof indexed) => {
        if (node.name) found.push(node.name);
        if (node.component) found.push(node.component);
        for (const c of node.childNodes) walk(c);
      };
      walk(indexed);
      expect(found).toContain("UserCard");
      const rows = snapshotRegistrySources();
      const likes = rows.find((r) => r.debugName === "likes");
      expect(likes).toBeDefined();
      expect(likes!.ownerLabel).toBe("UserCard");
      expect(likes!.label).toBe("UserCard.likes");
    } finally {
      host.remove();
    }
  });

  it("disposing a root drops anonymous Signals even with hooks installed", () => {
    installDevtoolsRuntimeHooks();
    const before = snapshotRegistrySources().length;
    createRoot((dispose) => {
      for (let i = 0; i < 16; i++) createSignal(i);
      expect(snapshotRegistrySources().length).toBe(before + 16);
      dispose();
    });
    expect(snapshotRegistrySources().length).toBe(before);
  });
});
