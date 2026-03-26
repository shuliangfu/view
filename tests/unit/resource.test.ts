/**
 * @fileoverview Resource 单元测试：createResource（无 source / 有 source）、lazy、mapArray；data/loading/error/refetch
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";
import { createResource, lazy, mapArray } from "@dreamer/view/resource";

describe("createResource (no source)", () => {
  it("首次调用返回 loading: true，data/error 为 undefined", () => {
    let resolve: (v: number) => void;
    const promise = new Promise<number>((r) => {
      resolve = r;
    });
    const getter = createResource(() => promise);
    const r = getter();
    expect(r.loading).toBe(true);
    expect(r.data).toBeUndefined();
    expect(r.error).toBeUndefined();
    expect(typeof r.refetch).toBe("function");
    resolve!(10);
  });

  it("Promise resolve 后 getter() 在 effect 中会更新为 data", async () => {
    const getter = createResource(() => Promise.resolve(100));
    let data: number | undefined;
    createEffect(() => {
      data = getter().data;
      return undefined;
    });
    await Promise.resolve(); // 等待 effect 与 resource 内部微任务
    await Promise.resolve();
    expect(data).toBe(100);
    expect(getter().loading).toBe(false);
  });

  it("Promise reject 后 error 被设置", async () => {
    const err = new Error("fail");
    const getter = createResource(() => Promise.reject(err));
    createEffect(() => {
      getter();
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().error).toBe(err);
    expect(getter().loading).toBe(false);
  });

  it("refetch 应重新执行 fetcher", async () => {
    let count = 0;
    const getter = createResource(() => Promise.resolve(++count));
    createEffect(() => {
      getter();
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(1);
    getter().refetch();
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(2);
  });

  it("边界：fetcher 同步抛错时错误在 createResource 内部 effect 运行时向上抛出", () => {
    // createResource 内部会 createEffect 并立即 run，run 中调用 fetcher()，同步抛错会直接抛出
    expect(() => {
      createResource(() => {
        throw new Error("sync throw");
      });
    }).toThrow("sync throw");
  });

  it("边界：fetcher 返回非 Promise 时被 Promise.resolve 包装，data 为该值", async () => {
    const getter = createResource(() => 42 as unknown as Promise<number>);
    createEffect(() => {
      getter();
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(42);
    expect(getter().loading).toBe(false);
  });
});

describe("createResource (with source)", () => {
  it("source 变化时应重新请求", async () => {
    const id = createSignal(1);
    const getter = createResource(id, (id) => Promise.resolve(id * 10));
    createEffect(() => {
      getter();
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(10);
    id.value = 2;
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(20);
  });
});

/**
 * `lazy`：`createResource` + 默认导出组件；加载完成后渲染 props，失败时调用组件会 throw。
 */
describe("lazy", () => {
  it("模块 resolve 后调用懒组件应得到 default(props) 的返回值", async () => {
    const Heavy = lazy(() =>
      Promise.resolve({
        default: (props: { n: number }) => props.n * 2,
      })
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(Heavy({ n: 21 })).toBe(42);
  });

  it("加载中调用懒组件应返回 null", () => {
    let resolve!: (
      m: { default: (p: Record<string, never>) => string },
    ) => void;
    const pending = new Promise<
      { default: (p: Record<string, never>) => string }
    >(
      (r) => {
        resolve = r;
      },
    );
    const Heavy = lazy(() => pending);
    expect(Heavy({})).toBe(null);
    resolve({ default: () => "ok" });
  });

  it("模块 reject 后在 effect 内再次调用懒组件应抛出错误", async () => {
    const Heavy = lazy(() => Promise.reject(new Error("lazy-load-fail")));
    /** 首帧 loading 返回 null；Promise 拒绝后经调度再跑 effect，此时 Heavy 会 throw */
    let thrown: unknown;
    createEffect(() => {
      try {
        Heavy({});
      } catch (e) {
        thrown = e;
      }
      return undefined;
    });
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
      if (thrown instanceof Error) break;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("lazy-load-fail");
  });
});

/**
 * `mapArray` 简化版：列表 signal 变化时 memo 映射结果更新。
 */
describe("mapArray", () => {
  it("应对 list() 每一项调用 mapFn 并缓存为 getter", () => {
    const list = createSignal<number[]>([1, 2]);
    const mapped = mapArray(() => list.value, (x, i) => x * 10 + i);
    expect(mapped()).toEqual([10, 21]);
  });

  it("list 变化后在同 effect 内读 mapped 应得到新数组", async () => {
    const list = createSignal<number[]>([1]);
    const mapped = mapArray(() => list.value, (x) => x + 1);
    const snapshots: number[][] = [];
    createEffect(() => {
      snapshots.push(mapped());
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)).toEqual([2]);
    list.value = [10, 20];
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.at(-1)).toEqual([11, 21]);
  });

  it("null/undefined 列表应视为空数组", async () => {
    const list = createSignal<readonly number[] | null>(null);
    const mapped = mapArray(() => list.value, (x) => x);
    expect(mapped()).toEqual([]);
    list.value = [1];
    await Promise.resolve();
    await Promise.resolve();
    expect(mapped()).toEqual([1]);
  });
});
