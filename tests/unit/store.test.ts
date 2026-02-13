/**
 * @fileoverview Store 单元测试：createStore、get/set、actions、getters
 */

import { describe, expect, it } from "@dreamer/test";
import { createStore, withActions } from "@dreamer/view/store";

describe("createStore", () => {
  it("仅 state 时应返回 [get, set]", () => {
    const [get, set] = createStore("t1", {
      state: { count: 0 },
      asObject: false,
    });
    expect(typeof get).toBe("function");
    expect(typeof set).toBe("function");
    expect(get().count).toBe(0);
  });

  it("边界：空 state {} 时 get() 返回空对象，set 可更新", () => {
    const [get, set] = createStore<Record<string, number>>("t2", {
      state: {},
      asObject: false,
    });
    expect(get()).toEqual({});
    set({ ...get(), x: 1 });
    expect(get().x).toBe(1);
  });

  it("get() 返回的对象读写应响应式", async () => {
    const [get, set] = createStore("t3", {
      state: { count: 0, name: "a" },
      asObject: false,
    });
    let runs = 0;
    const { createEffect } = await import("@dreamer/view");
    createEffect(() => {
      get().count;
      runs++;
    });
    expect(runs).toBe(1);
    set({ ...get(), count: 1 });
    await Promise.resolve();
    expect(runs).toBe(2);
    expect(get().count).toBe(1);
  });

  it("set 接受 updater 函数", () => {
    const [get, set] = createStore("t4", {
      state: { count: 0 },
      asObject: false,
    });
    set((prev) => ({ ...prev, count: prev.count + 1 }));
    expect(get().count).toBe(1);
  });

  it("嵌套属性可读写", () => {
    const [get, set] = createStore("t5", {
      state: { a: { b: 1 } },
      asObject: false,
    });
    expect(get().a.b).toBe(1);
    set({ ...get(), a: { ...get().a, b: 2 } });
    expect(get().a.b).toBe(2);
  });

  it("默认 asObject 为 true 时返回对象，可直接读 state 属性", () => {
    const store = createStore("t6", { state: { count: 0, name: "a" } });
    expect(store.count).toBe(0);
    expect(store.name).toBe("a");
    store.setState({ count: 1, name: "a" });
    expect(store.count).toBe(1);
  });

  it("默认返回对象支持直接赋值 store.xxx = value 更新 state", () => {
    const store = createStore("t7", { state: { count: 0, name: "a" } });
    expect(store.count).toBe(0);
    store.count = 1;
    expect(store.count).toBe(1);
    store.name = "b";
    expect(store.name).toBe("b");
  });
});

/** 测试用 actions 类型，供 withActions 推断 this */
type CountActions = {
  increment(): void;
  reset(): void;
  addTwo(): void;
};

describe("createStore with actions", () => {
  it("config.actions 应返回第三项为 actions 对象", () => {
    const [get, set, actions] = createStore("t-actions", {
      state: { count: 0 },
      actions: withActions<{ count: number }, CountActions>()({
        increment() {
          this.count = this.count + 1;
        },
        reset() {
          this.count = 0;
        },
        addTwo() {
          this.increment();
          this.increment();
        },
      }),
      asObject: false,
    });
    expect(actions).toBeDefined();
    expect(typeof (actions as { increment?: () => void }).increment).toBe(
      "function",
    );
    (actions as { increment: () => void }).increment();
    expect(get().count).toBe(1);
    (actions as { increment: () => void }).increment();
    expect(get().count).toBe(2);
    (actions as { reset: () => void }).reset();
    expect(get().count).toBe(0);
    (actions as { addTwo: () => void }).addTwo();
    expect(get().count).toBe(2);
  });
});

describe("createStore with persist", () => {
  it("persist 使用自定义 storage 时 set 后应调用 setItem 且可从未持久化恢复", () => {
    const stored: Record<string, string> = {};
    const storage = {
      getItem(key: string) {
        return stored[key] ?? null;
      },
      setItem(key: string, value: string) {
        stored[key] = value;
      },
    };
    const [get, set] = createStore("t-persist", {
      state: { count: 0 },
      persist: { key: "test-store", storage },
      asObject: false,
    });
    expect(get().count).toBe(0);
    set({ ...get(), count: 5 });
    expect(stored["test-store"]).toBeDefined();
    expect(JSON.parse(stored["test-store"]).count).toBe(5);
    const [get2] = createStore("t-persist", {
      state: { count: 0 },
      persist: { key: "test-store", storage },
      asObject: false,
    });
    expect(get2().count).toBe(5);
  });

  it("边界：persist.key 为空字符串时视为 falsy，不进行持久化读写", () => {
    const stored: Record<string, string> = {};
    const storage = {
      getItem(key: string) {
        return stored[key] ?? null;
      },
      setItem(key: string, value: string) {
        stored[key] = value;
      },
    };
    const [get, set] = createStore("t-persist-empty", {
      state: { x: 0 },
      persist: { key: "", storage },
      asObject: false,
    });
    set({ ...get(), x: 1 });
    // key 为空字符串时 persist?.key 为 falsy，不会调用 setItem
    expect(get().x).toBe(1);
  });
});

describe("createStore with getters", () => {
  it("config.getters 应返回派生只读值且随 state 更新", async () => {
    const [get, set, getters] = createStore("t-getters", {
      state: { count: 1, name: "x" },
      getters: {
        double() {
          return this.count * 2;
        },
        greeting() {
          return `Hi, ${this.name}`;
        },
      },
      asObject: false,
    });
    expect(getters).toBeDefined();
    expect((getters as { double: () => number }).double()).toBe(2);
    expect((getters as { greeting: () => string }).greeting()).toBe("Hi, x");
    set({ ...get(), count: 3 });
    await Promise.resolve();
    expect((getters as { double: () => number }).double()).toBe(6);
  });

  it("边界：getters 返回 undefined 时调用返回 undefined", () => {
    const [, , getters] = createStore("t-getters-undefined", {
      state: { count: 0 },
      getters: {
        maybeUndefined() {
          return undefined;
        },
      },
      asObject: false,
    });
    expect((getters as { maybeUndefined: () => undefined }).maybeUndefined())
      .toBeUndefined();
  });

  it("边界：actions 内抛错时调用方收到异常", () => {
    const [, , actions] = createStore("t-actions-throw", {
      state: { count: 0 },
      actions: {
        throwAction() {
          throw new Error("action error");
        },
      },
      asObject: false,
    });
    expect(() => (actions as { throwAction: () => void }).throwAction())
      .toThrow("action error");
  });
});
