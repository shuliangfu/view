import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, mount, setAttribute, setProperty } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("runtime/props (focus stability)", () => {
  it("受控输入：应当在值未改变时不重新赋值 el.value 以保持焦点稳定性", async () => {
    const [text, setText] = createSignal("initial");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // 绑定响应式属性
    setAttribute(input, "value", text);
    await waitUntilComplete();
    expect(input.value).toBe("initial");

    // 模拟用户输入，触发 signal 更新
    // 在真实场景中，onInput 会触发 setText
    input.value = "initial a";
    setText("initial a");

    // 此时 Effect 应该触发 setProperty("value", "initial a")
    await waitUntilComplete();

    // 如果实现正确，此时 input.value 已经是 "initial a"，setProperty 不应再次赋值
    // 虽然在 Happy DOM 中很难检测光标位置，但我们可以验证 DOM 稳定性
    expect(document.activeElement === input).toBe(true);
    expect(input.value).toBe("initial a");

    document.body.removeChild(input);
  });

  it("委托 onInput + jsx 函数 value：追加输入后 signal 与 DOM 一致", async () => {
    const [userName, setUserName] = createSignal("Dreamer");
    const container = document.createElement("div");
    document.body.appendChild(container);

    mount(
      () =>
        jsx("input", {
          type: "text",
          value: () => userName(),
          onInput: (e: Event) =>
            setUserName((e.currentTarget as HTMLInputElement).value),
        }),
      container,
    );

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Dreamer");

    input.focus();
    input.value = "DreamerOK";
    input.dispatchEvent(
      new globalThis.InputEvent("input", { bubbles: true }),
    );
    await waitUntilComplete();
    await Promise.resolve();

    expect(userName()).toBe("DreamerOK");
    expect(input.value).toBe("DreamerOK");

    document.body.removeChild(container);
  });

  it("代理事件：e.target 可读（createForm 等用 target 而非 currentTarget）", async () => {
    let saw = "";
    const container = document.createElement("div");
    document.body.appendChild(container);

    mount(
      () =>
        jsx("input", {
          type: "text",
          value: () => "",
          onInput: (e: Event) => {
            saw = (e.target as HTMLInputElement).value;
          },
        }),
      container,
    );

    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "via-target";
    input.dispatchEvent(
      new globalThis.InputEvent("input", { bubbles: true }),
    );
    await waitUntilComplete();

    expect(saw).toBe("via-target");
    document.body.removeChild(container);
  });

  it("委托 onSubmit：代理事件上 preventDefault 须绑定原生 Event 才能阻止默认提交", async () => {
    let called = false;
    const container = document.createElement("div");
    document.body.appendChild(container);

    mount(
      () =>
        jsx("form", {
          onSubmit: (e: Event) => {
            called = true;
            e.preventDefault();
          },
          children: "x",
        }),
      container,
    );

    const form = container.querySelector("form") as HTMLFormElement;
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    const notCanceled = form.dispatchEvent(ev);
    await waitUntilComplete();

    expect(called).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(notCanceled).toBe(false);

    document.body.removeChild(container);
  });

  it("布尔属性：应当正确使用 removeAttribute 处理 false/null", () => {
    const input = document.createElement("input");
    setProperty(input, "disabled", true);
    expect(input.hasAttribute("disabled")).toBe(true);

    setProperty(input, "disabled", false);
    expect(input.hasAttribute("disabled")).toBe(false);

    setProperty(input, "disabled", null);
    expect(input.hasAttribute("disabled")).toBe(false);
  });
}, { sanitizeOps: false, sanitizeResources: false });
