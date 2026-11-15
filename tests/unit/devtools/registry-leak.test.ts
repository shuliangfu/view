/**
 * DEV registry / remount leak coverage:
 * anonymous Signals are released with their Owner, remounts do not accumulate,
 * and named Signals stay in the registry.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import {
  installDevtoolsRuntimeHooks,
  isDevtoolsRuntimeHooksInstalled,
  snapshotRegistrySources,
  snapshotTimeline,
  uninstallDevtoolsRuntimeHooks,
} from "@dreamer/view/devtools";
import { createRoot, createSignal } from "@dreamer/view/reactivity";
import { core, getInternal } from "../../../src/reactivity/master.ts";
import { createStore } from "../../../src/reactivity/store.ts";
import { resetRegistry } from "../dom-setup.ts";

const g = globalThis as { VIEW_DEV?: boolean };

describe("devtools / registry leak", () => {
  let prevDev: boolean | undefined;

  beforeEach(() => {
    prevDev = g.VIEW_DEV;
    g.VIEW_DEV = true;
    resetRegistry();
  });

  afterEach(() => {
    uninstallDevtoolsRuntimeHooks();
    resetRegistry();
    if (prevDev === undefined) delete g.VIEW_DEV;
    else g.VIEW_DEV = prevDev;
  });

  it("VIEW_DEV：Owner dispose 后匿名 Signal 从 registry 快照中消失", () => {
    const before = snapshotRegistrySources().map((s) => s.id).sort();
    createRoot((dispose) => {
      createSignal(1);
      createSignal(2);
      const mid = snapshotRegistrySources().map((s) => s.id);
      expect(mid.length).toBe(before.length + 2);
      dispose();
    });
    const after = snapshotRegistrySources().map((s) => s.id).sort();
    expect(after).toEqual(before);
  });

  it("VIEW_DEV：多次 createRoot 重挂不会让匿名 registry 增长", () => {
    const baseline = snapshotRegistrySources().length;
    for (let i = 0; i < 8; i++) {
      createRoot((dispose) => {
        for (let n = 0; n < 20; n++) createSignal(n);
        dispose();
      });
    }
    expect(snapshotRegistrySources().length).toBe(baseline);
    expect(core.registry.size).toBe(baseline);
  });

  it("具名 Signal 在 Owner dispose 后仍留在 registry", () => {
    const name = `named-keep-${Date.now()}`;
    createRoot((dispose) => {
      createSignal(0, name);
      dispose();
    });
    expect(core.registry.has(`sig:${name}`)).toBe(true);
    const rows = snapshotRegistrySources();
    expect(rows.some((r) => r.id === `sig:${name}`)).toBe(true);
  });

  it("生产路径：匿名 createStore 不增长 storeRegistry", () => {
    g.VIEW_DEV = false;
    const storeReg = getInternal(
      "store",
      () => new Map(),
    ) as Map<string, unknown>;
    const sizeBefore = storeReg.size;
    for (let i = 0; i < 40; i++) {
      createStore({ n: i });
    }
    expect(storeReg.size).toBe(sizeBefore);
  });

  it("具名 createStore 仍写入 storeRegistry 并复用", () => {
    const storeReg = getInternal(
      "store",
      () => new Map(),
    ) as Map<string, unknown>;
    const name = `store-leak-named-${Date.now()}`;
    const sizeBefore = storeReg.size;
    const a = createStore(name, { n: 1 });
    const b = createStore(name, { n: 2 });
    expect(storeReg.size).toBe(sizeBefore + 1);
    expect(a.n).toBe(2);
    b.n = 3;
    expect(a.n).toBe(3);
  });

  it("install hooks do not keep anonymous Signals after Owner dispose", () => {
    installDevtoolsRuntimeHooks();
    expect(isDevtoolsRuntimeHooksInstalled()).toBe(true);
    const baseline = snapshotRegistrySources().length;
    createRoot((dispose) => {
      const s = createSignal(0, { debugName: "tmp" });
      s(1);
      expect(snapshotTimeline().events.length).toBe(1);
      dispose();
    });
    expect(snapshotRegistrySources().length).toBe(baseline);
    uninstallDevtoolsRuntimeHooks();
    expect(isDevtoolsRuntimeHooksInstalled()).toBe(false);
    expect(snapshotTimeline().events.length).toBe(0);
  });
});
