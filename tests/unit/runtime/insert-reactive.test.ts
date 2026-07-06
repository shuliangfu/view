/**
 * @fileoverview 插入+响应式集成测试 — 验证 insert + createEffect + Signal 在真实 DOM 中的交互不会导致循环。
 *
 * 重点复现：
 * - Table 组件 render 函数中读 Signal → 建立依赖 → Signal 变化 → 重渲染
 * - Select 组件 commitMaybeSignal + onChange 回调模式
 * - 异步 fetch 数据后写 Signal → insert 更新 DOM → 不循环
 *
 * 注意：insert 的响应式更新通过"函数值"（Signal thunk）实现；
 * 直接在 effect 外多次调用 insert 同一 parent 会导致追加而非替换。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  batch,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
  onMount,
} from "@dreamer/view";
import { insert } from "../../../src/runtime/insert.ts";

describe("insert + 响应式集成", () => {
  it(
    "insert 函数值（Signal thunk）应在 Signal 变化时正确更新 DOM",
    async () => {
      const container = document.createElement("div");
      const count = createSignal(0);
      let renderCount = 0;

      const dispose = createRoot((d) => {
        insert(container, () => {
          renderCount++;
          return `Count: ${count()}`;
        });
        return d;
      });

      expect(renderCount).toBe(1);
      expect(container.textContent).toBe("Count: 0");

      count(5);
      await new Promise((r) => setTimeout(r, 50));

      expect(renderCount).toBe(2);
      expect(container.textContent).toBe("Count: 5");

      dispose();
    },
    { sanitizeOps: false, sanitizeResources: false },
  );

  it("insert 函数值读多个 Signal，batch 同时变应只触发一次更新", async () => {
    const container = document.createElement("div");
    const a = createSignal("hello");
    const b = createSignal("world");
    let renderCount = 0;

    createRoot((dispose) => {
      insert(container, () => {
        renderCount++;
        return `${a()} ${b()}`;
      });
      onCleanup(() => dispose());
    });

    expect(renderCount).toBe(1);
    expect(container.textContent).toBe("hello world");

    batch(() => {
      a("foo");
      b("bar");
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(renderCount).toBe(2);
    expect(container.textContent).toBe("foo bar");
  });

  it("异步 fetch 模式：Signal 写回 → insert 更新 → 不循环", async () => {
    const container = document.createElement("div");
    const items = createSignal<string[]>([]);
    const loading = createSignal(true);

    const doFetch = async () => {
      loading.value = true;
      await new Promise((r) => setTimeout(r, 10));
      items.value = ["a", "b", "c"];
      loading.value = false;
    };

    createRoot((dispose) => {
      onMount(() => {
        void doFetch();
      });

      insert(container, () => {
        return loading.value ? "Loading..." : items.value.join(", ");
      });

      onCleanup(() => dispose());
    });

    expect(container.textContent).toBe("Loading...");

    await new Promise((r) => setTimeout(r, 100));

    expect(container.textContent).toBe("a, b, c");
  });

  it("Select onChange 模式：commitMaybeSignal + 额外刷新，不应循环触发", async () => {
    const env = createSignal("testnet");
    let refreshCount = 0;

    // 模拟 commitMaybeSignal
    const commitValue = (newVal: string) => {
      if (env.value !== newVal) {
        env.value = newVal;
      }
    };

    // 模拟用户 onChange：先 commitValue，再调 refresh
    const handleChange = (newVal: string) => {
      commitValue(newVal);
      refreshCount++;
    };

    createRoot((dispose) => {
      createEffect(() => {
        env(); // 订阅 env 变化
      });
      onCleanup(() => dispose());
    });

    handleChange("mainnet");
    await new Promise((r) => setTimeout(r, 50));

    expect(env.value).toBe("mainnet");
    expect(refreshCount).toBe(1);
  });

  it("Table render 模式：render 函数读 actionBusy Signal，外部写 actionBusy 不应循环", async () => {
    const actionBusy = createSignal<string | null>(null);
    const rows = createSignal([
      { id: "1", name: "Row 1" },
      { id: "2", name: "Row 2" },
    ]);
    let renderCount = 0;

    createRoot((dispose) => {
      createEffect(() => {
        const busy = actionBusy.value;
        const data = rows.value;
        renderCount++;
        void busy;
        void data;
      });
      onCleanup(() => dispose());
    });

    expect(renderCount).toBe(1);

    actionBusy.value = "start:1";
    await new Promise((r) => setTimeout(r, 20));
    expect(renderCount).toBe(2);

    actionBusy.value = null;
    await new Promise((r) => setTimeout(r, 20));
    expect(renderCount).toBe(3);

    expect(renderCount).toBeLessThan(10);
  });

  it("listLoading + strategies 双 Signal 连续写不循环", async () => {
    const listLoading = createSignal(true);
    const strategies = createSignal<string[]>([]);
    let renderCount = 0;

    createRoot((dispose) => {
      createEffect(() => {
        const loading = listLoading.value;
        const data = strategies.value;
        renderCount++;
        void loading;
        void data;
      });
      onCleanup(() => dispose());
    });

    expect(renderCount).toBe(1);

    listLoading.value = false;
    strategies.value = ["s1", "s2"];
    await new Promise((r) => setTimeout(r, 50));

    expect(renderCount).toBeLessThan(10);
  });

  it("async fetch 模式（quant strategies 页面场景）：onMount → fetch → 写 strategies + listLoading，DOM 不循环", async () => {
    const container = document.createElement("div");
    const strategies = createSignal<string[]>([]);
    const listLoading = createSignal(true);
    const env = createSignal("testnet");

    const doFetch = async (e: string) => {
      listLoading.value = true;
      await new Promise((r) => setTimeout(r, 10));
      strategies.value = [`${e}-s1`, `${e}-s2`];
      listLoading.value = false;
    };

    let fetchCount = 0;

    createRoot((dispose) => {
      onMount(() => {
        fetchCount++;
        void doFetch(env.value);
      });

      // 模拟 JSX 渲染闭包
      insert(container, () => {
        const l = listLoading.value;
        const d = strategies.value;
        return l ? "Loading..." : d.join(", ");
      });

      onCleanup(() => dispose());
    });

    expect(container.textContent).toBe("Loading...");

    await new Promise((r) => setTimeout(r, 200));

    expect(fetchCount).toBe(1); // 只 fetch 1 次
    expect(container.textContent).toBe("testnet-s1, testnet-s2");

    // 切换环境（模拟 Select onChange）
    env.value = "mainnet";
    void doFetch("mainnet");
    await new Promise((r) => setTimeout(r, 200));

    expect(fetchCount).toBeLessThan(5); // 不应循环调用
    expect(container.textContent).toBe("mainnet-s1, mainnet-s2");
  });
});
