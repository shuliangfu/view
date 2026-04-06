import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createHMRProxy, createSignal } from "@dreamer/view";

describe("runtime/hmr (state preservation)", () => {
  it("无感更新：应当在热更新时保留组件内部信号状态", async () => {
    // 1. 定义第一个版本的组件
    const AppV1 = () => {
      const [count, setCount] = createSignal(0);
      const el = document.createElement("div");
      el.textContent = `Count: ${count()}`;
      (el as any)._set = setCount; // 暴露给测试用例
      return el;
    };

    // 2. 创建 HMR 代理并挂载
    const proxy = createHMRProxy("test-app", AppV1);
    const container = document.createElement("div");
    const fragment = proxy({});
    container.appendChild(fragment as Node);

    expect(container.textContent).toBe("Count: 0");

    // 3. 修改状态
    const el = container.querySelector("div") as any;
    el._set(10);
    await waitUntilComplete();
    expect(container.textContent).toBe("Count: 10");

    // 4. 模拟热更新：替换为第二个版本的组件
    const AppV2 = () => {
      const [count] = createSignal(0); // 声明同样的信号
      const el = document.createElement("div");
      el.textContent = `New Count: ${count()}`; // 模板变了
      return el;
    };

    // 触发更新
    createHMRProxy("test-app", AppV2);
    await waitUntilComplete();

    // 5. 验证：模板变了，但 count 依然是 10
    expect(container.textContent).toBe("New Count: 10");
  });
}, { sanitizeOps: false, sanitizeResources: false });
