/**
 * @fileoverview createReactive 单元测试：初始值、浅拷贝、get/set、与 createEffect 联动、嵌套代理
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect } from "@dreamer/view";
import { createReactive } from "@dreamer/view/reactive";

describe("createReactive", () => {
  it("应返回代理对象，初始属性可读", () => {
    const model = createReactive({ name: "", age: 0 });
    expect(model.name).toBe("");
    expect(model.age).toBe(0);
  });

  it("不应修改入参，对 initial 做浅拷贝", () => {
    const initial = { a: 1 };
    const proxy = createReactive(initial);
    proxy.a = 2;
    expect(proxy.a).toBe(2);
    expect(initial.a).toBe(1);
  });

  it("set 属性后 get 应返回新值", () => {
    const model = createReactive({ name: "", age: "" });
    model.name = "alice";
    model.age = "18";
    expect(model.name).toBe("alice");
    expect(model.age).toBe("18");
  });

  it("createEffect 内读取 reactive 属性，属性变更后 effect 应再次执行（微任务后）", async () => {
    const model = createReactive({ value: 0 });
    let runs = 0;
    createEffect(() => {
      void model.value;
      runs++;
    });
    expect(runs).toBe(1);
    model.value = 1;
    await Promise.resolve();
    expect(runs).toBe(2);
    model.value = 2;
    await Promise.resolve();
    expect(runs).toBe(3);
  });

  it("嵌套对象应为代理，读写与顶层共享订阅", async () => {
    const model = createReactive({ inner: { count: 0 } });
    let runs = 0;
    createEffect(() => {
      void model.inner.count;
      runs++;
    });
    expect(runs).toBe(1);
    expect(model.inner.count).toBe(0);
    model.inner.count = 1;
    await Promise.resolve();
    expect(runs).toBe(2);
    expect(model.inner.count).toBe(1);
  });

  it("多字段赋值均应触发曾读取过该 reactive 的 effect（同一代理共享订阅）", async () => {
    const model = createReactive({ a: 0, b: 0 });
    let runs = 0;
    createEffect(() => {
      void model.a;
      void model.b;
      runs++;
    });
    expect(runs).toBe(1);
    model.a = 1;
    await Promise.resolve();
    expect(runs).toBe(2);
    model.b = 1;
    await Promise.resolve();
    expect(runs).toBe(3);
  });
});
