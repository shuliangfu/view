/**
 * @fileoverview Resource 单元测试：createResource（无 source / 有 source）、data/loading/error/refetch
 */

import { describe, expect, it } from "@dreamer/test";
import { createEffect, createSignal } from "@dreamer/view";
import { createResource } from "@dreamer/view/resource";

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
    const [getId, setId] = createSignal(1);
    const getter = createResource(getId, (id) => Promise.resolve(id * 10));
    createEffect(() => {
      getter();
      return undefined;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(10);
    setId(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(getter().data).toBe(20);
  });
});
