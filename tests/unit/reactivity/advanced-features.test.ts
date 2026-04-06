import { describe, expect, it } from "@dreamer/test";
import {
  createDeferred,
  createEffect,
  createRoot,
  createSignal,
  useTransition,
} from "@dreamer/view";

describe("reactivity/advanced-features", () => {
  it("createRoot: 应当支持显式销毁所有内部 Effect", async () => {
    let count = 0;
    let stop: () => void;

    const [s, setS] = createSignal(1);

    createRoot((dispose) => {
      stop = dispose;
      createEffect(() => {
        s();
        count++;
      });
    });

    expect(count).toBe(1);
    setS(2);
    await Promise.resolve();
    expect(count).toBe(2);

    // 销毁根
    stop!();
    setS(3);
    await Promise.resolve();
    await Promise.resolve();
    expect(count).toBe(2); // 不再增加
  });

  it("createDeferred: 应当在微任务中延迟更新", async () => {
    const [s, setS] = createSignal(1);
    const deferred = createDeferred(s);

    expect(deferred()).toBe(1);

    setS(2);
    expect(deferred()).toBe(1); // 同步读取仍为旧值

    await Promise.resolve();
    await Promise.resolve(); // 等待微任务
    expect(deferred()).toBe(2);
  });

  it("useTransition: 应当追踪异步状态并批量更新", async () => {
    const [isPending, start] = useTransition();
    const [s, setS] = createSignal(1);

    expect(isPending()).toBe(false);

    let resolvePromise: (v: void) => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const p = start(async () => {
      setS(2);
      await promise;
    });

    expect(isPending()).toBe(true);
    expect(s()).toBe(2);

    resolvePromise!();
    await p;
    expect(isPending()).toBe(false);
  });
}, { sanitizeOps: false, sanitizeResources: false });
