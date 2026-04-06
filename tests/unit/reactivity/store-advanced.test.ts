import { describe, expect, it } from "@dreamer/test";
import { createEffect, createStore, produce, reconcile } from "@dreamer/view";

describe("reactivity/store (advanced)", () => {
  it("produce: 应当支持可变修改语法", async () => {
    const [getState, setState] = createStore({
      user: { name: "Alice", age: 20 },
    });
    let name = "";

    createEffect(() => {
      name = getState().user.name;
    });

    setState(produce((s: any) => {
      s.user.name = "Bob";
    }));

    await Promise.resolve();
    expect(getState().user.name).toBe("Bob");
    expect(name).toBe("Bob");
  });

  it("reconcile: 应当执行深度 Diff 并保留未变化项的引用", async () => {
    const [getState, setState] = createStore({
      list: [{ id: 1, text: "A" }, { id: 2, text: "B" }],
    });

    const oldItem1 = getState().list[0];
    let updateCount = 0;

    createEffect(() => {
      // 仅监听第一项的 text
      getState().list[0].text;
      updateCount++;
    });

    // 初始执行一次
    expect(updateCount).toBe(1);

    // reconcile 更新
    setState(
      "list",
      reconcile([
        { id: 1, text: "A" },
        { id: 2, text: "C" },
      ]),
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getState().list[0].text).toBe("A");
    expect(getState().list[1].text).toBe("C");
    expect(getState().list[0] === oldItem1).toBe(true);

    // 如果实现正确，第一项没变，不应触发该 Effect
    expect(updateCount).toBe(1);
  });

  /**
   * reconcile 对象：target 与 source 键数量相同但集合不同时，须删除 target 上多余键（旧实现仅在 target 更长时删键）。
   */
  it("reconcile: 等长对象也应删除 source 中不存在的键", async () => {
    const [getState, setState] = createStore({
      a: 1,
      b: 2,
    } as Record<string, number>);
    setState(
      reconcile({
        a: 1,
        c: 3,
      } as Record<string, number>),
    );
    await Promise.resolve();
    expect(getState().a).toBe(1);
    expect(getState().c).toBe(3);
    expect("b" in getState()).toBe(false);
  });
}, { sanitizeOps: false, sanitizeResources: false });
