import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { internalHydrate, stopHydration, useHydratedNode } from "@dreamer/view";

describe("runtime/hydration", () => {
  it("零注释水合：应当基于路径准确寻址并注册节点", () => {
    // 模拟 SSR 生成的 DOM
    const root = document.createElement("div");
    root.innerHTML = "<ul><li>Item 1</li><li>Item 2</li></ul>";

    // 编译器生成的路径映射
    const bindingMap: [number[], string][] = [
      [[0], "ul-id"],
      [[0, 1], "li2-id"],
    ];

    // 使用内部注册函数进行测试 (因为它是纯逻辑，不涉及 Thunk 执行)
    internalHydrate(root, bindingMap);

    const ul = useHydratedNode("ul-id");
    const li2 = useHydratedNode("li2-id");

    expect(ul?.nodeName).toBe("UL");
    expect(li2?.nodeName).toBe("LI");
    expect(li2?.textContent).toBe("Item 2");

    // 清理
    stopHydration();
  });
}, { sanitizeOps: false, sanitizeResources: false });
