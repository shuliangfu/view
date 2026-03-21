/**
 * @fileoverview 集成测试：createRoot(fn(container)) + insert + 事件与 signal
 * 仅使用新 API：fn(container) => void，内部 createElement、appendChild、insert、addEventListener。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createRoot, createSignal, insert } from "@dreamer/view";

describe("集成：createRoot(fn(container)) + 事件 + signal", () => {
  it(
    "按钮 onClick 应触发并更新 signal，insert getter 处 DOM 随 signal 更新",
    async () => {
      const container = document.createElement("div");
      const [getCount, setCount] = createSignal(0);
      let clickCount = 0;
      const root = createRoot((el) => {
        const div = document.createElement("div");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "inc";
        btn.addEventListener("click", () => {
          clickCount++;
          setCount(getCount() + 1);
        });
        const span = document.createElement("span");
        div.appendChild(btn);
        div.appendChild(span);
        el.appendChild(div);
        insert(span, () => String(getCount()));
      }, container);

      const btn = container.querySelector("button");
      const span = container.querySelector("span");
      expect(btn).not.toBeNull();
      expect(span).not.toBeNull();
      expect(span!.textContent).toBe("0");

      (btn as HTMLButtonElement).click();
      expect(clickCount).toBe(1);
      await Promise.resolve();
      expect(container.querySelector("span")!.textContent).toBe("1");

      (container.querySelector("button") as HTMLButtonElement).click();
      (container.querySelector("button") as HTMLButtonElement).click();
      await Promise.resolve();
      expect(clickCount).toBe(3);
      expect(container.querySelector("span")!.textContent).toBe("3");

      root.unmount();
      expect(container.textContent).toBe("");
    },
    { sanitizeOps: false, sanitizeResources: false },
  );
});

describe("集成：createRoot + 多事件类型", () => {
  it("onClick 与 change 等应正确绑定", () => {
    const container = document.createElement("div");
    let clicked = false;
    let changed = false;
    const root = createRoot((el) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Click";
      btn.addEventListener("click", () => {
        clicked = true;
      });
      const input = document.createElement("input");
      input.type = "text";
      input.addEventListener("change", () => {
        changed = true;
      });
      el.appendChild(btn);
      el.appendChild(input);
    }, container);

    const btn = container.querySelector("button");
    const input = container.querySelector("input");
    (btn as HTMLButtonElement).click();
    expect(clicked).toBe(true);
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changed).toBe(true);

    root.unmount();
  });
});

describe("集成：createEffect 与 createRoot 协作", () => {
  it("insert(getter) 处读 signal，外部 set 后应更新视图", async () => {
    const container = document.createElement("div");
    const [get, set] = createSignal("initial");
    const root = createRoot((el) => {
      insert(el, () => get());
    }, container);

    expect(container.textContent).toBe("initial");
    set("updated");
    await Promise.resolve();
    expect(container.textContent).toBe("updated");

    root.unmount();
    expect(container.textContent).toBe("");
  });
});

describe("集成：unmount 后容器清空", () => {
  it("unmount 后再次 set signal 不抛错、不更新 DOM", async () => {
    const container = document.createElement("div");
    const [get, set] = createSignal(0);
    const root = createRoot((el) => {
      insert(el, () => String(get()));
    }, container);
    root.unmount();
    expect(() => set(1)).not.toThrow();
    await Promise.resolve();
    expect(container.textContent).toBe("");
  });
});
