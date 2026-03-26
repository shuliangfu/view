/**
 * @fileoverview 调度器单元测试：schedule、unschedule，微任务批处理
 */

import { describe, expect, it } from "@dreamer/test";
import {
  KEY_SCHEDULER,
  KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH,
  KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
} from "../../src/constants.ts";
import { createEffect } from "../../src/effect.ts";
import { getGlobal, setGlobal } from "../../src/globals.ts";
import {
  batch,
  flushScheduler,
  schedule,
  unschedule,
} from "../../src/scheduler.ts";
import { createSignal } from "../../src/signal.ts";

describe("schedule", () => {
  it("应将任务加入队列并在微任务中执行", async () => {
    let ran = false;
    schedule(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    await Promise.resolve();
    expect(ran).toBe(true);
  });

  it("同一 tick 内多次 schedule 应批量在微任务中执行", async () => {
    const order: number[] = [];
    schedule(() => order.push(1));
    schedule(() => order.push(2));
    schedule(() => order.push(3));
    expect(order).toEqual([]);
    await Promise.resolve();
    expect(order).toEqual([1, 2, 3]);
  });

  /**
   * 若 globalThis.__VIEW_SCHEDULER 被写成不完整对象，旧实现会直接复用，flush 时 queueCopy 为 undefined
   * 会抛 TypeError: Cannot read properties of undefined (reading 'length')。
   */
  it("global 上调度器键被污染时应自动重置并仍能 flush", async () => {
    const prev = (globalThis as Record<string, unknown>)[KEY_SCHEDULER];
    try {
      (globalThis as Record<string, unknown>)[KEY_SCHEDULER] = {};
      let ran = false;
      schedule(() => {
        ran = true;
      });
      await Promise.resolve();
      expect(ran).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>)[KEY_SCHEDULER] = prev;
    }
  });

  /**
   * 须显式 `setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, true)` 才推迟；避免误设 composition 深度导致微任务无法收敛。
   */
  it("composition 深度大于 0 且 DEFER 为严格 true 时推迟 flush，深度归零后执行", async () => {
    const prevDepth = getGlobal<number>(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH);
    const prevDefer = getGlobal<boolean>(
      KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
    );
    try {
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, 1);
      setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, true);
      let runs = 0;
      schedule(() => {
        runs++;
      });
      await Promise.resolve();
      expect(runs).toBe(0);
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, 0);
      await Promise.resolve();
      expect(runs).toBe(1);
    } finally {
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, prevDepth ?? 0);
      setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, prevDefer);
    }
  });

  it("composition 深度大于 0 但未开启 DEFER 时立即 flush", async () => {
    const prevDepth = getGlobal<number>(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH);
    const prevDefer = getGlobal<boolean>(
      KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
    );
    try {
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, 1);
      setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, undefined);
      let runs = 0;
      schedule(() => {
        runs++;
      });
      await Promise.resolve();
      expect(runs).toBe(1);
    } finally {
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, prevDepth ?? 0);
      setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, prevDefer);
    }
  });
});

