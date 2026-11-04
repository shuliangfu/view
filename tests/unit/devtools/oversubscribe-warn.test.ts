/**
 * P2-dev-warn-oversubscribe: DEV / explicit opt-in wide-subscription + remount-churn.
 * Does not patch createSignal / createRoot / insert.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  clearComponentSetupNotes,
  clearOversubscribeWarnState,
  clearRemountNotes,
  clearTrackedRoots,
  createRootTracked,
  detectComponentRerun,
  detectOversubscribe,
  detectOwnerRemountChurn,
  detectRemountChurn,
  detectWideSubscriptions,
  disableOversubscribeWarnings,
  enableOversubscribeWarnings,
  getTrackedRoots,
  inspectOwner,
  noteComponentSetup,
  noteRemount,
  type OwnerNodeSnapshot,
} from "@dreamer/view/devtools";
import { createRouter } from "@dreamer/view/router";
import { jsx } from "@dreamer/view/jsx-runtime";
import {
  createEffect,
  createRoot,
  createSignal,
  getOwner,
} from "@dreamer/view/reactivity";
import { insert } from "../../../src/runtime/insert.ts";
import { flushPendingSync } from "../../../src/scheduler/batch.ts";
import { resetRegistry } from "../dom-setup.ts";

function countOwners(node: OwnerNodeSnapshot | null): number {
  if (!node) return 0;
  let n = 1;
  for (const child of node.childNodes) n += countOwners(child);
  return n;
}

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
    clearComponentSetupNotes();
    clearOversubscribeWarnState();
    warned.length = 0;
  });

  afterEach(() => {
    disableOversubscribeWarnings();
    clearRemountNotes();
    clearComponentSetupNotes();
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

  it("does not flag a one-time placeholder expansion (small shell → page)", () => {
    createRoot((dispose) => {
      const root = getOwner()!;
      const phase = createSignal(0);
      createEffect(() => {
        if (phase() === 0) {
          // loading shell: effect + one child (subtree 2, under the cap)
          createEffect(() => {});
        } else {
          for (let i = 0; i < 8; i++) createEffect(() => {});
        }
      });
      expect(detectOwnerRemountChurn(root)).toBeNull();
      phase.value = 1;
      flushPendingSync();
      // 2 → 9 is the examples loading→page shape, scaled down
      expect(detectOwnerRemountChurn(root)).toBeNull();
      dispose();
    });
  });

  it("still flags equal-size replacement of an established subtree", () => {
    createRoot((dispose) => {
      const root = getOwner()!;
      const phase = createSignal(0);
      createEffect(() => {
        phase();
        for (let i = 0; i < 12; i++) createEffect(() => {});
      });
      expect(detectOwnerRemountChurn(root)).toBeNull();
      phase.value = 1;
      flushPendingSync();
      const hit = detectOwnerRemountChurn(root);
      expect(hit).not.toBeNull();
      expect(hit!.kind).toBe("remount-churn");
      expect(hit!.path).toBe("0/0");
      dispose();
    });
  });

  it("still flags a large shell collapsing to a placeholder", () => {
    createRoot((dispose) => {
      const root = getOwner()!;
      const phase = createSignal(0);
      createEffect(() => {
        const n = phase() === 0 ? 12 : 1;
        for (let i = 0; i < n; i++) createEffect(() => {});
      });
      expect(detectOwnerRemountChurn(root)).toBeNull();
      phase.value = 1;
      flushPendingSync();
      expect(detectOwnerRemountChurn(root)?.kind).toBe("remount-churn");
      dispose();
    });
  });

  it("examples-shaped mount: loading→page at path 0/0 does not warn; narrow class does not remount", async () => {
    const theme = createSignal("light");
    const router = createRouter({
      url: "http://localhost/",
      interceptLinks: false,
      routes: [
        {
          path: "/",
          layouts: [() =>
            Promise.resolve({
              default: (props: { children: unknown }) =>
                jsx("div", {
                  "data-shell": "1",
                  // getter only — must not subscribe the root insert effect
                  className: () => (theme() === "dark" ? "dark" : "light"),
                  children: props.children,
                }),
            })],
          loading: () =>
            jsx("div", {
              className: "loading",
              children: [
                jsx("div", {
                  children: jsx("div", { className: "spin" }),
                }),
                jsx("p", { children: "loading" }),
              ],
            }),
          component: () =>
            Promise.resolve({
              default: () => {
                const kids = [];
                for (let i = 0; i < 24; i++) {
                  kids.push(jsx("section", {
                    className: () => "card",
                    children: String(i),
                  }));
                }
                return jsx("main", { children: kids });
              },
            }),
        },
      ],
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    let dispose = () => {};
    createRootTracked((d) => {
      dispose = d;
      insert(container, () => router.render());
    });

    const root = getTrackedRoots()[0]!;
    const loadingNodes = countOwners(inspectOwner(root));
    // Mirrors dogfood: effect subtree 5, total owners = root + that subtree.
    expect(loadingNodes).toBeLessThanOrEqual(9);
    expect(detectOwnerRemountChurn(root)).toBeNull();

    await new Promise((r) => setTimeout(r, 20));

    const pageNodes = countOwners(inspectOwner(root));
    expect(pageNodes).toBeGreaterThanOrEqual(loadingNodes * 4);
    const hit = detectOwnerRemountChurn(root);
    expect(hit).toBeNull();

    const shell = container.querySelector("[data-shell]") as HTMLElement;
    expect(shell).not.toBeNull();
    expect(shell.className).toBe("light");
    const shellBefore = shell;

    theme.value = "dark";
    flushPendingSync();
    // Theme read lives in the class getter, so the outlet effect stays mounted.
    expect(detectOwnerRemountChurn(root)).toBeNull();
    expect(container.querySelector("[data-shell]")).toBe(shellBefore);
    expect(shellBefore.className).toBe("dark");

    dispose();
    router.destroy();
  });

  it("noteComponentSetup + detectComponentRerun flags second setup (bare fetch risk)", () => {
    expect(noteComponentSetup("Page")).toBe(1);
    expect(detectComponentRerun("Page")).toBeNull();

    expect(noteComponentSetup("Page")).toBe(2);
    const hit = detectComponentRerun("Page", {
      emit: true,
      onWarn: (w) => warned.push({ kind: w.kind, message: w.message }),
    });
    expect(hit?.kind).toBe("component-rerun");
    expect(hit?.setups).toBe(2);
    expect(hit?.message).toMatch(/bare fetch/i);
    expect(warned.some((w) => w.kind === "component-rerun")).toBe(true);

    // detectOversubscribe can include setupKeys
    const combined = detectOversubscribe(null, { setupKeys: ["Page"] });
    expect(combined.some((w) => w.kind === "component-rerun")).toBe(true);
  });

  it("wide-subscription message mentions bare fetch / focus", () => {
    createRoot((dispose) => {
      const sigs = Array.from({ length: 10 }, () => createSignal(0));
      createEffect(() => {
        for (const s of sigs) s();
      });
      const hits = detectWideSubscriptions(getOwner(), { maxUpstream: 8 });
      expect(hits[0]!.message).toMatch(/bare fetch/i);
      expect(hits[0]!.message).toMatch(/focus/i);
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
    clearComponentSetupNotes();
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
