import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRoot, createSignal, insert, onError } from "@dreamer/view";

describe("runtime/insert", () => {
  it("静态插入：应当插入普通文本", () => {
    const parent = document.createElement("div");
    insert(parent, "Hello World");
    expect(parent.textContent).toBe("Hello World");
  });

  it("动态插入：应当随 Signal 更新 (异步测试)", async () => {
    const parent = document.createElement("div");
    const [count, setCount] = createSignal(0);

    // 注入锚点
    const marker = document.createTextNode("");
    parent.appendChild(marker);

    insert(parent, () => count(), marker);

    // 初始异步执行一次 flush
    await Promise.resolve();
    expect(marker.textContent).toBe("0");

    setCount(1);
    await Promise.resolve();
    expect(marker.textContent).toBe("1");
  });

  /**
   * 同步 Thunk 超过 insert 内 MAX_SYNC_THUNK_DEPTH 时由 insert 抛错；
   * createEffect 会 catch 并走 catchError，故用根 onError 断言。
   */
  it("同步 Thunk 链过深应产生可捕获错误", () => {
    const parent = document.createElement("div");
    const marker = document.createTextNode("");
    parent.appendChild(marker);

    /** 每层返回下一层 Thunk，共 depth 层后落到字符串 */
    function deepThunk(n: number): () => unknown {
      if (n <= 0) return () => "end";
      return () => deepThunk(n - 1);
    }

    let caught: unknown;
    createRoot((_dispose) => {
      onError((e) => {
        caught = e;
      });
      insert(parent, deepThunk(5000), marker);
    });

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/同步 Thunk 嵌套超过/);
  });
}, { sanitizeOps: false, sanitizeResources: false });
