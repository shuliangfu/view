import "./dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createContext,
  createSignal,
  hydrate,
  insert,
  template,
  useContext,
  useHydratedNode,
  walk,
} from "@dreamer/view";
import { renderToString } from "@dreamer/view/ssr";

describe("SSR 完整链路验证", () => {
  it("复杂嵌套与水合：应当在水合后恢复响应性并保留状态", async () => {
    // 1. 定义 Context 和信号
    const ThemeContext = createContext("light");
    const count = createSignal(0);

    // 2. 模拟编译器生成的组件代码
    const App = (isSSR: boolean) => {
      return ThemeContext.Provider({
        value: "dark",
        children: () => {
          const _tmpl$1 = template(
            '<div id="app"><p>Theme: <!--[--><!--]--></p><button>Count: <!--[--><!--]--></button></div>',
          );
          const _el = _tmpl$1() as HTMLElement;

          // 动态节点 1: <p> 内部的 text
          const _node1 = isSSR
            ? walk(_el, [0, 2])
            : (useHydratedNode("v-0") || walk(_el, [0, 2]));
          insert(_node1.parentNode!, () => useContext(ThemeContext), _node1);

          // 动态节点 2: <button> 内部的 text
          const _node2 = isSSR
            ? walk(_el, [1, 2])
            : (useHydratedNode("v-1") || walk(_el, [1, 2]));
          insert(_node2.parentNode!, () => count(), _node2);

          // 动态节点 3: <button> 的点击事件 (仅非 SSR)
          if (!isSSR) {
            _node2.parentNode!.addEventListener(
              "click",
              () => count.set((c: number) => c + 1),
            );
          }

          return _el;
        },
      });
    };

    // 3. 服务端渲染 (SSR)
    const ssrHtml = renderToString(() => App(true));
    expect(ssrHtml).toContain('id="app"');
    expect(ssrHtml).toContain("dark");
    expect(ssrHtml).toContain("0");

    // 4. 模拟水合 (Hydration)
    const container = document.createElement("div");
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    // 我们选择 #app 作为水合根节点
    const root = container.querySelector("#app")!;

    // 编译器生成的 bindingMap
    const bindingMap: [number[], string][] = [
      [[0, 2], "v-0"],
      [[1, 2], "v-1"],
    ];

    // 执行标准化水合：由框架接管 App 的执行和挂载
    hydrate(() => App(false), root, bindingMap);

    // 5. 验证响应性恢复
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("Count: 0");

    // 触发点击
    button.click();

    // 等待响应式刷新
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(button.textContent).toBe("Count: 1");
    // Context 必须成功维持 dark 状态
    expect(container.innerHTML).toContain("dark");

    // 清理
    document.body.removeChild(container);
  });
}, { sanitizeOps: false, sanitizeResources: false });
