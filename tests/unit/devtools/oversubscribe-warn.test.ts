/**
 * P2-dev-warn-oversubscribe: DEV / explicit opt-in wide-subscription + remount-churn.
 * Does not patch createSignal / createRoot / insert.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  clearRemountNotes,
  clearOversubscribeWarnState,
  clearTrackedRoots,
  detectOwnerRemountChurn,
  detectOversubscribe,
  detectRemountChurn,
  detectWideSubscriptions,
  disableOversubscribeWarnings,
  enableOversubscribeWarnings,
  noteRemount,
} from "@dreamer/view/devtools";
import {
  createEffect,
  createRoot,
  createSignal,
  getOwner,
} from "@dreamer/view/reactivity";
import { flushPendingSync } from "../../../src/scheduler/batch.ts";
import { resetRegistry } from "../dom-setup.ts";

const g = globalThis as { VIEW_DEV?: boolean };

describe("devtools oversubscribe warn (P2)", () => {
  let prevDev: boolean | undefined;
  const warned: { kind: string; message: string }[] = [];

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
    clearTrackedRoots();
    clearRemountNotes();
    clearOversubscribeWarnState();
    warned.length = 0;
  });

  afterEach(() => {
    disableOversubscribeWarnings();
    clearRemountNotes();
    clearOversubscribeWarnState();
    clearTrackedRoots();
    resetRegistry();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("detectWideSubscriptions flags Effects above maxUpstream", () => {
    createRoot((dispose) => {
      const sigs = Array.from({ length: 10 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
      const hits = detectWideSubscriptions(getOwner(), { maxUpstream: 8 });
      expect(hits.length).toBe(1);
      expect(hits[0]!.kind).toBe("wide-subscription");
      expect(hits[0]!.upstream).toBe(10);
      dispose();
    });
  });

  it("detectWideSubscriptions stays quiet under threshold", () => {
    createRoot((dispose) => {
      const a = createSignal(0);
      const b = createSignal(1);
      createEffect(() => {
        a();
        b();
      });
      expect(detectWideSubscriptions(getOwner(), { maxUpstream: 8 })).toEqual(
        [],
      );
      dispose();
    });
  });

  it("noteRemount + detectRemountChurn respects window threshold", () => {
    const t0 = 1_000_000;
    noteRemount("PullRefresh", t0);
    noteRemount("PullRefresh", t0 + 100);
    expect(detectRemountChurn("PullRefresh", { maxRemounts: 3 }, t0 + 200))
      .toBeNull();
    noteRemount("PullRefresh", t0 + 200);
    const hit = detectRemountChurn("PullRefresh", {
      maxRemounts: 3,
      remountWindowMs: 2000,
    }, t0 + 250);
    expect(hit).not.toBeNull();
    expect(hit!.kind).toBe("remount-churn");
    expect(hit!.remounts).toBe(3);
  });

  it("detectOversubscribe combines owner scan + remount keys", () => {
    createRoot((dispose) => {
      const sigs = Array.from({ length: 9 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
      const t0 = Date.now();
      noteRemount("shell", t0);
      noteRemount("shell", t0 + 10);
      noteRemount("shell", t0 + 20);
      const all = detectOversubscribe(getOwner(), {
        maxUpstream: 8,
        maxRemounts: 3,
        remountKeys: ["shell"],
      });
      expect(all.some((w) => w.kind === "wide-subscription")).toBe(true);
      expect(all.some((w) => w.kind === "remount-churn")).toBe(true);
      dispose();
    });
  });

  it("emit requires VIEW_DEV", () => {
    g.VIEW_DEV = false;
    createRoot((dispose) => {
      const sigs = Array.from({ length: 9 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
      // inspect without emit still works
      expect(detectWideSubscriptions(getOwner(), { maxUpstream: 8 }).length)
        .toBe(1);
      expect(() =>
        detectWideSubscriptions(getOwner(), {
          maxUpstream: 8,
          emit: true,
          onWarn: (w) => warned.push(w),
        })
      ).toThrow(/VIEW_DEV/);
      dispose();
    });
  });

  it("enableOversubscribeWarnings is opt-in and stoppable", () => {
    createRoot((dispose) => {
      const owner = getOwner();
      const sigs = Array.from({ length: 9 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
      const stop = enableOversubscribeWarnings({
        owner,
        intervalMs: 10_000,
        includeTrackedRoots: false,
        maxUpstream: 8,
        onWarn: (w) => warned.push(w),
      });
      expect(warned.some((w) => w.kind === "wide-subscription")).toBe(true);
      stop();
      dispose();
    });
  });

  it("enableOversubscribeWarnings throws when VIEW_DEV is off", () => {
    g.VIEW_DEV = false;
    expect(() => enableOversubscribeWarnings({ intervalMs: 10_000 })).toThrow(
      /VIEW_DEV/,
    );
  });

  it("detectOwnerRemountChurn fires when first-level children fully replaced", () => {
    createRoot((dispose) => {
      const root = getOwner()!;
      const toggle = createSignal(0);
      createEffect(() => {
        toggle();
        // nested child Effect is destroyed + recreated when outer Effect re-runs
        createEffect(() => {
          /* leaf */
        });
      });
      // Seed fingerprint (outer Effect + inner Effect → nodes >= 3)
      expect(detectOwnerRemountChurn(root)).toBeNull();
      toggle.value = 1;
      flushPendingSync();
      const hit = detectOwnerRemountChurn(root);
      expect(hit).not.toBeNull();
      expect(hit!.kind).toBe("remount-churn");
      dispose();
    });
  });
});

describe("devtools oversubscribe production posture", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = false;
    resetRegistry();
    clearTrackedRoots();
    clearRemountNotes();
    clearOversubscribeWarnState();
  });

  afterEach(() => {
    disableOversubscribeWarnings();
    clearRemountNotes();
    clearOversubscribeWarnState();
    clearTrackedRoots();
    resetRegistry();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("plain createRoot path unchanged; detect without emit works", () => {
    createRoot((dispose) => {
      const a = createSignal(0);
      createEffect(() => a());
      expect(detectWideSubscriptions(getOwner(), { maxUpstream: 8 })).toEqual(
        [],
      );
      dispose();
    });
  });
});
