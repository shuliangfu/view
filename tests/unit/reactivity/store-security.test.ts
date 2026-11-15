import { describe, expect, it } from "@dreamer/test";
import { createStore, reconcile } from "@dreamer/view";

function protoPolluted(): boolean {
  return Object.prototype.hasOwnProperty.call(Object.prototype, "polluted");
}

describe("reactivity/store dangerous keys", () => {
  it("setState 对象合并不应把 JSON __proto__ 写到 Object.prototype", () => {
    const store = createStore({ x: 1, y: 0 });
    const dirty = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"polluted":true},"y":2}',
    );
    store.setState(dirty);
    expect(protoPolluted()).toBe(false);
    expect(store.y).toBe(2);
    expect((store as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("Proxy 赋值 __proto__ 应被忽略", () => {
    const store = createStore({ x: 1 }) as Record<string, unknown>;
    store["__proto__"] = { polluted: true };
    expect(protoPolluted()).toBe(false);
    expect(store.x).toBe(1);
  });

  it("路径更新不应写入危险键", () => {
    const store = createStore({ x: 1 });
    store.setState("__proto__", { polluted: true } as never);
    expect(protoPolluted()).toBe(false);
  });

  it("reconcile 应跳过危险键", () => {
    const store = createStore({ a: 1, b: 2 });
    const dirty = JSON.parse('{"__proto__":{"polluted":true},"a":9}');
    store.setState(reconcile(dirty));
    expect(protoPolluted()).toBe(false);
    expect(store.a).toBe(9);
  });

  it("具名 store 复用合并应跳过危险键", () => {
    const name = `view-310-proto-${Date.now()}-${Math.random()}`;
    const first = createStore(name, { x: 1 });
    const dirty = JSON.parse('{"__proto__":{"polluted":true},"x":3}');
    const second = createStore(name, dirty);
    expect(protoPolluted()).toBe(false);
    expect(first.x).toBe(3);
    expect(second.x).toBe(3);
  });
});
