/**
 * P2-4: DEV-only DevTools — Owner tree / subscription counts.
 * Hot path (createSignal / createRoot) is not patched — probe + trackRoot only.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  clearTrackedRoots,
  countDownstream,
  countUpstream,
  createRootTracked,
  getSignalObserverCount,
  getTrackedRoots,
  inspectOwner,
  installOwnerDomTracking,
  isOwnerDomTracking,
  isViewDev,
  requireViewDev,
  snapshotRegistrySources,
  summarizeOwnerTree,
  trackRoot,
  uninstallOwnerDomTracking,
  untrackRoot,
} from "@dreamer/view/devtools";
import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
} from "@dreamer/view/reactivity";
import { resetRegistry } from "../dom-setup.ts";

const g = globalThis as { VIEW_DEV?: boolean };

describe("devtools (P2-4)", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    clearTrackedRoots();
  });

  afterEach(() => {
    clearTrackedRoots();
    resetRegistry();
    uninstallOwnerDomTracking();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("isViewDev mirrors globalThis.VIEW_DEV", () => {
    expect(isViewDev()).toBe(true);
    g.VIEW_DEV = false;
    expect(isViewDev()).toBe(false);
  });

  it("requireViewDev throws when VIEW_DEV is off", () => {
    g.VIEW_DEV = false;
    expect(() => requireViewDev("test")).toThrow(/VIEW_DEV/);
  });

  it("createRootTracked records roots and drops on dispose", () => {
    expect(getTrackedRoots().length).toBe(0);
    let dispose!: () => void;
    createRootTracked((d) => {
      dispose = d;
      expect(getTrackedRoots().length).toBe(1);
    });
    expect(getTrackedRoots().length).toBe(1);
    dispose();
    expect(getTrackedRoots().length).toBe(0);
  });

  it("trackRoot / untrackRoot are explicit opt-in", () => {
    createRoot((dispose) => {
      const owner = getOwner();
      trackRoot(owner);
      expect(getTrackedRoots()).toEqual([owner]);
      untrackRoot(owner);
      expect(getTrackedRoots()).toEqual([]);
      dispose();
    });
  });

  it("getSignalObserverCount counts Effect subscribers via probe", () => {
    createRoot((dispose) => {
      const count = createSignal(0);
      expect(getSignalObserverCount(count)).toBe(0);
      createEffect(() => {
        count();
      });
      expect(getSignalObserverCount(count)).toBe(1);
      createEffect(() => {
        count();
      });
      expect(getSignalObserverCount(count)).toBe(2);
      // probe must not leave a residual edge
      expect(getSignalObserverCount(count)).toBe(2);
      dispose();
    });
  });

  it("inspectOwner / summarizeOwnerTree see Effect + Memo under a root", () => {
    createRoot((dispose) => {
      const root = getOwner();
      const a = createSignal(1);
      const double = createMemo(() => a() * 2);
      double(); // lazy Memo：读一次才建立上游订阅
      createEffect(() => {
        a();
      });
      const snap = inspectOwner(root);
      expect(snap).not.toBeNull();
      expect(snap!.kind).toBe("root");
      expect(snap!.children).toBeGreaterThanOrEqual(2);

      const summary = summarizeOwnerTree(root)!;
      expect(summary.nodes).toBeGreaterThanOrEqual(3);
      expect(summary.effects).toBeGreaterThanOrEqual(1);
      expect(summary.memos).toBeGreaterThanOrEqual(1);
      expect(summary.upstreamEdges).toBeGreaterThanOrEqual(2);
      dispose();
    });
  });

  it("snapshotRegistrySources lists named signals with observer counts", () => {
    createRoot((dispose) => {
      const named = createSignal(0, "devtools-named");
      createEffect(() => named());
      const rows = snapshotRegistrySources();
      const hit = rows.find((r) => r.id === "sig:devtools-named");
      expect(hit).toBeTruthy();
      expect(hit!.observers).toBe(1);
      dispose();
    });
  });

  it("countUpstream / countDownstream helpers are callable", () => {
    expect(typeof countDownstream).toBe("function");
    expect(typeof countUpstream).toBe("function");
  });
});

describe("devtools production posture (no hot-path hooks)", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = false;
    resetRegistry();
    clearTrackedRoots();
  });

  afterEach(() => {
    clearTrackedRoots();
    resetRegistry();
    uninstallOwnerDomTracking();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("plain createRoot does not auto-track; Owner walk still works", () => {
    createRoot((dispose) => {
      const s = createSignal(0);
      createEffect(() => s());
      expect(getTrackedRoots()).toEqual([]);
      expect(getSignalObserverCount(s)).toBe(1);
      const summary = summarizeOwnerTree(getOwner());
      expect(summary).not.toBeNull();
      expect(summary!.effects).toBeGreaterThanOrEqual(1);
      dispose();
    });
  });

  it("createRootTracked does not install DOM tracking when VIEW_DEV is off", () => {
    uninstallOwnerDomTracking();
    createRootTracked(() => {
      expect(isOwnerDomTracking()).toBe(false);
    });
    expect(isOwnerDomTracking()).toBe(false);
    installOwnerDomTracking();
    expect(isOwnerDomTracking()).toBe(false);
  });
});