describe("flushScheduler（同步排空主队列）", () => {
  /** 与 `await Promise.resolve()` 等价结果，但不依赖微任务时序。 */
  it("应同步执行已入队的 schedule，无需 await", () => {
    let ran = false;
    schedule(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    flushScheduler();
    expect(ran).toBe(true);
  });

  /** 某 run 内再次 schedule 的项须在同一轮 flushScheduler 内被拖完。 */
  it("应处理链式 schedule（嵌套入队）", () => {
    const order: number[] = [];
    schedule(() => {
      order.push(1);
      schedule(() => order.push(2));
    });
    flushScheduler();
    expect(order).toEqual([1, 2]);
  });

  /**
   * `batch` 执行期间任务在推迟表，主队列空；须退出 batch 后再 `flushScheduler` 或等微任务。
   */
  it("batch 块内调用时不应执行推迟中的任务", () => {
    let ran = false;
    batch(() => {
      schedule(() => {
        ran = true;
      });
      flushScheduler();
      expect(ran).toBe(false);
    });
    flushScheduler();
    expect(ran).toBe(true);
  });

  /** 直调 `flushQueue`，绕过 `runFlushQueueOrDeferWhileComposing` 的组字推迟。 */
  it("DEFER_FLUSH + composition 深度>0 时仍同步执行（与微任务路径不同）", () => {
    const prevDepth = getGlobal<number>(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH);
    const prevDefer = getGlobal<boolean>(
      KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
    );
    try {
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, 1);
      setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, true);
      let runs = 0;
      schedule(() => {
        runs++;
      });
      flushScheduler();
      expect(runs).toBe(1);
    } finally {
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, prevDepth ?? 0);
      setGlobal(KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING, prevDefer);
    }
  });

  /**
   * 超过 `maxIterations` 且队列仍非空时抛错；用独立 global 状态避免污染其它用例。
   */
  it("maxIterations 过小时若仍自调度应抛错", () => {
    const prev = (globalThis as Record<string, unknown>)[KEY_SCHEDULER];
    try {
      (globalThis as Record<string, unknown>)[KEY_SCHEDULER] = {};
      const self = (): void => {
        schedule(self);
      };
      schedule(self);
      expect(() => flushScheduler(20)).toThrow("maxIterations");
    } finally {
      (globalThis as Record<string, unknown>)[KEY_SCHEDULER] = prev;
    }
  });
});

describe("batch（推迟 schedule 至块结束）", () => {
  it("batch 内 schedule 在退出 batch 前不应执行", async () => {
    let ran = false;
    batch(() => {
      schedule(() => {
        ran = true;
      });
      expect(ran).toBe(false);
    });
    expect(ran).toBe(false);
    await Promise.resolve();
    expect(ran).toBe(true);
  });

  it("嵌套 batch 仅在最外层结束时 flush 推迟任务", async () => {
    const order: string[] = [];
    batch(() => {
      schedule(() => order.push("outer1"));
      batch(() => {
        schedule(() => order.push("inner"));
      });
      expect(order).toEqual([]);
      schedule(() => order.push("outer2"));
    });
    expect(order).toEqual([]);
    await Promise.resolve();
    expect(order).toEqual(["outer1", "inner", "outer2"]);
  });

  it("batch 内 unschedule 可取消尚未 flush 的推迟任务", async () => {
    let bad = false;
    let good = false;
    const runBad = () => {
      bad = true;
    };
    batch(() => {
      schedule(runBad);
      schedule(() => {
        good = true;
      });
      unschedule(runBad);
    });
    await Promise.resolve();
    expect(bad).toBe(false);
    expect(good).toBe(true);
  });

  it("batch 内多次 signal 写入，订阅的 effect 仅在块结束后 flush 一次", async () => {
    const a = createSignal(0);
    let runs = 0;
    createEffect(() => {
      runs++;
      void a.value;
    });
    expect(runs).toBe(1);
    batch(() => {
      a.value = 1;
      expect(runs).toBe(1);
      a.value = 2;
      expect(runs).toBe(1);
    });
    expect(runs).toBe(1);
    await Promise.resolve();
    expect(runs).toBe(2);
    expect(a.value).toBe(2);
  });
});

describe("unschedule", () => {
  it("在 flush 前 unschedule 后该任务不应执行", async () => {
    let ran = false;
    const run = () => {
      ran = true;
    };
    schedule(run);
    unschedule(run);
    await Promise.resolve();
    expect(ran).toBe(false);
  });

  it("unschedule 只移除指定任务，其他任务仍执行", async () => {
    const order: number[] = [];
    const run2 = () => order.push(2);
    schedule(() => order.push(1));
    schedule(run2);
    schedule(() => order.push(3));
    unschedule(run2);
    await Promise.resolve();
    expect(order).toEqual([1, 3]);
  });
});
