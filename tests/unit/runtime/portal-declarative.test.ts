/**
 * 声明式 Portal：`mount` 可为 accessor，目标变化时迁到新容器。
 */
import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal } from "@dreamer/view";
import { Portal } from "@dreamer/view/control-flow";
import { mount } from "@dreamer/view/csr";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("runtime/Portal mount", () => {
  it("静态 mount 应把 children 挂到目标容器", async () => {
    const a = document.createElement("div");
    document.body.appendChild(a);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = mount(
      () =>
        Portal({
          mount: a,
          children: jsx("span", { children: "hello" }),
        }),
      host,
    );
    await waitUntilComplete();
    expect(a.textContent).toBe("hello");
    expect(host.textContent).toBe("");
    dispose();
    await waitUntilComplete();
    expect(a.textContent).toBe("");
    a.remove();
    host.remove();
  });

  it("mount 为 Signal 时目标变化应卸下旧容器并挂到新容器", async () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    document.body.appendChild(a);
    document.body.appendChild(b);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const [target, setTarget] = createSignal<Node>(a);
    const dispose = mount(
      () =>
        Portal({
          mount: target,
          children: jsx("span", { children: "moved" }),
        }),
      host,
    );
    await waitUntilComplete();
    expect(a.textContent).toBe("moved");
    expect(b.textContent).toBe("");
    setTarget(b);
    await waitUntilComplete();
    expect(a.textContent).toBe("");
    expect(b.textContent).toBe("moved");
    dispose();
    await waitUntilComplete();
    expect(a.textContent).toBe("");
    expect(b.textContent).toBe("");
    a.remove();
    b.remove();
    host.remove();
  });
}, { sanitizeOps: false, sanitizeResources: false });
