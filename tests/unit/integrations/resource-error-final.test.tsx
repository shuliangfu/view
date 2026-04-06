import { describe, expect, it } from "@dreamer/test";
import { waitUntilComplete } from "../dom-setup.ts";
import {
  batch,
  createResource,
  createSignal,
  ErrorBoundary,
  mount,
  Suspense,
} from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("integrations/resource (error handling)", () => {
  it("基础错误捕获验证 (同步)", async () => {
    const [s, setS] = createSignal(false);
    let errorCaught = false;

    const fallback = (err: any) => {
      errorCaught = true;
      return jsx("div", { children: `Error: ${err.message}` });
    };

    const container = document.createElement("div");
    mount(
      () =>
        jsx(ErrorBoundary, {
          fallback,
          children: jsx("div", {
            id: "sync-trigger",
            children: () => {
              if (s()) throw new Error("Sync Error");
              return "Normal";
            },
          }),
        }),
      container,
    );

    expect(container.textContent).toBe("Normal");
    expect(errorCaught).toBe(false);

    // 触发错误
    batch(() => {
      setS(true);
    });

    // 关键：等待框架内部的微任务（Effect 和 Batch）执行完毕
    await waitUntilComplete();

    expect(errorCaught).toBe(true);
    expect(container.textContent).toBe("Error: Sync Error");
  });

  it("应当在资源访问时抛出错误并由 ErrorBoundary 捕获 (异步)", async () => {
    const [id, setId] = createSignal(1);
    let errorCaught = false;

    const fetcher = async (k: number) => {
      await new Promise((r) => setTimeout(r, 10));
      if (k === 2) throw new Error("Async Resource Error");
      return `Data ${k}`;
    };

    const data = createResource(() => id(), fetcher);

    const fallback = (err: any) => {
      errorCaught = true;
      return jsx("div", { children: `Error: ${err.message}` });
    };

    const container = document.createElement("div");
    mount(
      () =>
        jsx(ErrorBoundary, {
          fallback,
          children: jsx("div", {
            id: "async-trigger",
            children: () => {
              if (data.error()) throw data.error();
              if (data.loading()) return "Loading...";
              return data();
            },
          }),
        }),
      container,
    );

    expect(container.textContent).toBe("Loading...");

    // 增加等待时间，确保资源加载完成
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 20));
    await waitUntilComplete();

    expect(container.textContent).toBe("Data 1");

    // 触发错误
    batch(() => {
      setId(2);
    });

    // 增加等待时间以确保异步资源错误被捕获
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 50));
    await waitUntilComplete();

    expect(errorCaught).toBe(true);
    expect(container.textContent).toBe("Error: Async Resource Error");
  });

  it("应当能重置错误状态", async () => {
    const [s, setS] = createSignal(false);
    let resetFn: any;

    const fallback = (err: any, reset: () => void) => {
      resetFn = reset;
      return jsx("div", { children: `Error: ${err.message}` });
    };

    const container = document.createElement("div");
    mount(
      () =>
        jsx(ErrorBoundary, {
          fallback,
          children: jsx("div", {
            children: () => {
              if (s()) throw new Error("Sync Error");
              return "Normal";
            },
          }),
        }),
      container,
    );

    batch(() => setS(true));
    await waitUntilComplete();
    expect(container.textContent).toBe("Error: Sync Error");

    // 重置
    batch(() => {
      setS(false);
      resetFn();
    });
    await waitUntilComplete();
    expect(container.textContent).toBe("Normal");
  });

  it("resetKeys 变化时应在错误态下自动清除并重新挂载子树", async () => {
    const [id, setId] = createSignal(1);

    const fetcher = async (k: number) => {
      await new Promise((r) => setTimeout(r, 10));
      if (k === 2) throw new Error("bad-id-2");
      return `ok-${k}`;
    };

    const data = createResource(() => id(), fetcher);

    const container = document.createElement("div");
    mount(
      () =>
        jsx(ErrorBoundary, {
          resetKeys: () => [id()],
          fallback: (err: any) =>
            jsx("div", { id: "eb-fallback", children: String(err.message) }),
          children: jsx("div", {
            children: () => {
              if (data.error()) throw data.error();
              if (data.loading()) return "...";
              return data();
            },
          }),
        }),
      container,
    );

    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 30));
    await waitUntilComplete();
    expect(container.textContent).toContain("ok-1");

    batch(() => setId(2));
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 50));
    await waitUntilComplete();
    expect(container.querySelector("#eb-fallback")).not.toBeNull();

    batch(() => setId(1));
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 50));
    await waitUntilComplete();
    expect(container.textContent).toContain("ok-1");
    expect(container.querySelector("#eb-fallback")).toBeNull();
  });

  it("ErrorBoundary 恢复后新 Suspense 应再次收到 resource.loading（中间应出现 Suspense fallback）", async () => {
    const [id, setId] = createSignal(1);

    const fetcher = async (k: number) => {
      await new Promise((r) => setTimeout(r, 500)); // 延迟 500ms，配合框架修复后的自动注册
      if (k === 2) throw new Error("bad-2");
      return `result-val-${k}`;
    };

    const data = createResource(() => id(), fetcher);

    const container = document.createElement("div");
    mount(
      () =>
        jsx(ErrorBoundary, {
          resetKeys: () => [id()],
          fallback: () =>
            jsx("div", { id: "eb-after-susp", children: "EB-ERR" }),
          children: () =>
            jsx(Suspense, {
              fallback: () =>
                jsx("div", { id: "susp-fb", children: "SUSP-LOADING" }),
              children: () =>
                jsx("div", {
                  children: () => {
                    if (data.error()) throw data.error();
                    if (data.loading()) return null;
                    const v = data();
                    return v ?? null;
                  },
                }),
            }),
        }),
      container,
    );

    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 600)); // 等待 fetcher (500ms) 完成
    await waitUntilComplete();
    expect(container.textContent).toContain("result-val-1");

    batch(() => setId(2));
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 600)); // 等待 fetcher 完成并抛错
    await waitUntilComplete();
    expect(container.textContent).toContain("EB-ERR");

    batch(() => setId(1));
    // 在 Bun 下，微任务调度较快，我们需要等待 Suspense fallback 真正渲染出来。
    // 注意：不能在此处 await waitUntilComplete()，因为它会等待所有异步任务（包括 fetcher）完成。
    // 我们轮询 100 次，每次 5ms，总计 500ms，只要看到 SUSP-LOADING 就立刻停止
    for (let i = 0; i < 100; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 5));
      if (container.textContent?.includes("SUSP-LOADING")) break;
    }
    expect(container.textContent).toContain("SUSP-LOADING");

    await new Promise((r) => setTimeout(r, 600)); // 等待 fetcher 完成
    await waitUntilComplete();
    expect(container.textContent).toContain("result-val-1");
    expect(container.querySelector("#susp-fb")).toBeNull();
  });
}, { sanitizeOps: false, sanitizeResources: false });
