import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createEffect, createResource, mount, Suspense } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("runtime/suspense", () => {
  it("基础悬挂：应当在加载资源时显示 fallback", async () => {
    const fallback = document.createTextNode("Loading...");

    let resolve: (v: string) => void;
    const promise = new Promise<string>((r) => resolve = r);

    const container = document.createElement("div");

    /**
     * createResource 必须只创建一次：若在 Suspense 子组件内创建，
     * loading 结束触发 setIsSuspended(false) 会重插子树并再次执行子组件，形成无限 new createResource → OOM。
     * 与示例 ResourceDemo 一致：资源在边界外创建，子组件只读 resource。
     */
    mount(() => {
      const resource = createResource(() => promise);

      function SuspenseChild() {
        const span = document.createElement("span");
        createEffect(() => {
          span.textContent = resource.loading()
            ? "Loading..."
            : resource() || "";
        });
        return span;
      }

      return jsx(Suspense, {
        fallback,
        children: jsx(SuspenseChild, {}),
      });
    }, container);

    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toBe("Loading...");

    resolve!("Done");
    await new Promise((r) => setTimeout(r, 50));
    await Promise.resolve();
    await Promise.resolve();

    expect(container.textContent).toBe("Done");
  });

  /**
   * 同一边界内多个 createResource 时，任一仍在 loading 则应保持 fallback；
   * 若每资源单独 setIsSuspended(自身 loading)，后完成的资源会把边界提前标成未悬挂。
   */
  it("同一边界多个资源：任一 loading 时应保持 fallback", async () => {
    const fallback = document.createTextNode("Loading...");
    let resolveSlow: (v: string) => void;
    let resolveFast: (v: string) => void;
    const slow = new Promise<string>((r) => (resolveSlow = r));
    const fast = new Promise<string>((r) => (resolveFast = r));

    const container = document.createElement("div");

    mount(() => {
      const r1 = createResource(() => slow);
      const r2 = createResource(() => fast);

      function Child() {
        const span = document.createElement("span");
        createEffect(() => {
          span.textContent = r1.loading() || r2.loading()
            ? "Loading..."
            : `${r1()}-${r2()}`;
        });
        return span;
      }

      return jsx(Suspense, {
        fallback,
        children: jsx(Child, {}),
      });
    }, container);

    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toBe("Loading...");

    resolveFast!("A");
    await new Promise((r) => setTimeout(r, 30));
    await Promise.resolve();
    expect(container.textContent).toBe("Loading...");

    resolveSlow!("B");
    await new Promise((r) => setTimeout(r, 50));
    await Promise.resolve();
    await Promise.resolve();
    // r1 = slow → "B"，r2 = fast → "A"；展示顺序为 r1-r2
    expect(container.textContent).toBe("B-A");
  }, { sanitizeOps: false, sanitizeResources: false });
}, { sanitizeOps: false, sanitizeResources: false });
