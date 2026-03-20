/**
 * @fileoverview Portal 单元测试：createPortal 将挂载函数执行到指定容器，unmount 卸载。
 * 新标准：createPortal(fn: (container) => void, container?)
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createPortal } from "@dreamer/view/portal";
import { insert } from "@dreamer/view/compiler";

const noSanitize = { sanitizeOps: false, sanitizeResources: false };

describe("createPortal", () => {
  it("应返回带 unmount 方法的 Root", () => {
    const root = createPortal((el) => {
      const div = document.createElement("div");
      div.setAttribute("data-portal-root", "");
      div.textContent = "portal-content";
      el.appendChild(div);
    });
    expect(root).toBeDefined();
    expect(typeof root.unmount).toBe("function");
    const el = document.body.querySelector("[data-portal-root]");
    expect(el?.textContent).toBe("portal-content");
    root.unmount();
    expect(() => root.unmount()).not.toThrow();
  }, noSanitize);

  it("传入 container 时挂载到该容器", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createPortal((el) => {
      const span = document.createElement("span");
      span.className = "portal-span";
      span.textContent = "from-fn";
      el.appendChild(span);
    }, container);
    expect(container.querySelector(".portal-span")).not.toBeNull();
    expect(container.textContent).toContain("from-fn");
    root.unmount();
    expect(container.querySelector(".portal-span")).toBeNull();
    container.remove();
  });

  it("不传 container 时挂载到 document.body", () => {
    const root = createPortal((el) => {
      const div = document.createElement("div");
      div.setAttribute("data-portal-test", "body");
      div.textContent = "body-portal";
      el.appendChild(div);
    });
    const el = document.body.querySelector("[data-portal-test=body]");
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain("body-portal");
    root.unmount();
    expect(() => root.unmount()).not.toThrow();
  });

  it("不传 container 时 unmount 只移除 Portal 包装，不删 body 其他子节点", () => {
    const existing = document.createElement("div");
    existing.setAttribute("data-portal-existing", "");
    existing.textContent = "main-app";
    document.body.appendChild(existing);
    const root = createPortal((el) => {
      const div = document.createElement("div");
      div.setAttribute("data-portal-test", "only-me");
      el.appendChild(div);
    });
    expect(document.body.querySelector("[data-portal-existing]")).not
      .toBeNull();
    expect(document.body.querySelector("[data-portal-test=only-me]")).not
      .toBeNull();
    root.unmount();
    expect(document.body.querySelector("[data-portal-existing]")).not
      .toBeNull();
    expect(document.body.querySelector("[data-portal-existing]")?.textContent)
      .toBe("main-app");
    expect(document.body.querySelector("[data-portal-test=only-me]"))
      .toBeNull();
    existing.remove();
  });

  it("unmount 可重复调用不抛错", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createPortal((el) => {
      insert(el, "will-unmount");
    }, container);
    expect(container.textContent).toContain("will-unmount");
    root.unmount();
    expect(() => root.unmount()).not.toThrow();
    container.remove();
  });
});
