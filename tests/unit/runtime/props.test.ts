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
}, { sanitizeOps: false, sanitizeResources: false });
