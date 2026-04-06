import { beforeEach, describe, expect, it } from "@dreamer/test";
import {
  catchError,
  createEffect,
  createRoot,
  createSignal,
  onError,
} from "@dreamer/view";
import { resetRegistry } from "../dom-setup.ts";

describe("reactivity/error-handling", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("Effect 异常捕获：Effect 内部抛错时不应中断其他响应式任务", async () => {
    const [count, setCount] = createSignal(0);
    let normalEffectTriggered = 0;
    let errorEffectTriggered = 0;
    let errorCaught = false;

    // 正常的 Effect
    createEffect(() => {
      count();
      normalEffectTriggered++;
    });

    // 会抛错的 Effect
    createEffect(() => {
      onError(() => {
        errorCaught = true;
      });

      count();
      errorEffectTriggered++;
      if (count() === 1) {
        throw new Error("Effect Error");
      }
    });

    expect(normalEffectTriggered).toBe(1);
    expect(errorEffectTriggered).toBe(1);

    // 触发更新
    setCount(1);
    await Promise.resolve();

    // 虽然第二个 Effect 抛错了，但第一个正常的 Effect 应该依然被执行
    expect(normalEffectTriggered).toBe(2);
    expect(errorEffectTriggered).toBe(2);
    expect(errorCaught).toBe(true);
  });

  it("onError & catchError：应当能捕获子作用域内的所有异常并停止冒泡", async () => {
    let capturedError: any = null;
    let rootCaptured = false;

    createRoot((dispose) => {
      // 1. 在根作用域注册处理器
      onError((err) => {
        rootCaptured = true;
      });

      // 2. 在子作用域注册处理器并捕获
      createRoot(() => {
        onError((err) => {
          capturedError = err;
        });

        // 手动触发错误抛出
        try {
          throw new Error("Target Error");
        } catch (e) {
          catchError(e);
        }
      });
    });

    expect(capturedError instanceof Error).toBe(true);
    expect(capturedError.message).toBe("Target Error");
    // 因为子作用域处理了，不应冒泡到根作用域
    expect(rootCaptured).toBe(false);
  });

  it("错误冒泡：如果没有局部处理器，错误应当向上冒泡", () => {
    let rootCapturedError: any = null;

    createRoot(() => {
      onError((err) => {
        rootCapturedError = err;
      });

      createRoot(() => {
        // 子作用域没有处理器，直接抛出
        try {
          throw "Bubble Up";
        } catch (e) {
          catchError(e);
        }
      });
    });

    expect(rootCapturedError).toBe("Bubble Up");
  });
}, { sanitizeOps: false, sanitizeResources: false });
