import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { setAttribute, setProperty } from "@dreamer/view";
import { createSignal } from "../../../src/reactivity/signal.ts";

describe("runtime/props", () => {
  it("静态属性：应当正确设置 className 和 style", () => {
    const el = document.createElement("div");
    setProperty(el, "className", "box");
    setProperty(el, "style", { color: "red", marginTop: "10px" });

    expect(el.className).toBe("box");
    expect((el as HTMLElement).style.color).toBe("red");
    expect((el as HTMLElement).style.marginTop).toBe("10px");
  });

  it("style 对象更新：省略的键应从内联样式移除", () => {
    const el = document.createElement("div");
    setProperty(el, "style", { color: "red", marginTop: "8px" });
    expect((el as HTMLElement).style.color).toBeTruthy();
    expect((el as HTMLElement).style.marginTop).toBe("8px");

    setProperty(el, "style", { marginTop: "12px" });
    expect((el as HTMLElement).style.color).toBe("");
    expect((el as HTMLElement).style.marginTop).toBe("12px");
  });

  it("响应式属性：应当随 Signal 自动更新", async () => {
    const el = document.createElement("button");
    const [disabled, setDisabled] = createSignal(false);

    setAttribute(el, "disabled", () => disabled());

    // 初始 flush
    await Promise.resolve();

    expect((el as HTMLButtonElement).disabled).toBe(false);
    setDisabled(true);
    await Promise.resolve();
    expect((el as HTMLButtonElement).disabled).toBe(true);
  });

  it('可选 id/name：undefined 时不应写成字面量 "undefined"', () => {
    const input = document.createElement("input");
    const btn = document.createElement("button");
    setProperty(input, "name", undefined);
    setProperty(btn, "id", undefined);
    expect(input.getAttribute("name")).toBeNull();
    expect(btn.getAttribute("id")).toBeNull();
    expect(input.name).toBe("");
    expect(btn.id).toBe("");
  });

  /**
   * `mouseenter` / `mouseleave` 不冒泡：`document` 委托收不到子树触发，必须在绑定节点上直连监听。
   */
  it("onMouseEnter：应在元素上直连监听并能触发", async () => {
    const el = document.createElement("span");
    document.body.appendChild(el);

    let entered = 0;
    setProperty(el, "onMouseEnter", () => {
      entered++;
    });

    el.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: false }),
    );
    await Promise.resolve();
    expect(entered).toBe(1);

    setProperty(el, "onMouseEnter", () => {
      entered += 10;
    });
    el.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: false }),
    );
    await Promise.resolve();
    expect(entered).toBe(11);

    setProperty(el, "onMouseEnter", null);
    el.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: false }),
    );
    await Promise.resolve();
    expect(entered).toBe(11);
  });
}, { sanitizeOps: false, sanitizeResources: false });
