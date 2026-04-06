/**
 * @fileoverview 命令式 Portal：`createPortal` 的响应式挂载与 unmount。
 */
import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createPortal, createSignal } from "@dreamer/view";

describe("runtime/createPortal", () => {
  it("应在 container 内插入 render 结果，并随 signal 更新", async () => {
    const [n, setN] = createSignal(1);
    const host = document.createElement("div");
    const container = document.createElement("div");
    host.appendChild(container);

    const root = createPortal(() => {
      const t = document.createTextNode("");
      t.textContent = String(n());
      return t;
    }, container);

    await waitUntilComplete();
    expect(container.textContent).toBe("1");
    setN(2);
    await waitUntilComplete();
    expect(container.textContent).toBe("2");

    root.unmount();
    await waitUntilComplete();
    expect(container.textContent).toBe("");
  });

  it("unmount 后应释放订阅，不再响应 signal", async () => {
    const [n, setN] = createSignal(0);
    const container = document.createElement("div");
    const root = createPortal(() => {
      const t = document.createTextNode("");
      t.textContent = String(n());
      return t;
    }, container);

    await waitUntilComplete();
    expect(container.textContent).toBe("0");
    root.unmount();
    setN(99);
    await waitUntilComplete();
    expect(container.textContent).toBe("");
  });
}, { sanitizeOps: false, sanitizeResources: false });
