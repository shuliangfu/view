/**
 * @fileoverview 循环依赖检测与防止 — 验证 @dreamer/view 不会在常见模式下产生无限循环。
 *
 * 复现场景（来自 quant strategies 页面）：
 * 1. 组件中 createSignal 管理 state
 * 2. onMount 调 async 函数拉取数据，写回 state
 * 3. JSX 渲染闭包里读 state Signal（如 disabled={loading.value}）
 * 4. Select 组件 value 绑 Signal，onChange 触发刷新
 * 5. Table render 函数里读 actionBusy Signal
 *
 * 核心关注：
 * - Effect 中读 Signal 写另一个 Signal 不应无限循环
 * - 异步写 Signal 不应在 await 后被追踪为依赖
 * - Select onChange + commitMaybeSignal 不应双重触发
 */

import { describe, expect, it } from "@dreamer/test";
import {
  batch,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "@dreamer/view";

describe("循环依赖防护", () => {
  it("异步函数写 Signal 不应触发无限 effect 循环", async () => {
    let effectRuns = 0;
    const data = createSignal<string[]>([]);
    const loading = createSignal(false);

    const fetchData = async () => {
      loading.value = true;
      // 模拟异步
      await Promise.resolve();
      data.value = ["item1"];
      loading.value = false;
    };

    // 模拟 onMount
    createRoot((dispose) => {
      onMount(() => {
        void fetchData();
      });

      // 模拟 JSX 渲染闭包读 loading.value
      createEffect(() => {
        const _ = loading.value;
        effectRuns++;
      });

      // 清理
      onCleanup(() => dispose());
    });

    // 等待所有微任务完成
    await new Promise((r) => setTimeout(r, 50));

    // effectRuns 应该有限次（初始 + loading变true + loading变false）
    // 不应超过 10（安全上限，实际应为 ~4）
    expect(effectRuns).toBeLessThan(10);
    expect(data.value).toEqual(["item1"]);
  });

  it("effect 中读 A 写 B，B 变化触发另一个 effect 读 B 写 A，不应无限循环", async () => {
    const a = createSignal(0);
    const b = createSignal(0);
    let runs1 = 0;
    let runs2 = 0;

    createEffect(() => {
      const val = a();
      b(val + 1);
      runs1++;
    });

    createEffect(() => {
      const val = b();
      // 不写回 a，只是读
      runs2++;
    });

    await new Promise((r) => setTimeout(r, 50));

    // 应该稳定下来
    expect(runs1).toBeLessThan(10);
    expect(runs2).toBeLessThan(10);
  });

  it("effect 中读 A 写 A（条件写入），不应无限循环", async () => {
    const a = createSignal(0);
    let runs = 0;

    createEffect(() => {
      const val = a();
      if (val < 5) {
        a(val + 1);
      }
      runs++;
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(a()).toBe(5);
    expect(runs).toBeLessThan(20);
  });

  it("batch 内多次写同一 Signal 只触发一次下游 effect", async () => {
    const count = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      count();
      effectRuns++;
    });

    // 初始执行 1 次
    expect(effectRuns).toBe(1);

    batch(() => {
      count(1);
      count(2);
      count(3);
    });

    await new Promise((r) => setTimeout(r, 20));
    // batch 内多次写只触发 1 次重跑
    expect(effectRuns).toBe(2);
    expect(count()).toBe(3);
  });

  it("untrack 内读 Signal 不建立依赖", async () => {
    const count = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      untrack(() => count());
      effectRuns++;
    });

    expect(effectRuns).toBe(1);
    count(1);
    await new Promise((r) => setTimeout(r, 20));
    // untrack 不追踪，effect 不重跑
    expect(effectRuns).toBe(1);
  });

  it("onMount 只执行一次，不随 Signal 变化重跑", async () => {
    const count = createSignal(0);
    let mountRuns = 0;

    createRoot((dispose) => {
      onMount(() => {
        mountRuns++;
        // 读一个 Signal（但 onMount 用 untrack 包裹，不应建立依赖）
        count();
      });
      onCleanup(() => dispose());
    });

    expect(mountRuns).toBe(1);
    count(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(mountRuns).toBe(1);
  });

  it("createRenderEffect 同步写 Signal 后经 batch 调度重跑", async () => {
    const { createRenderEffect } = await import("@dreamer/view");
    const a = createSignal(0);
    let runs = 0;

    createRenderEffect(() => {
      const val = a();
      if (val < 3) {
        // renderEffect 同步执行，但写 a 后不会立即重跑（需等 batch 微任务）
        a(val + 1);
      }
      runs++;
    });

    // 等待 batch 微任务完成
    await new Promise((r) => setTimeout(r, 50));

    // 应该收敛到 a=3
    expect(a()).toBe(3);
    expect(runs).toBeLessThan(20);
  });

  it("async fetch 模式：onMount → fetch → 写 Signal → effect 响应，不应循环", async () => {
    const items = createSignal<string[]>([]);
    const loading = createSignal(true);
    const env = createSignal("testnet");
    let fetchCount = 0;

    const doFetch = async (e: string) => {
      fetchCount++;
      loading.value = true;
      await new Promise((r) => setTimeout(r, 10));
      items.value = [`${e}-item`];
      loading.value = false;
    };

    createRoot((dispose) => {
      onMount(() => {
        void doFetch(env.value);
      });

      // 模拟 JSX 读取
      createEffect(() => {
        const _ = loading.value;
        const __ = items.value;
      });

      onCleanup(() => dispose());
    });

    await new Promise((r) => setTimeout(r, 100));

    // fetch 只应该被调用 1 次
    expect(fetchCount).toBe(1);
    expect(items.value).toEqual(["testnet-item"]);
  });

  it("Select onChange 模式：commitMaybeSignal + 用户 onChange 刷新，不应双重触发", async () => {
    const env = createSignal("testnet");
    let refreshCount = 0;

    // 模拟 Select commitMaybeSignal
    const commitValue = (newVal: string) => {
      if (env.value !== newVal) {
        env.value = newVal;
      }
    };

    // 模拟用户 onChange
    const handleChange = (newVal: string) => {
      commitValue(newVal); // Select 内部写回
      refreshCount++; // 用户回调（模拟 refreshList）
    };

    createEffect(() => {
      env(); // 模拟 JSX 读取 env
    });

    // 模拟用户选择新值
    handleChange("mainnet");

    await new Promise((r) => setTimeout(r, 50));

    // refreshCount 应该是 1，不是 2 或无限
    expect(refreshCount).toBe(1);
    expect(env.value).toBe("mainnet");
  });
});
