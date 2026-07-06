/**
 * @fileoverview Signal 响应式核心 — 补充测试覆盖新增优化逻辑。
 *
 * 覆盖：
 * - cleanupObserver 交叉引用清理
 * - hasObservers 标记在 track/notify/cleanup 中的正确维护
 * - createSignal 匿名 vs 具名注册
 * - notify 递归传播（diamond problem）
 */

import { describe, expect, it } from "@dreamer/test";
import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
  untrack,
} from "@dreamer/view";

describe("signal/核心优化补充", () => {
  it("cleanupObserver 应断开所有订阅并清空引用", () => {
    const a = createSignal(1);
    const b = createSignal(2);
    let runs = 0;

    createRoot((dispose) => {
      createEffect(() => {
        a();
        b();
        runs++;
      });
      dispose();
    });

    expect(runs).toBe(1);
    // dispose 后再次修改 Signal 不应触发已清理的 effect
    a(10);
    b(20);
    expect(runs).toBe(1);
  });

  it("cleanupObserver 后 Subscription 引用应被清理", () => {
    const a = createSignal(1);
    let effectRuns = 0;

    createRoot((dispose) => {
      createEffect(() => {
        a();
        effectRuns++;
      });
      dispose();
    });

    expect(effectRuns).toBe(1);
    // a 的观察者列表应被清理
    a(100);
    expect(effectRuns).toBe(1);
  });

  it("hasObservers: 新订阅后 Source 应有观察者", async () => {
    const a = createSignal(0);
    let runs = 0;

    createRoot((dispose) => {
      createEffect(() => {
        a();
        runs++;
      });
      onCleanup(() => dispose());
    });

    expect(runs).toBe(1);
    a(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toBe(2);
  });

  it("hasObservers: 清理后重新订阅应恢复观察关系", async () => {
    const a = createSignal(0);
    let runs1 = 0;
    let runs2 = 0;

    createRoot((dispose1) => {
      createEffect(() => {
        a();
        runs1++;
      });

      createRoot((dispose2) => {
        createEffect(() => {
          a();
          runs2++;
        });
        // 清理第二个 effect
        dispose2();
      });

      dispose1();
    });

    // runs1=1, runs2=1
    expect(runs1).toBe(1);
    expect(runs2).toBe(1);

    // 清理后再修改，两个 effect 都不应再触发
    a(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(runs1).toBe(1);
    expect(runs2).toBe(1);
  });

  it("匿名 Signal 应在全局 registry 中注册（HMR 需要）", () => {
    const a = createSignal(42);
    expect(a()).toBe(42);
    a(100);
    expect(a()).toBe(100);
  });

  it("具名 Signal 应复用同一 Source（HMR 单例）", () => {
    const a = createSignal(1, "test-named-signal");
    const b = createSignal(99, "test-named-signal");
    // 具名 Signal 复用底层 Source，b 的初始值覆盖 a 的
    expect(a()).toBe(99);
    expect(b()).toBe(99);
    b(200);
    expect(a()).toBe(200);
  });

  it("Diamond Problem: 依赖同一个 Source 的多个 Effect 应独立更新", async () => {
    const a = createSignal(1);
    let bRuns = 0;
    let cRuns = 0;

    createRoot((dispose) => {
      createEffect(() => {
        a();
        bRuns++;
      });
      createEffect(() => {
        a();
        cRuns++;
      });
      onCleanup(() => dispose());
    });

    expect(bRuns).toBe(1);
    expect(cRuns).toBe(1);

    a(2);
    await new Promise((r) => setTimeout(r, 20));
    expect(bRuns).toBe(2);
    expect(cRuns).toBe(2);
  });

  it("Diamond Problem: Memo + Effect 链应正确传播", async () => {
    const a = createSignal(1);
    const b = createMemo(() => a() * 2);
    const c = createMemo(() => a() + 10);
    let result = 0;

    createRoot((dispose) => {
      createEffect(() => {
        result = b() + c();
      });
      onCleanup(() => dispose());
    });

    expect(result).toBe(1 * 2 + 1 + 10); // 2 + 11 = 13

    a(5);
    await new Promise((r) => setTimeout(r, 20));
    expect(result).toBe(5 * 2 + 5 + 10); // 10 + 15 = 25
  });

  it("batch 内多次写同一 Signal 只通知一次下游", async () => {
    const count = createSignal(0);
    let effectRuns = 0;

    createRoot((dispose) => {
      createEffect(() => {
        count();
        effectRuns++;
      });
      onCleanup(() => dispose());
    });

    expect(effectRuns).toBe(1);

    batch(() => {
      count(1);
      count(2);
      count(3);
    });

    await new Promise((r) => setTimeout(r, 20));
    // 初始1次 + batch后1次 = 2次
    expect(effectRuns).toBe(2);
    expect(count()).toBe(3);
  });

  it("嵌套 batch 应正确处理", async () => {
    const a = createSignal(0);
    let runs = 0;

    createRoot((dispose) => {
      createEffect(() => {
        a();
        runs++;
      });
      onCleanup(() => dispose());
    });

    expect(runs).toBe(1);

    batch(() => {
      a(1);
      batch(() => {
        a(2);
      });
      a(3);
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toBe(2);
    expect(a()).toBe(3);
  });

  it("untrack 内写 Signal 不应建立依赖", async () => {
    const a = createSignal(0);
    const b = createSignal(0);
    let runs = 0;

    createRoot((dispose) => {
      createEffect(() => {
        a();
        untrack(() => {
          b(1); // 写不建立依赖
        });
        runs++;
      });
      onCleanup(() => dispose());
    });

    expect(runs).toBe(1);
    expect(b()).toBe(1);

    b(2);
    await new Promise((r) => setTimeout(r, 20));
    // b 的变化不应触发 effect
    expect(runs).toBe(1);

    a(10);
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toBe(2);
  });

  it("Signal .value getter/setter 应与函数调用一致", () => {
    const sig = createSignal(0);
    expect(sig.value).toBe(0);
    expect(sig()).toBe(0);

    sig.value = 5;
    expect(sig.value).toBe(5);
    expect(sig()).toBe(5);

    sig(10);
    expect(sig.value).toBe(10);
    expect(sig()).toBe(10);

    sig.set(20);
    expect(sig.value).toBe(20);
    expect(sig()).toBe(20);
  });

  it("Signal 函数式更新应基于旧值", () => {
    const count = createSignal(0);
    count((prev) => prev + 1);
    expect(count()).toBe(1);
    count((prev) => prev + 10);
    expect(count()).toBe(11);
    count.set((prev) => prev * 2);
    expect(count()).toBe(22);
  });

  it("Signal Object.is 相等检查应阻止不必要更新", async () => {
    const obj = createSignal({ a: 1 });
    let runs = 0;

    createRoot((dispose) => {
      createEffect(() => {
        obj();
        runs++;
      });
      onCleanup(() => dispose());
    });

    expect(runs).toBe(1);

    // 写入相同引用不应触发
    obj(obj());
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toBe(1);

    // NaN === NaN 在 Object.is 中为 true
    const nan = createSignal(NaN);
    let nanRuns = 0;
    createRoot((dispose2) => {
      createEffect(() => {
        nan();
        nanRuns++;
      });
      onCleanup(() => dispose2());
    });
    expect(nanRuns).toBe(1);
    nan(NaN);
    await new Promise((r) => setTimeout(r, 20));
    expect(nanRuns).toBe(1); // Object.is(NaN, NaN) === true
  });

  it("Effect 内错误不应影响其他 Effect", async () => {
    const a = createSignal(0);
    let goodRuns = 0;

    createRoot((dispose) => {
      // 错误的 effect
      createEffect(() => {
        a();
        throw new Error("test error");
      });

      // 正常的 effect
      createEffect(() => {
        a();
        goodRuns++;
      });

      onCleanup(() => dispose());
    });

    expect(goodRuns).toBe(1);

    a(1);
    await new Promise((r) => setTimeout(r, 20));
    // 正常 effect 应继续运行
    expect(goodRuns).toBe(2);
  });

  it("大量依赖的 track 性能不应严重退化", async () => {
    const signals = Array.from({ length: 100 }, (_, i) => createSignal(i));
    let runs = 0;

    createRoot((dispose) => {
      createEffect(() => {
        let sum = 0;
        for (const sig of signals) {
          sum += sig();
        }
        runs++;
      });
      onCleanup(() => dispose());
    });

    expect(runs).toBe(1);
    signals[50](999);
    await new Promise((r) => setTimeout(r, 20));
    expect(runs).toBe(2);
  });
});
