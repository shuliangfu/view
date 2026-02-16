/**
 * @fileoverview 调度器单元测试：schedule、unschedule，微任务批处理
 */

import { describe, expect, it } from "@dreamer/test";
import { schedule, unschedule } from "../../src/scheduler.ts";

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
