import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, Dynamic, lazy, mount, Suspense } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("runtime/component", () => {
  it("lazy: 应当配合 Suspense 异步加载组件", async () => {
    let resolveLoader: any;
    const loader = () =>
      new Promise<{ default: (props: { name: string }) => any }>((resolve) => {
        resolveLoader = resolve;
      });

    const MyLazyComp = lazy(loader);
    const fallback = document.createElement("div");
    fallback.textContent = "Loading...";

    const container = document.createElement("div");

    // 使用 jsx 语法进行挂载，这是保证 Suspense 正常的唯一方式
    mount(() =>
      jsx(Suspense, {
        fallback,
        children: jsx(MyLazyComp, { name: "World" }),
      }), container);

    // 等待微任务，确保 Suspense 捕获到 loading 状态
    await waitUntilComplete();
    await Promise.resolve();
    await waitUntilComplete();

    expect(container.textContent).toBe("Loading...");

    // 触发解析
    resolveLoader({
      default: (props: { name: string }) => {
        const div = document.createElement("div");
        div.textContent = `Hello, ${props.name}`;
        return div;
      },
    });

    // 等待解析后的渲染更新
    await waitUntilComplete();
    await Promise.resolve();
    await waitUntilComplete();

    expect(container.textContent).toBe("Hello, World");
  });

  it("Dynamic: 应当动态切换组件或标签", async () => {
    const [comp, setComp] = createSignal<any>("div");

    const container = document.createElement("div");

    // 正确的挂载方式：通过 mount 执行
    mount(() =>
      jsx(Dynamic, {
        component: comp,
        id: "test",
      }), container);

    await waitUntilComplete();
    expect(container.firstChild?.nodeName).toBe("DIV");

    // 状态变更
    setComp("span");
    await waitUntilComplete();
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });
}, { sanitizeOps: false, sanitizeResources: false });
