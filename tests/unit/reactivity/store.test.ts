import { describe, expect, it } from "@dreamer/test";
import { createEffect, createStore } from "@dreamer/view";

describe("reactivity/store", () => {
  it("基础读写：应当监听属性变更 (单对象访问模式)", async () => {
    const store = createStore({ count: 0, name: "test" });
    let result = 0;

    createEffect(() => {
      result = store.count;
    });

    expect(result).toBe(0);
    store.count = 1; // 直接赋值
    await Promise.resolve();
    expect(result).toBe(1);

    store.setState({ count: 2 }); // setState 赋值
    await Promise.resolve();
    expect(result).toBe(2);
  });

  it("具名简写：首参为 store 名称、次参为初始状态（第三参 persist 可选）", async () => {
    /** 不传 persist，避免单测环境 IndexedDB 只读报错 */
    const store = createStore("store-test-named", { count: 0 });
    let n = -1;
    createEffect(() => {
      n = store.count;
    });
    expect(n).toBe(0);
    store.count = 5;
    await Promise.resolve();
    expect(n).toBe(5);
  });

  it("应当支持元组解构：首项为 getter () => 代理，与 createSignal 一致", async () => {
    const [get, setState] = createStore({ count: 10 });
    let result = 0;
    createEffect(() => result = get().count);

    expect(result).toBe(10);
    setState({ count: 20 });
    await Promise.resolve();
    expect(result).toBe(20);
  });

  it("嵌套监听：应当支持深层属性响应", async () => {
    const store = createStore({
      user: { profile: { name: "Alice" } },
    });

    let currentName = "";
    createEffect(() => {
      currentName = store.user.profile.name;
    });

    expect(currentName).toBe("Alice");
    store.user.profile.name = "Bob";
    await Promise.resolve();
    expect(currentName).toBe("Bob");
  });

  it("派生值：在 effect 中由字段组合即可追踪（替代 getters）", async () => {
    const store = createStore({
      firstName: "Shuliang",
      lastName: "Fu",
    });

    let result = "";
    createEffect(() => {
      result = `${store.firstName} ${store.lastName}`;
    });

    expect(result).toBe("Shuliang Fu");
    store.firstName = "Agent";
    await Promise.resolve();
    expect(result).toBe("Agent Fu");
  });

  it("直接赋值与 setState：替代 actions", () => {
    const store = createStore({ count: 0 });

    expect(store.count).toBe(0);
    store.count++;
    expect(store.count).toBe(1);
    store.setState({ count: 0 });
    expect(store.count).toBe(0);
  });

  it("模块内函数可组合修改同一 store（替代 actions 互调）", () => {
    const store = createStore({ count: 0 });

    function increment() {
      store.count++;
    }
    function incrementTwice() {
      increment();
      increment();
    }
    function stepIfEven() {
      if (store.count % 2 === 0) increment();
    }

    expect(store.count).toBe(0);
    incrementTwice();
    expect(store.count).toBe(2);
    stepIfEven();
    expect(store.count).toBe(3);
    stepIfEven();
    expect(store.count).toBe(3);
  });
});
