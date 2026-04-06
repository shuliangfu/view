import { describe, expect, it } from "@dreamer/test";
import { waitUntilComplete } from "../dom-setup.ts";
import {
  batch,
  createContext,
  createSignal,
  mount,
  useContext,
} from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("reactivity/context (final integration)", () => {
  it("应当能正确响应 Context 中的数据更新", async () => {
    // 1. 设置状态
    const [name, setName] = createSignal("Guest");
    const [role, setRole] = createSignal("none");

    const auth = {
      name, // 信号
      role, // 信号
      login: () => {
        batch(() => {
          setName("Admin");
          setRole("admin");
        });
      },
    };

    const AuthContext = createContext(auth);

    // 2. 组件定义
    const Consumer = () => {
      const ctx = useContext(AuthContext);
      return jsx("div", {
        children: [
          jsx("span", { id: "name", children: () => ctx.name() }),
          jsx("span", { id: "role", children: () => ctx.role() }),
        ],
      });
    };

    const container = document.createElement("div");
    mount(() =>
      jsx(AuthContext.Provider, {
        value: auth,
        children: jsx(Consumer, {}),
      }), container);

    await waitUntilComplete();
    expect(container.querySelector("#name")?.textContent).toBe("Guest");

    // 3. 触发更新
    auth.login();

    // 关键：等待微任务刷新并确保没有悬挂任务
    await waitUntilComplete();
    await Promise.resolve();
    await waitUntilComplete();

    expect(container.querySelector("#name")?.textContent).toBe("Admin");
    expect(container.querySelector("#role")?.textContent).toBe("admin");

    // 彻底清理以防止 Deno 泄漏检测
    container.innerHTML = "";
    await waitUntilComplete();
  });
}, { sanitizeOps: false, sanitizeResources: false });
