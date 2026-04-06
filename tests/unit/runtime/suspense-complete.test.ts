import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createResource,
  createSignal,
  mount,
  registerForSuspense,
  Suspense,
  useSuspense,
} from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";
import { waitUntilComplete } from "../dom-setup.ts";

/**
 * 模拟异步 API
 */
async function fakeApi(id: number): Promise<{ id: number; name: string }> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (id === 3) throw new Error("模拟的网络请求错误 (ID: 3)");
  return { id, name: `用户 ${id}` };
}

describe("runtime/suspense (完整测试)", () => {
  it("基础功能：createResource 应当正常工作", async () => {
    const [userId] = createSignal(1);
    const user = createResource(userId, fakeApi);

    expect(user.loading()).toBe(true);
    expect(user()).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.resolve();
    await Promise.resolve();

    expect(user.loading()).toBe(false);
    expect(user()).toEqual({ id: 1, name: "用户 1" });
    expect(user.error()).toBeNull();
  }, { sanitizeOps: false, sanitizeResources: false });

  it("useSuspense() 应当能获取到上下文", async () => {
    let contextReceived = false;
    let registerFnType = "undefined";

    const TestComponent = () => {
      const suspense = useSuspense();
      if (suspense) {
        contextReceived = true;
        registerFnType = typeof suspense.register;
      }
      return jsx("div", { children: "Test" });
    };

    const container = document.createElement("div");

    mount(() =>
      jsx(Suspense, {
        fallback: jsx("div", { children: "Loading..." }),
        children: jsx(TestComponent, {}),
      }), container);

    await waitUntilComplete();

    expect(contextReceived).toBe(true);
    expect(registerFnType).toBe("function");
  });

  it("registerForSuspense 应当能正常注册", async () => {
    let registered = false;

    const TestRegister = () => {
      const loadingFn = () => false;
      registerForSuspense(loadingFn);
      registered = true;
      return jsx("div", { children: "Registered" });
    };

    const container = document.createElement("div");

    mount(() =>
      jsx(Suspense, {
        fallback: jsx("div", { children: "Loading..." }),
        children: jsx(TestRegister, {}),
      }), container);

    await waitUntilComplete();
    expect(registered).toBe(true);
  });

  it("切换 ID 应当触发重新加载", async () => {
    const [userId, setUserId] = createSignal(1);
    const user = createResource(userId, fakeApi);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.resolve();
    await Promise.resolve();

    expect(user()).toEqual({ id: 1, name: "用户 1" });

    setUserId(2);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await Promise.resolve();
    await Promise.resolve();

    expect(user()).toEqual({ id: 2, name: "用户 2" });
  }, { sanitizeOps: false, sanitizeResources: false });
});
