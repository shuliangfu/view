import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { setAttribute, setProperty, spread } from "@dreamer/view";
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

  it("className 同值重复设置仍保持正确", () => {
    const el = document.createElement("div");
    setProperty(el, "className", "box");
    setProperty(el, "className", "box");
    expect(el.className).toBe("box");
    setProperty(el, "class", "card");
    expect(el.className).toBe("card");
    setProperty(el, "className", null);
    expect(el.className).toBe("");
  });

  it("普通属性 / setAttribute 同值重复设置保持正确", () => {
    const el = document.createElement("div");
    setProperty(el, "id", "a");
    setProperty(el, "id", "a");
    expect(el.id).toBe("a");
    setProperty(el, "title", "t1");
    setProperty(el, "title", "t1");
    expect(el.getAttribute("title")).toBe("t1");
    setProperty(el, "title", "t2");
    expect(el.getAttribute("title")).toBe("t2");
    setProperty(el, "title", null);
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("spread(null/undefined) 不抛错", () => {
    const el = document.createElement("div");
    spread(el, null);
    spread(el, undefined);
    expect(el.attributes.length).toBe(0);
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

  it("安全：javascript: href 应被拒绝且不写入", () => {
    const a = document.createElement("a");
    setProperty(a, "href", "https://ok.example/");
    expect(a.getAttribute("href")).toContain("ok.example");
    setProperty(a, "href", "javascript:alert(1)");
    expect(a.getAttribute("href")).toBeNull();
  });

  it("安全：字符串 onClick 应被忽略；函数 onClick 仍有效", async () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    let n = 0;
    setProperty(btn, "onClick", "alert(1)" as unknown as () => void);
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(n).toBe(0);
    setProperty(btn, "onClick", () => {
      n++;
    });
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(n).toBe(1);
  });


  it("安全：危险 srcset 应被拒绝；安全 srcset 保留", () => {
    const img = document.createElement("img");
    setProperty(img, "srcset", "/a.jpg 1x, /b.jpg 2x");
    expect(img.getAttribute("srcset")).toContain("/a.jpg");
    expect(img.getAttribute("srcset")).toContain("/b.jpg");
    setProperty(img, "srcset", "javascript:alert(1)");
    expect(img.getAttribute("srcset")).toBeNull();
    setProperty(img, "srcset", "/ok.jpg 1x, javascript:alert(1) 2x");
    expect(img.getAttribute("srcset")).toBeNull();
  });

  it("安全：srcdoc / srcDoc 应被拒绝且不写入", () => {
    const iframe = document.createElement("iframe");
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(String(args[0] ?? ""));
    };
    try {
      setProperty(iframe, "srcdoc", "<script>alert(1)</script>");
      expect(iframe.getAttribute("srcdoc")).toBeNull();
      setProperty(iframe, "srcDoc", "<p>x</p>");
      expect(iframe.getAttribute("srcdoc")).toBeNull();
      expect(warns.some((w) => w.includes("srcdoc") || w.includes("srcDoc"))).toBe(
        true,
      );
    } finally {
      console.warn = orig;
    }
  });

  it("open 属性不应被当成 on* 事件", () => {
    const d = document.createElement("details");
    setProperty(d, "open", true);
    expect((d as HTMLDetailsElement).open).toBe(true);
  });
}, { sanitizeOps: false, sanitizeResources: false });
