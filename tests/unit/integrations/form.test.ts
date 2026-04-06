import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createForm } from "../../../src/integrations/form.ts";
import { waitUntilComplete } from "../dom-setup.ts";

describe("integrations/form", () => {
  it("应当能创建表单并进行双向绑定", async () => {
    const form = createForm({
      username: "admin",
      age: 18,
    });

    expect(form.data.username).toBe("admin");
    expect(form.data.age).toBe(18);

    const usernameField = form.field("username");
    expect(usernameField.value()).toBe("admin");

    // 模拟 Input 事件
    const input = document.createElement("input");
    input.value = "new_admin";
    const event = new InputEvent("input", { bubbles: true });
    Object.defineProperty(event, "target", { value: input, enumerable: true });

    usernameField.onInput(event);

    await waitUntilComplete(); // 等待异步更新

    expect(form.data.username).toBe("new_admin");
    expect(usernameField.value()).toBe("new_admin");
  });

  it("应当能手动更新字段", async () => {
    const form = createForm({ count: 0 });
    form.updateField("count", 100);
    await waitUntilComplete();
    expect(form.data.count).toBe(100);
  });

  it("应当能重置表单", async () => {
    const form = createForm({
      name: "initial",
      email: "test@example.com",
    });

    form.updateField("name", "changed");
    form.updateField("email", "changed@example.com");

    await waitUntilComplete();
    form.reset();
    await waitUntilComplete();

    expect(form.data.name).toBe("initial");
    expect(form.data.email).toBe("test@example.com");
    expect(form.errors.name).toBe(null);
  });

  it("应当支持 produce 更新", async () => {
    const form = createForm({
      user: { name: "A", tags: ["tag1"] },
    });

    form.produce((state) => {
      // @ts-ignore: nested property access
      state.user.name = "B";
      // @ts-ignore: nested property access
      state.user.tags.push("tag2");
    });

    await waitUntilComplete();

    // @ts-ignore
    expect(form.data.user.name).toBe("B");
    // @ts-ignore
    expect(JSON.parse(JSON.stringify(form.data.user.tags))).toEqual([
      "tag1",
      "tag2",
    ]);
  });

  it("无 options 时 validate 应清空 errors 且返回 true", async () => {
    const form = createForm({ a: "" });
    form.errors.a = "手误";
    await waitUntilComplete();
    expect(form.validate()).toBe(true);
    await waitUntilComplete();
    expect(form.errors.a).toBe(null);
  });

  it("rules + validate 应整表校验", async () => {
    const form = createForm(
      { username: "", password: "" },
      {
        rules: {
          username: (v) => (v.trim() ? null : "必填"),
          password: (v) => (String(v).length >= 6 ? null : "至少 6 位"),
        },
      },
    );

    expect(form.validate()).toBe(false);
    await waitUntilComplete();
    expect(form.errors.username).toBe("必填");
    expect(form.errors.password).toBe("至少 6 位");

    form.updateField("username", "alice");
    form.updateField("password", "secret");
    await waitUntilComplete();

    expect(form.validate()).toBe(true);
    await waitUntilComplete();
    expect(form.errors.username).toBe(null);
    expect(form.errors.password).toBe(null);
  });

  it("validateField 应只校验单字段", async () => {
    const form = createForm(
      { a: "", b: "" },
      {
        rules: {
          a: (v) => (v ? null : "a 错"),
          b: (v) => (v ? null : "b 错"),
        },
      },
    );
    expect(form.validateField("a")).toBe(false);
    await waitUntilComplete();
    expect(form.errors.a).toBe("a 错");
    expect(form.errors.b).toBe(null);
  });

  it("validateOn change 时输入后应自动校验该字段", async () => {
    const form = createForm(
      { code: "" },
      {
        rules: {
          code: (v) => (String(v).length >= 3 ? null : "至少 3 字符"),
        },
        validateOn: "change",
      },
    );
    const f = form.field("code");
    const input = document.createElement("input");
    input.value = "ab";
    const ev = new InputEvent("input", { bubbles: true });
    Object.defineProperty(ev, "target", { value: input, enumerable: true });
    f.onInput(ev);
    await waitUntilComplete();
    expect(form.errors.code).toBe("至少 3 字符");

    input.value = "abc";
    const ev2 = new InputEvent("input", { bubbles: true });
    Object.defineProperty(ev2, "target", { value: input, enumerable: true });
    f.onInput(ev2);
    await waitUntilComplete();
    expect(form.errors.code).toBe(null);
  });

  it("validateOn blur 时应提供 onBlur 且失焦后校验", async () => {
    const form = createForm(
      { x: "" },
      {
        rules: { x: (v) => (v.trim() ? null : "不能为空") },
        validateOn: "blur",
      },
    );
    const f = form.field("x");
    expect(typeof f.onBlur).toBe("function");

    const input = document.createElement("input");
    input.value = "";
    const blurEv = new FocusEvent("blur", { bubbles: true });
    Object.defineProperty(blurEv, "target", { value: input, enumerable: true });
    f.onBlur!(blurEv);
    await waitUntilComplete();
    expect(form.errors.x).toBe("不能为空");
  });

  it("handleSubmit 应在通过校验时调用 onValid 并传入快照", async () => {
    const form = createForm(
      { u: "ok", p: "123456" },
      {
        rules: {
          u: (v) => (v ? null : "no"),
          p: (v) => (String(v).length >= 6 ? null : "short"),
        },
      },
    );
    let received: { u: string; p: string } | null = null;
    const handler = form.handleSubmit((d) => {
      received = d;
    });
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    handler(ev);
    await waitUntilComplete();
    expect(received).toEqual({ u: "ok", p: "123456" });
    expect(ev.defaultPrevented).toBe(true);
  });

  it("handleSubmit 校验失败应调用 onInvalid", async () => {
    const form = createForm(
      { u: "" },
      { rules: { u: (v) => (v ? null : "必填") } },
    );
    let invalid = 0;
    const handler = form.handleSubmit(
      () => {},
      () => {
        invalid++;
      },
    );
    handler(new Event("submit", { bubbles: true, cancelable: true }));
    await waitUntilComplete();
    expect(invalid).toBe(1);
  });

  it("updateField 在 validateOn change 下应触发该字段校验", async () => {
    const form = createForm(
      { n: 0 },
      {
        rules: { n: (v) => (Number(v) > 0 ? null : "须大于 0") },
        validateOn: "change",
      },
    );
    form.updateField("n", 0);
    await waitUntilComplete();
    expect(form.errors.n).toBe("须大于 0");
    form.updateField("n", 1);
    await waitUntilComplete();
    expect(form.errors.n).toBe(null);
  });
}, { sanitizeOps: false, sanitizeResources: false });
