import { describe, expect, it } from "@dreamer/test";
import {
  createEffect,
  createSignal,
  createStore,
  produce,
  reconcile,
} from "@dreamer/view";

describe("reactivity/store (edge cases)", () => {
  it("NaN 稳定性：连续设置 NaN 不应触发更新", async () => {
    const [count, setCount] = createSignal(NaN);
    let triggerCount = 0;

    createEffect(() => {
      count();
      triggerCount++;
    });

    expect(triggerCount).toBe(1);

    setCount(NaN);
    await Promise.resolve();
    // 因为 Object.is(NaN, NaN) 为 true，不应触发更新
    expect(triggerCount).toBe(1);

    setCount(100);
    await Promise.resolve();
    expect(triggerCount).toBe(2);
  });

  it("属性删除：delete state.prop 应当触发订阅者", async () => {
    const [getState, setState] = createStore<any>({ a: 1, b: 2 });
    let triggerCount = 0;
    let lastA: any = undefined;

    createEffect(() => {
      lastA = getState().a;
      triggerCount++;
    });

    expect(triggerCount).toBe(1);
    expect(lastA).toBe(1);

    // 删除属性
    delete getState().a;
    await Promise.resolve();

    expect(triggerCount).toBe(2);
    expect(lastA).toBe(undefined);
    expect("a" in getState()).toBe(false);
  });

  it("循环引用：Store 应当能安全持有循环引用对象", async () => {
    const [getState, setState] = createStore<any>({ name: "root" });

    const obj: any = { type: "circular" };
    obj.self = obj; // 建立循环引用

    setState("data", obj);

    expect(getState().data.type).toBe("circular");
    expect(getState().data.self === getState().data).toBe(true);
    expect(getState().data.self.self.type).toBe("circular");
  });

  it("数组根：下标与 forEach 正常，且函数式 setState 返回新数组时可整体替换", async () => {
    const list = createStore<{ id: number }[]>([{ id: 1 }, { id: 2 }]);
    const setList = list.setState;

    expect(list[0].id).toBe(1);
    expect(typeof list.forEach).toBe("function");

    setList((prev: { id: number }[]) => [...prev, { id: 3 }]);
    await Promise.resolve();
    expect(list.length).toBe(3);
    expect(list[2].id).toBe(3);

    setList(
      produce((draft: { id: number }[]) => {
        draft[0].id = 10;
      }),
    );
    await Promise.resolve();
    expect(list[0].id).toBe(10);
  });

  it("稀疏数组：reconcile 应当处理带空洞的数组", async () => {
    const [getState, setState] = createStore({
      list: [1, 2, 3],
    });

    // 模拟稀疏数组更新 (虽然在 JS 中很少直接这么传给 reconcile，但作为边界必须健壮)
    const sparse: any = [];
    sparse[0] = 1;
    sparse[2] = 3; // index 1 是空的

    setState("list", reconcile(sparse));
    await Promise.resolve();

    expect(getState().list.length).toBe(3);
    expect(getState().list[0]).toBe(1);
    expect(getState().list[1]).toBe(undefined);
    expect(getState().list[2]).toBe(3);
  });
});
