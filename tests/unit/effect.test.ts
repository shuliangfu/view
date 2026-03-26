/**
 * @fileoverview Effect 单元测试：createEffect、createRenderEffect、createMemo、children、createDeferred、createReaction、catchError、`on`、onCleanup、调度与清理
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  batch,
  catchError,
  children,
  createDeferred,
  createEffect,
  createMemo,
  createReaction,
  createRenderEffect,
  createRoot,
  createScopeWithDisposers,
  createSignal,
  getCurrentScope,
  getOwner,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  runWithScope,
  setOwner,
} from "@dreamer/view";

describe("runWithScope / EffectScope", () => {
  /**
   * 与 `runWithOwner` 一致：子段内 `createEffect` 的 dispose 登记到传入的 scope，`runDisposers` 后不再随 signal 更新。
   */
  it("runWithScope 内 createEffect 的 dispose 归入自定义 scope", async () => {
    const manual = createScopeWithDisposers();
    const s = createSignal(0);
    let runs = 0;
    runWithScope(manual, () => {
      createEffect(() => {
        void s.value;
        runs++;
      });
    });
    expect(runs).toBe(1);
    s.value = 1;
    await Promise.resolve();
    expect(runs).toBe(2);
    manual.runDisposers();
    s.value = 2;
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  /** 嵌套 `runWithScope` 须在退出内层后恢复外层，避免子插件污染宿主 scope。 */
  it("runWithScope 嵌套后恢复外层 getCurrentScope", () => {
    const inner = createScopeWithDisposers();
    const outer = createScopeWithDisposers();
    runWithScope(outer, () => {
      expect(getCurrentScope()).toBe(outer);
      runWithScope(inner, () => {
        expect(getCurrentScope()).toBe(inner);
      });
      expect(getCurrentScope()).toBe(outer);
    });
    expect(getCurrentScope()).toBe(null);
  });

  /** 内层 `fn` 抛错时 `finally` 仍须恢复外层 scope，否则后续 effect 会挂错树。 */
  it("runWithScope：内层抛错后外层 scope 仍有效", () => {
    const outer = createScopeWithDisposers();
    runWithScope(outer, () => {
      expect(() =>
        runWithScope(createScopeWithDisposers(), () => {
          throw new Error("boom");
        })
      ).toThrow("boom");
      expect(getCurrentScope()).toBe(outer);
    });
  });

  /**
   * `getOwner` / `setOwner` / `runWithOwner` 分别为 `getCurrentScope` / `setCurrentScope` / `runWithScope` 的别名。
   */
  it("Owner API 别名 getOwner、setOwner、runWithOwner 与 Scope API 行为一致", () => {
    const o = createScopeWithDisposers();
    runWithOwner(o, () => {
      expect(getOwner()).toBe(o);
      expect(getCurrentScope()).toBe(o);
    });
    expect(getOwner()).toBe(null);
    setOwner(o);
    expect(getOwner()).toBe(o);
    expect(getCurrentScope()).toBe(o);
    setOwner(null);
    expect(getOwner()).toBe(null);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("on（显式依赖）", () => {
  /**
   * 等价于 `createEffect(() => { const v = s.value; untrack(() => { t.value; }); })`：
   * 只有 `s` 触发重跑，`fn` 内读 `t` 不订阅。
   */
  it("仅 dep accessor 订阅，fn 内读其它 signal 不触发 effect", async () => {
    const s = createSignal(0);
    const t = createSignal(0);
    let runs = 0;
    createEffect(
      on(
        () => s.value,
        () => {
          void t.value;
          runs++;
        },
      ),
    );
    expect(runs).toBe(1);
    t.value = 1;
    await Promise.resolve();
    expect(runs).toBe(1);
    s.value = 1;
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  /** `defer: true` 时首轮只建立依赖，首次 `fn` 在依赖随后变化时执行。 */
  it("options.defer 为 true 时跳过首次 fn", async () => {
    const s = createSignal(0);
    let inner = 0;
    createEffect(
      on(
        () => s.value,
        () => {
          inner++;
        },
        { defer: true },
      ),
    );
    expect(inner).toBe(0);
    s.value = 1;
    await Promise.resolve();
    expect(inner).toBe(1);
  });

  /** 多 accessor 时每一项参与依赖收集，任一变化即重跑。 */
  it("deps 为数组时合并订阅", async () => {
    const a = createSignal(0);
    const b = createSignal(0);
    let runs = 0;
    createEffect(
      on([() => a.value, () => b.value], () => {
        runs++;
      }),
    );
    expect(runs).toBe(1);
    b.value = 1;
    await Promise.resolve();
    expect(runs).toBe(2);
    a.value = 1;
    await Promise.resolve();
    expect(runs).toBe(3);
  });

  /**
   * `on` 返回的函数若返回 dispose，须交给外层 `createEffect` 作为清理（与直接写 effect 体一致）。
   */
  it("fn 返回清理函数时在 dep 变更前执行", async () => {
    const s = createSignal(0);
    let cleaned = 0;
    createEffect(
      on(
        () => s.value,
        () => {
          return () => {
            cleaned++;
          };
        },
      ),
    );
    expect(cleaned).toBe(0);
    s.value = 1;
    await Promise.resolve();
    expect(cleaned).toBe(1);
  });

  /** `createMemo` 接收 `on(...)` 时，仅 dep 驱动 memo 重算。 */
  it("可与 createMemo 组合", async () => {
    const s = createSignal(1);
    const t = createSignal(10);
    const m = createMemo(
      on(
        () => s.value,
        (n) => n * 2 + t.value,
      ),
    );
    expect(m()).toBe(12);
    t.value = 0;
    await Promise.resolve();
    expect(m()).toBe(12);
    s.value = 2;
    await Promise.resolve();
    expect(m()).toBe(4);
  });
});

describe("createReaction（同类方案 次级原语）", () => {
  /**
   * 同类方案：`track` 武装后，依赖**下一次**变更时 `onInvalidate` 只跑一次；再变须重新 `track`。
   */
  it("track 后依赖第一次变更触发 onInvalidate，再次变更不触发", async () => {
    const s = createSignal("a");
    let inv = 0;
    const track = createReaction(() => {
      inv++;
    });
    track(() => {
      void s.value;
    });
    expect(inv).toBe(0);
    s.value = "b";
    await Promise.resolve();
    expect(inv).toBe(1);
    s.value = "c";
    await Promise.resolve();
    expect(inv).toBe(1);
  });

  /** 再次 `track` 会建立新的「一次性」监听。 */
  it("再次 track 可重新武装", async () => {
    const s = createSignal(0);
    let inv = 0;
    const track = createReaction(() => {
      inv++;
    });
    track(() => void s.value);
    s.value = 1;
    await Promise.resolve();
    expect(inv).toBe(1);
    track(() => void s.value);
    s.value = 2;
    await Promise.resolve();
    expect(inv).toBe(2);
  });

  /** 连续两次 `track` 会 dispose 上一轮尚未触发的武装，仅最后一轮生效。 */
  it("新 track 会取消尚未触发的上一轮武装", async () => {
    const s = createSignal(0);
    let inv = 0;
    const track = createReaction(() => {
      inv++;
    });
    track(() => void s.value);
    track(() => void s.value);
    s.value = 1;
    await Promise.resolve();
    expect(inv).toBe(1);
  });

  /** 与 `batch` 一致：块内多次写入合并为一次 effect 波次，`onInvalidate` 仍只一次。 */
  it("batch 内多次写入仅触发一次 onInvalidate", async () => {
    const s = createSignal(0);
    let inv = 0;
    const track = createReaction(() => {
      inv++;
    });
    track(() => void s.value);
    batch(() => {
      s.value = 1;
      s.value = 2;
    });
    await Promise.resolve();
    expect(inv).toBe(1);
  });
});

describe("createRenderEffect（）", () => {
  /**
   * 与同类方案 一致：依赖更新在同一同步栈内重跑，不等待微任务。
   */
  it("signal 写入后同步重跑，不待 Promise.resolve", () => {
    const s = createSignal(0);
    let runs = 0;
    createRenderEffect(() => {
      void s.value;
      runs++;
    });
    expect(runs).toBe(1);
    s.value = 1;
    expect(runs).toBe(2);
  });

  /** 对照：`createEffect` 仍推迟到微任务。 */
  it("同场景下 createEffect 在写入当拍不增 runs", async () => {
    const s = createSignal(0);
    let runs = 0;
    createEffect(() => {
      void s.value;
      runs++;
    });
    expect(runs).toBe(1);
    s.value = 1;
    expect(runs).toBe(1);
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  /**
   * `batch` 内写入不中途 flush render；最外层结束后先同步排空 render，再并入普通队列。
   */
  it("batch 末先同步跑 render effect，再微任务跑 createEffect", async () => {
    const s = createSignal(0);
    const order: string[] = [];
    createRenderEffect(() => {
      void s.value;
      order.push("R");
    });
    createEffect(() => {
      void s.value;
      order.push("E");
    });
    order.length = 0;
    batch(() => {
      s.value = 1;
      s.value = 2;
      expect(order).toEqual([]);
    });
    expect(order).toEqual(["R"]);
    await Promise.resolve();
    expect(order).toEqual(["R", "E"]);
  });

  /** dispose 后不再同步执行。 */
  it("dispose 后 signal 写不再触发 run", () => {
    const s = createSignal(0);
    let runs = 0;
    const d = createRenderEffect(() => {
      void s.value;
      runs++;
    });
    d();
    s.value = 1;
    expect(runs).toBe(1);
  });
});

describe("catchError（）", () => {
  /**
   * 无宿主 scope 时无法挂子 effect 的 dispose，仅对 `tryFn` 同步抛错走 `onError`（与同类方案 无双亲 Owner 时一致）。
   */
  it("无 currentScope 时捕获 tryFn 同步抛错", () => {
    let called = false;
    catchError(() => {
      throw new Error("x");
    }, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  /** `createEffect` 的 `run` 在微任务中抛错时，应命中 `catchError` 的 `onError`。 */
  it("createRoot 内 catchError 包住 createEffect：异步 run 抛错触发 onError", async () => {
    const errs: unknown[] = [];
    const s = createSignal(0);
    const el = document.createElement("div");
    createRoot((_container) => {
      catchError(() => {
        createEffect(() => {
          if (s.value > 0) throw new Error("boom");
        });
      }, (e) => errs.push(e));
    }, el);
    s.value = 1;
    await Promise.resolve();
    expect(errs.length).toBe(1);
    expect((errs[0] as Error).message).toBe("boom");
  });

  /** 内层 `onError` 再 `throw` 时交给外层 `catchError`（同类方案 传播语义）。 */
  it("嵌套 catchError：内层 onError 再抛则外层收到新错误", () => {
    const outer: unknown[] = [];
    const inner: unknown[] = [];
    const el = document.createElement("div");
    createRoot((_container) => {
      catchError(() => {
        catchError(() => {
          throw new Error("a");
        }, (e) => {
          inner.push(e);
          throw new Error("b");
        });
      }, (e) => outer.push(e));
    }, el);
    expect(inner.length).toBe(1);
    expect(outer.length).toBe(1);
    expect((outer[0] as Error).message).toBe("b");
  });
});

describe("onMount（）", () => {
  /**
   * 与同类方案 一致：同步 effect 体先跑完，再在微任务里跑 mount；顺序可测。
   */
  it("同步段结束后微任务执行 fn", async () => {
    const order: string[] = [];
    createEffect(() => {
      order.push("sync");
      onMount(() => {
        order.push("mount");
      });
    });
    expect(order).toEqual(["sync"]);
    await Promise.resolve();
    expect(order).toEqual(["sync", "mount"]);
  });

  /** dispose 在微任务前执行时，待执行的 mount 应取消。 */
  it("dispose 早于微任务则 fn 不执行", async () => {
    let mounted = false;
    const dispose = createEffect(() => {
      onMount(() => {
        mounted = true;
      });
    });
    dispose();
    await Promise.resolve();
    expect(mounted).toBe(false);
  });

  /** `fn` 返回的清理在 effect 重跑前调用；重跑会再次 onMount。 */
  it("返回的清理在依赖重跑前执行且可再次 mount", async () => {
    const s = createSignal(0);
    let mountRuns = 0;
    let cleanRuns = 0;
    createEffect(() => {
      void s.value;
      onMount(() => {
        mountRuns++;
        return () => {
          cleanRuns++;
        };
      });
    });
    await Promise.resolve();
    expect(mountRuns).toBe(1);
    expect(cleanRuns).toBe(0);
    s.value = 1;
    await Promise.resolve();
    expect(cleanRuns).toBe(1);
    await Promise.resolve();
    expect(mountRuns).toBe(2);
  });

  /** mount 回调内读 signal 不订阅外层 effect（同类方案 untrack 语义）。 */
  it("onMount 内读 signal 不触发外层 effect 重跑", async () => {
    const s = createSignal(0);
    let effectRuns = 0;
    createEffect(() => {
      effectRuns++;
      onMount(() => {
        void s.value;
      });
    });
    expect(effectRuns).toBe(1);
    await Promise.resolve();
    expect(effectRuns).toBe(1);
    s.value = 1;
    await Promise.resolve();
    expect(effectRuns).toBe(1);
  });

  /** onMount 内 onCleanup 仍挂到当前 effect（依赖 untrackReads 而非整段 untrack）。 */
  it("onMount 内 onCleanup 在 effect 重跑时执行", async () => {
    const s = createSignal(0);
    let innerClean = 0;
    createEffect(() => {
      void s.value;
      onMount(() => {
        onCleanup(() => {
          innerClean++;
        });
      });
    });
    await Promise.resolve();
    expect(innerClean).toBe(0);
    s.value = 1;
    await Promise.resolve();
    expect(innerClean).toBe(1);
  });
});

describe("createEffect", () => {
  it("传入非函数时调用会抛错", () => {
    expect(() => createEffect(1 as unknown as () => void)).toThrow();
    expect(() => createEffect(null as unknown as () => void)).toThrow();
  });

  it("应立即执行一次", () => {
    let runs = 0;
    createEffect(() => {
      runs++;
    });
    expect(runs).toBe(1);
  });

  it("执行过程中读到的 signal 变更后应再次执行（微任务后）", async () => {
    const s = createSignal(0);
    let runs = 0;
    createEffect(() => {
      void s.value;
      runs++;
    });
    expect(runs).toBe(1);
    s.value = 1;
    await Promise.resolve(); // 等待微任务
    expect(runs).toBe(2);
    s.value = 2;
    await Promise.resolve();
    expect(runs).toBe(3);
  });

  it("返回的 dispose 调用后应不再执行", async () => {
    const s = createSignal(0);
    let runs = 0;
    const dispose = createEffect(() => {
      void s.value;
      runs++;
    });
    expect(runs).toBe(1);
    dispose();
    s.value = 1;
    await Promise.resolve();
    expect(runs).toBe(1);
  });

  it("effect 返回清理函数时应在下次运行前或 dispose 时调用", async () => {
    const s = createSignal(0);
    let cleaned = 0;
    createEffect(() => {
      void s.value;
      return () => {
        cleaned++;
      };
    });
    expect(cleaned).toBe(0);
    s.value = 1;
    await Promise.resolve();
    expect(cleaned).toBe(1);
  });

  it("onCleanup 在 effect 内登记的函数应在下次运行前执行", async () => {
    const s = createSignal(0);
    let cleaned = 0;
    createEffect(() => {
      void s.value;
      onCleanup(() => {
        cleaned++;
      });
    });
    expect(cleaned).toBe(0);
    s.value = 1;
    await Promise.resolve();
    expect(cleaned).toBe(1);
  });

  it("边界：effect 回调抛错时错误向上抛出，且不拖垮此前已运行的 effect", () => {
    const s = createSignal(0);
    let otherRuns = 0;
    // 先创建并运行一个 effect，确认其已执行
    createEffect(() => {
      void s.value;
      otherRuns++;
    });
    expect(otherRuns).toBe(1);
    // 再创建会抛错的 effect，错误应从 createEffect 向上抛出
    expect(() => {
      createEffect(() => {
        void s.value;
        throw new Error("effect throw");
      });
    }).toThrow("effect throw");
    // 抛错后，此前已运行的 effect 的副作用（otherRuns）未被拖垮，仍为 1
    expect(otherRuns).toBe(1);
  });
});

describe("createMemo", () => {
  it("传入非函数时调用会抛错", () => {
    expect(() => createMemo(1 as unknown as () => number)).toThrow();
    expect(() => createMemo(null as unknown as () => number)).toThrow();
  });

  it("应返回 getter，内部 effect 运行后首次调用返回计算值", () => {
    let computed = 0;
    const a = createSignal(1);
    const getMemo = createMemo(() => {
      computed++;
      return a.value * 2;
    });
    // createMemo 内部 createEffect 会立即执行一次，故 computed 已为 1
    expect(getMemo()).toBe(2);
    expect(computed).toBe(1);
  });

  it("依赖的 signal 未变时再次调用应返回缓存值", () => {
    let computed = 0;
    const a = createSignal(1);
    const getMemo = createMemo(() => {
      computed++;
      return a.value * 2;
    });
    getMemo();
    getMemo();
    expect(computed).toBe(1);
  });

  it("依赖的 signal 变更后再次调用应重新计算", async () => {
    const a = createSignal(1);
    const getMemo = createMemo(() => a.value * 2);
    expect(getMemo()).toBe(2);
    a.value = 2;
    await Promise.resolve(); // 等待 memo 的 effect 调度
    expect(getMemo()).toBe(4);
  });

  it("在 effect 中读取 memo 时，memo 依赖变化应触发 effect", async () => {
    const a = createSignal(1);
    const getMemo = createMemo(() => a.value + 10);
    let effectRuns = 0;
    let lastValue: number | undefined;
    createEffect(() => {
      lastValue = getMemo();
      effectRuns++;
    });
    expect(effectRuns).toBe(1);
    expect(lastValue).toBe(11);
    a.value = 2;
    // 需两次微任务：先执行 memo 内部 effect 更新 memo 信号，再执行本 effect（依赖 memo 信号）
    await Promise.resolve();
    await Promise.resolve();
    expect(effectRuns).toBe(2);
    expect(lastValue).toBe(12);
  });

  it("边界：createMemo 返回 undefined 时 getter() 为 undefined，下游不抛", () => {
    const getMemo = createMemo((): number | undefined => undefined);
    expect(getMemo()).toBeUndefined();
  });

  it("边界：createMemo 返回 null 时 getter() 为 null", () => {
    const getMemo = createMemo((): string | null => null);
    expect(getMemo()).toBeNull();
  });

  /**
   * `SignalRef` 的 `.value = x` 在 `typeof x === "function"` 时会走 updater 语义；memo 须用 raw 写入，
   * 否则缓存「函数 / markMountFn」会被误调用而变成 `undefined`（如 `Show` 组件）。
   */
  it("边界：createMemo 的 fn 返回普通函数时应原样作为缓存值", () => {
    const fn = (x: number) => x + 1;
    const getMemo = createMemo(() => fn);
    expect(getMemo()).toBe(fn);
  });

  it("options.equals 为 true 时不写缓存、不通知依赖 memo 的 effect（）", async () => {
    type Row = { id: number; name: string };
    const sel = createSignal(1);
    const rows: Record<number, Row> = {
      1: { id: 1, name: "a" },
      2: { id: 2, name: "a" },
    };
    const getRow = createMemo(
      () => rows[sel.value]!,
      undefined,
      {
        equals: (prev, next) => prev.name === next.name,
      },
    );
    let effectRuns = 0;
    createEffect(() => {
      void getRow();
      effectRuns++;
    });
    expect(effectRuns).toBe(1);
    sel.value = 2;
    await Promise.resolve();
    await Promise.resolve();
    expect(effectRuns).toBe(1);
  });

  it("options.equals 为自定义函数且判定不等时仍更新并通知下游", async () => {
    const n = createSignal(1);
    const getMemo = createMemo(
      () => ({ x: n.value }),
      undefined,
      { equals: (a, b) => a.x === b.x },
    );
    let runs = 0;
    createEffect(() => {
      void getMemo();
      runs++;
    });
    expect(runs).toBe(1);
    n.value = 2;
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  /**
   * 同类方案：`createMemo(fn, undefined, { equals: false })` 在依赖更新时始终推送订阅者，
   * 即使 `fn()` 返回值与缓存 `Object.is` 为真（底层 signal 普通赋值会跳过调度）。
   */
  it("options.equals 字面量 false：fn 结果与缓存 Object.is 相同仍通知下游", async () => {
    const tick = createSignal(0);
    const stable = { x: 1 };
    const getMemo = createMemo(
      () => {
        void tick.value;
        return stable;
      },
      undefined,
      { equals: false },
    );
    let runs = 0;
    createEffect(() => {
      void getMemo();
      runs++;
    });
    expect(runs).toBe(1);
    tick.value = 1;
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  /**
   * 对照：默认 memo 在依赖更新但 `fn()` 仍返回同一引用时，与普通 signal 一致不重复调度下游。
   */
  it("无 equals 时 fn 返回同一引用则 tick 变更不重复触发依赖 memo 的 effect", async () => {
    const tick = createSignal(0);
    const stable = { x: 1 };
    const getMemo = createMemo(() => {
      void tick.value;
      return stable;
    });
    let runs = 0;
    createEffect(() => {
      void getMemo();
      runs++;
    });
    expect(runs).toBe(1);
    tick.value = 1;
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(1);
  });
});

describe("children（）", () => {
  /**
   * `children(fn)` 即对 `fn` 做 memo：仅在 `fn` 内依赖变更后重算。
   */
  it("与 createMemo 相同：依赖变更多次才重跑子 getter", async () => {
    const s = createSignal(0);
    let childRuns = 0;
    const getChild = children(() => {
      childRuns++;
      return s.value;
    });
    expect(getChild()).toBe(0);
    expect(childRuns).toBe(1);
    s.value = 1;
    await Promise.resolve();
    expect(getChild()).toBe(1);
    expect(childRuns).toBe(2);
  });
});

describe("createDeferred（）", () => {
  /**
   * 先排空一轮微任务（让 `createDeferred` 内层 `createEffect` 在依赖变更后跑完），
   * 再等 `requestAnimationFrame`；无 rAF 时用 `queueMicrotask` 回退，与实现一致。
   */
  async function waitDeferredCommitted(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(() => resolve());
      } else if (typeof globalThis.queueMicrotask === "function") {
        globalThis.queueMicrotask(() => resolve());
      } else {
        void Promise.resolve().then(() => resolve());
      }
    });
  }

  it("无 initialValue 时首读为 undefined，推迟提交后与 source 一致", async () => {
    let getD: () => number | undefined;
    const el = document.createElement("div");
    createRoot((_container) => {
      const s = createSignal(1);
      getD = createDeferred(() => s.value);
      expect(getD()).toBeUndefined();
    }, el);
    await waitDeferredCommitted();
    expect(getD!()).toBe(1);
  });

  it("initialValue 在首次提交前作为返回值", async () => {
    let getD: () => number;
    const el = document.createElement("div");
    createRoot((_container) => {
      const s = createSignal(99);
      getD = createDeferred(() => s.value, { initialValue: 0 });
      expect(getD()).toBe(0);
    }, el);
    await waitDeferredCommitted();
    expect(getD!()).toBe(99);
  });

  it("source 更新后 deferred 仍保持旧值直至 effect 微任务与下一推迟周期", async () => {
    let getD: () => number | undefined;
    let setS: (n: number) => void;
    const el = document.createElement("div");
    createRoot((_container) => {
      const s = createSignal(1);
      setS = (n) => {
        s.value = n;
      };
      getD = createDeferred(() => s.value);
    }, el);
    await waitDeferredCommitted();
    expect(getD!()).toBe(1);
    setS!(2);
    expect(getD!()).toBe(1);
    await Promise.resolve();
    expect(getD!()).toBe(1);
    await waitDeferredCommitted();
    expect(getD!()).toBe(2);
  });

  it("options.equals 判定相等时跳过推迟写入（保留同一对象引用）", async () => {
    let getD: () => { x: number };
    const n = createSignal(1);
    const el = document.createElement("div");
    createRoot((_container) => {
      getD = createDeferred(() => ({ x: n.value % 2 }), {
        equals: (a, b) => a.x === b.x,
      });
    }, el);
    await waitDeferredCommitted();
    const ref1 = getD!();
    expect(ref1.x).toBe(1);
    n.value = 3;
    await Promise.resolve();
    await waitDeferredCommitted();
    expect(getD!().x).toBe(1);
    expect(getD!()).toBe(ref1);
  });
});
