import { describe, expect, it } from "@dreamer/test";
import { createResource, createSignal } from "@dreamer/view";

/**
 * 模拟异步 API
 */
async function fakeApi(id: number): Promise<{ id: number; name: string }> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (id === 3) throw new Error("模拟的网络请求错误 (ID: 3)");
  return { id, name: `用户 ${id}` };
}

describe("integrations/resource (Suspense + ErrorBoundary)", () => {
  it("createResource 应当正常工作", async () => {
    const [userId] = createSignal(1);
    const user = createResource(userId, fakeApi);

    // 初始状态应该是 loading
    expect(user.loading()).toBe(true);
    expect(user()).toBeUndefined();

    // 等待加载完成
    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.resolve();
    await Promise.resolve();

    // 应该成功加载
    expect(user.loading()).toBe(false);
    expect(user()).toEqual({ id: 1, name: "用户 1" });
    expect(user.error()).toBeNull();
  });

  it("切换 ID 应当触发重新加载", async () => {
    const [userId, setUserId] = createSignal(1);
    const user = createResource(userId, fakeApi);

    // 等待第一次加载
    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.resolve();
    await Promise.resolve();

    expect(user()).toEqual({ id: 1, name: "用户 1" });

    // 切换 ID
    setUserId(2);

    // 等待第二次加载
    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.resolve();
    await Promise.resolve();

    expect(user()).toEqual({ id: 2, name: "用户 2" });
  });
});
