import { describe, expect, it } from "@dreamer/test";
import { createResource } from "@dreamer/view";

describe("integrations/resource", () => {
  it("成功加载：方案 B 单值访问模式", async () => {
    let resolveFetcher: any;
    const fetcher = () =>
      new Promise<string>((resolve) => {
        resolveFetcher = resolve;
      });

    // 方案 B：直接返回 resource
    const resource = createResource(fetcher);

    expect(resource.loading()).toBe(true);
    expect(resource()).toBeUndefined();

    // 触发完成
    resolveFetcher!("Success");

    // 等待异步完成 (需要多次 resolve 以穿透 async 函数的内部逻辑)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(resource.loading()).toBe(false);
    expect(resource()).toBe("Success");
    expect(resource.error()).toBeNull();
  });

  it("方案 B 的 mutate 与 refetch：应当集成在资源对象上", async () => {
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      return Promise.resolve(`Data ${callCount}`);
    };

    const resource = createResource(fetcher);

    // 等待初始化加载完成
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(resource()).toBe("Data 1");

    // 手动修改数据 (mutate)
    resource.mutate("Manually Set");
    expect(resource()).toBe("Manually Set");

    // 重新获取数据 (refetch)
    await resource.refetch();
    expect(resource()).toBe("Data 2");
    expect(callCount).toBe(2);
  });

  it("失败加载：应当捕获错误", async () => {
    let rejectFetcher: any;
    const fetcher = () =>
      new Promise<string>((_, reject) => {
        rejectFetcher = reject;
      });

    const resource = createResource(fetcher);

    // 触发失败
    rejectFetcher!(new Error("Failed"));

    // 等待异步完成
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(resource.loading()).toBe(false);
    expect(resource.error()).toBeInstanceOf(Error);
    expect(() => resource()).toThrow();
  });
});
