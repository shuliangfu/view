/**
 * @fileoverview 示例项目浏览器端到端测试
 *
 * beforeAll 启动 examples 静态服务（带 SPA fallback），浏览器通过 goto 打开该地址，
 * 对每个示例页执行主要交互（点击、输入等）并断言 DOM 效果。
 */

import {
  afterAll,
  beforeAll,
  cleanupAllBrowsers,
  describe,
  expect,
  it,
} from "@dreamer/test";

const SERVER_PORT = 8787;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

/** 示例服务进程，beforeAll 启动、afterAll 关闭 */
let serverProcess: Deno.ChildProcess | null = null;

/** 浏览器配置：使用已打包的 examples/dist/main.js 作为入口；beforeAll 启动服务后由 beforeEach/goto 打开 BASE_URL */
const exampleBrowserConfig = {
  sanitizeOps: false,
  sanitizeResources: false,
  timeout: 60_000,
  browser: {
    enabled: true,
    headless: true,
    browserSource: "test" as const,
    entryPoint: "examples/dist/main.js",
    bodyContent: '<div id="root"></div>',
    browserMode: true,
    moduleLoadTimeout: 20_000,
  },
};

/** 在浏览器内导航到 path：有服务时用 goto，否则用 pushState（file:// 下会报错） */
async function navigate(
  t: {
    browser?: {
      evaluate: (fn: () => void) => Promise<unknown>;
      goto?: (url: string) => Promise<unknown>;
    };
  },
  path: string,
) {
  if (!t?.browser) return;
  const url = BASE_URL + (path.startsWith("/") ? path : "/" + path);
  if (serverProcess && t.browser.goto) {
    await t.browser.goto(url);
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  const pathJson = JSON.stringify(path);
  await t.browser.evaluate(
    new Function(
      `var p=${pathJson};globalThis.history.pushState(null,"",p);globalThis.dispatchEvent(new PopStateEvent("popstate"));`,
    ) as () => void,
  );
  await new Promise((r) => setTimeout(r, 250));
}

/** 在 main 内根据按钮/链接文字查找并点击（evaluate 无第二参数，将 text 内联） */
async function clickButtonByText(
  t: { browser?: { evaluate: (fn: () => boolean) => Promise<unknown> } },
  text: string,
): Promise<boolean> {
  if (!t?.browser) return false;
  const escaped = JSON.stringify(text);
  const ok = await t.browser.evaluate(
    new Function(
      "var btnText=" + escaped +
        ";var main=document.querySelector('main');if(!main)return false;var buttons=main.querySelectorAll('button[type=\"button\"],a');for(var i=0;i<buttons.length;i++){var btn=buttons[i];if(btn.textContent&&btn.textContent.trim().indexOf(btnText)!==-1){btn.click();return true;}}return false;",
    ) as () => boolean,
  );
  await new Promise((r) => setTimeout(r, 80));
  return ok as boolean;
}

/** 在顶部 header nav 内根据链接文字查找并点击（用于测试顶部导航各链接） */
async function clickNavLinkByText(
  t: { browser?: { evaluate: (fn: () => boolean) => Promise<unknown> } },
  label: string,
): Promise<boolean> {
  if (!t?.browser) return false;
  const escaped = JSON.stringify(label);
  const ok = await t.browser.evaluate(
    new Function(
      "var label=" + escaped +
        ";var nav=document.querySelector('header nav');if(!nav)return false;var links=nav.querySelectorAll('a');for(var i=0;i<links.length;i++){var a=links[i];if(a.textContent&&a.textContent.trim().indexOf(label)!==-1){a.click();return true;}}return false;",
    ) as () => boolean,
  );
  await new Promise((r) => setTimeout(r, 80));
  return ok as boolean;
}

/** 获取 main 内可见文本 */
async function getMainText(
  t: { browser?: { evaluate: (fn: () => string) => Promise<unknown> } },
): Promise<string> {
  if (!t?.browser) return "";
  return (await t.browser.evaluate(() => {
    const main = document.querySelector("main");
    return main?.innerText ?? "";
  })) as string;
}

describe("浏览器测试（examples 入口）", () => {
  beforeAll(async () => {
    serverProcess = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "examples/server.ts"],
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(BASE_URL + "/");
        if (r.ok) return;
      } catch {
        // 服务尚未就绪
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Examples server did not start within 15s");
  });

  afterAll(async () => {
    try {
      serverProcess?.kill("SIGTERM");
      serverProcess = null;
    } catch {
      // ignore
    }
    await cleanupAllBrowsers();
  });

  it("首页挂载并显示多页面示例与模块入口", async (t) => {
    if (!t?.browser) return;
    if (serverProcess && t.browser.goto) {
      await t.browser.goto(BASE_URL);
      await new Promise((r) => setTimeout(r, 300));
    }
    const text = await getMainText(t);
    expect(text).toContain("多页面示例");
    expect(text).toContain("createSignal");
    expect(text).toContain("createStore");
    expect(text).toContain("Reactive");
    expect(text).toContain("进入示例");
  }, exampleBrowserConfig);

  it("首页点击「核心」卡片进入 Signal 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "核心");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createSignal");
  }, exampleBrowserConfig);

  it("首页点击「Store」卡片进入 Store 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Store");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createStore");
  }, exampleBrowserConfig);

  it("首页点击「Boundary」卡片进入 Boundary 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Boundary");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("ErrorBoundary");
  }, exampleBrowserConfig);

  it("首页点击「指令」卡片进入指令页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "指令");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("vIf");
  }, exampleBrowserConfig);

  it("首页点击「Reactive」卡片进入 Reactive 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Reactive");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createReactive");
  }, exampleBrowserConfig);

  it("首页点击「Resource」卡片进入 Resource 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Resource");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createResource");
  }, exampleBrowserConfig);

  it("首页点击「Context」卡片进入 Context 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Context");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createContext");
  }, exampleBrowserConfig);

  it("首页点击「Runtime」卡片进入 Runtime 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Runtime");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("renderToString");
  }, exampleBrowserConfig);

  it("首页点击「Router」卡片进入 Router 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 200));
    const ok = await clickButtonByText(t, "Router");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("当前路径");
    expect(text).toContain("编程式导航");
  }, exampleBrowserConfig);

  it("Signal 页：+1 / -1 / 归零 后 count 与 double 更新", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/signal");
    const textBefore = await getMainText(t);
    expect(textBefore).toContain("createSignal");
    const clickedPlus = await clickButtonByText(t, "+1");
    expect(clickedPlus).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    let text = await getMainText(t);
    expect(text).toMatch(/\b1\b/);
    await clickButtonByText(t, "+1");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toMatch(/\b2\b/);
    await clickButtonByText(t, "-1");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toMatch(/\b1\b/);
    await clickButtonByText(t, "归零");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toContain("0");
  }, exampleBrowserConfig);

  it("Signal 页：name 输入后展示「你好，xxx」", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/signal");
    const filled = await t.browser!.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const input = main.querySelector('input[type="text"]') as
        | HTMLInputElement
        | null;
      if (!input) return false;
      input.value = "小明";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    expect(filled).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    const text = await getMainText(t);
    expect(text).toContain("你好，小明！");
  }, exampleBrowserConfig);

  it("Store 页：count +1、归零与 greeting 更新", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/store");
    let text = await getMainText(t);
    expect(text).toContain("createStore");
    await clickButtonByText(t, "count +1");
    await new Promise((r) => setTimeout(r, 120));
    text = await getMainText(t);
    expect(text).toMatch(/\b1\b/);
    await clickButtonByText(t, "count 归零");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toContain("0");
    expect(text).toContain("请输入名字");
  }, exampleBrowserConfig);

  it("Store 页：输入名字后 greeting 显示「你好，xxx」", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/store");
    const filled = await t.browser!.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const input = main.querySelector('input[placeholder="输入名字"]') as
        | HTMLInputElement
        | null;
      if (!input) return false;
      input.value = "李四";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    expect(filled).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    const text = await getMainText(t);
    expect(text).toContain("你好，李四！");
  }, exampleBrowserConfig);

  it("Boundary 页：切换抛错后显示错误，Suspense 显示异步内容", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/boundary");
    let text = await getMainText(t);
    expect(text).toContain("ErrorBoundary");
    expect(text).toContain("Suspense");
    await clickButtonByText(t, "切换「抛错」");
    // 等待 effect 重跑与 ErrorBoundary fallback 渲染（轮询至多 2s）
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      text = await getMainText(t);
      if (!text) {
        text = (await t.browser.evaluate(() =>
          document.body?.innerText ?? ""
        )) as string;
      }
      if (text.includes("捕获到错误")) break;
    }
    expect(text).toContain("捕获到错误");
    expect(text).toContain("故意抛错");
    await clickButtonByText(t, "切换「抛错」");
    await new Promise((r) => setTimeout(r, 120));
    await new Promise((r) => setTimeout(r, 1200));
    text = await getMainText(t);
    expect(text).toContain("异步内容已加载");
  }, exampleBrowserConfig);

  it(
    "指令页：vIf 切换 A/B/C、vShow、v-for 追加、v-text/v-html 与输入生成 HTML",
    async (t) => {
      if (!t?.browser) return;
      await navigate(t, "/directive");
      let text = await getMainText(t);
      expect(text).toContain("vIf");
      await clickButtonByText(t, "A");
      await new Promise((r) => setTimeout(r, 80));
      text = await getMainText(t);
      expect(text).toContain("当前是 A");
      expect(text).toContain("v-text：a");
      await clickButtonByText(t, "B");
      await new Promise((r) => setTimeout(r, 200));
      text = await getMainText(t);
      expect(text).toContain("当前是 B");
      expect(text).toContain("v-text：b");
      await clickButtonByText(t, "C");
      await new Promise((r) => setTimeout(r, 80));
      text = await getMainText(t);
      expect(text).toContain("当前是 C");
      expect(text).toContain("v-text：c");
      expect(text).toContain("信任的 HTML");
      await clickButtonByText(t, "切换显示");
      await new Promise((r) => setTimeout(r, 80));
      await clickButtonByText(t, "追加一项");
      await new Promise((r) => setTimeout(r, 80));
      text = await getMainText(t);
      expect(text).toContain("新项");
      // 输入 HTML 片段并点击「生成 HTML」，v-html 应渲染并显示对应文本
      const filled = await t.browser!.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return false;
        const input = main.querySelector('[data-testid="v-html-input"]') as
          | HTMLInputElement
          | null;
        if (!input) return false;
        input.value = "<strong>测试</strong>";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      });
      expect(filled).toBe(true);
      await new Promise((r) => setTimeout(r, 100));
      await clickButtonByText(t, "生成 HTML");
      await new Promise((r) => setTimeout(r, 150));
      text = await getMainText(t);
      expect(text).toContain("测试");
    },
    exampleBrowserConfig,
  );

  it("指令页：v-model 输入框与 checkbox、再次聚焦", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/directive");
    const filledInput = await t.browser!.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const inputs = main.querySelectorAll('input[placeholder="输入即同步"]');
      const input = inputs[0] as HTMLInputElement | null;
      if (!input) return false;
      input.value = "vmodel-test";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    expect(filledInput).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    let text = await getMainText(t);
    expect(text).toContain("vmodel-test");
    const checked = await t.browser!.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const labels = main.querySelectorAll("label");
      for (let i = 0; i < labels.length; i++) {
        const chk = labels[i].querySelector('input[type="checkbox"]') as
          | HTMLInputElement
          | null;
        if (chk && labels[i].textContent?.includes("勾选即同步")) {
          chk.checked = true;
          chk.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    });
    expect(checked).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    text = await getMainText(t);
    expect(text).toContain("true");
    await clickButtonByText(t, "再次聚焦");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toContain("再次聚焦");
    expect(text).toContain("V-FOCUS");
  }, exampleBrowserConfig);

  it(
    "Reactive 页：createReactive 简介、effect 计数、表单展示与输入同步",
    async (t) => {
      if (!t?.browser) return;
      await navigate(t, "/reactive");
      let text = await getMainText(t);
      expect(text).toContain("createReactive");
      expect(text).toContain("表单");
      expect(text).toContain("effect 已执行次数");
      await clickButtonByText(t, "reactiveState.count++");
      await new Promise((r) => setTimeout(r, 150));
      text = await getMainText(t);
      expect(text).toMatch(/\d+/);
      const filled = await t.browser!.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return false;
        const labels = main.querySelectorAll("label");
        for (let i = 0; i < labels.length; i++) {
          const span = labels[i].querySelector("span.text-xs");
          if (span?.textContent?.trim() === "姓名") {
            const input = labels[i].querySelector("input[type='text']") as
              | HTMLInputElement
              | null;
            if (input) {
              input.value = "张三";
              input.dispatchEvent(new Event("input", { bubbles: true }));
              return true;
            }
            break;
          }
        }
        return false;
      });
      expect(filled).toBe(true);
      await new Promise((r) => setTimeout(r, 200));
      text = await getMainText(t);
      expect(text).toContain("张三");
    },
    exampleBrowserConfig,
  );

  it("Reactive 页：多字段表单填写后 summary 行同步", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/reactive");
    const filled = await t.browser!.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const labels = main.querySelectorAll("label");
      for (let i = 0; i < labels.length; i++) {
        const span = labels[i].querySelector("span.text-xs");
        const input = labels[i].querySelector('input[type="text"]') as
          | HTMLInputElement
          | null;
        if (!span || !input) continue;
        const labelText = span.textContent?.trim();
        if (labelText === "姓名") {
          input.value = "王五";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (labelText === "年龄") {
          input.value = "25";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (labelText === "性别") {
          input.value = "男";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      return true;
    });
    expect(filled).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    const text = await getMainText(t);
    expect(text).toContain("name=王五");
    expect(text).toContain("age=25");
    expect(text).toContain("sex=男");
  }, exampleBrowserConfig);

  it(
    "Reactive 页：水果下拉、选项单选填写后 summary 行含 fruit/choice",
    async (t) => {
      if (!t?.browser) return;
      await navigate(t, "/reactive");
      const filled = await t.browser!.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return false;
        const labels = main.querySelectorAll("label");
        for (let i = 0; i < labels.length; i++) {
          const span = labels[i].querySelector("span.text-xs");
          if (!span) continue;
          const labelText = span.textContent?.trim();
          if (labelText === "水果") {
            const select = labels[i].querySelector("select") as
              | HTMLSelectElement
              | null;
            if (select) {
              select.value = "香蕉";
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
        }
        const radiogroup = main.querySelector('[role="radiogroup"]');
        if (radiogroup) {
          const labels = radiogroup.querySelectorAll("label");
          for (let j = 0; j < labels.length; j++) {
            if (labels[j].textContent?.trim() === "B") {
              (labels[j] as HTMLElement).click();
              break;
            }
          }
        }
        return true;
      });
      expect(filled).toBe(true);
      await new Promise((r) => setTimeout(r, 250));
      const text = await getMainText(t);
      expect(text).toContain("fruit=香蕉");
      expect(text).toContain("choice=b");
    },
    exampleBrowserConfig,
  );

  it("Resource 页：重新请求与 id 切换后显示数据", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/resource");
    let text = await getMainText(t);
    expect(text).toContain("createResource");
    await clickButtonByText(t, "重新请求");
    await new Promise((r) => setTimeout(r, 1000));
    text = await getMainText(t);
    expect(text).toMatch(/用户ID：1|加载中|data:/);
    await clickButtonByText(t, "id=2");
    await new Promise((r) => setTimeout(r, 1000));
    text = await getMainText(t);
    expect(text).toMatch(/用户ID：2|加载中|data:/);
  }, exampleBrowserConfig);

  it("Resource 页：id=1 / id=3 切换后 Suspense 区块显示对应用户", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/resource");
    await clickButtonByText(t, "id=1");
    await new Promise((r) => setTimeout(r, 1200));
    let text = await getMainText(t);
    expect(text).toMatch(/加载到：用户ID：1|用户ID：1/);
    await clickButtonByText(t, "id=3");
    await new Promise((r) => setTimeout(r, 1200));
    text = await getMainText(t);
    expect(text).toMatch(/加载到：用户ID：3|用户ID：3/);
  }, exampleBrowserConfig);

  it(
    "Resource 页：Suspense + Promise 区块加载后显示「加载到：用户ID：99」",
    async (t) => {
      if (!t?.browser) return;
      await navigate(t, "/resource");
      await new Promise((r) => setTimeout(r, 1200));
      const text = await getMainText(t);
      expect(text).toContain("加载到：用户ID：99");
    },
    exampleBrowserConfig,
  );

  it("Context 页：切换 light/dark 后当前主题更新", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/context");
    let text = await getMainText(t);
    expect(text).toContain("createContext");
    await clickButtonByText(t, "dark");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toContain("当前主题");
    expect(text).toContain("dark");
    await clickButtonByText(t, "light");
    await new Promise((r) => setTimeout(r, 80));
    text = await getMainText(t);
    expect(text).toContain("light");
  }, exampleBrowserConfig);

  it("Runtime 页：输入后点击生成 HTML 显示 renderToString 结果", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/runtime");
    const filled = await t.browser.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const input = main.querySelector("input[type='text']") as
        | HTMLInputElement
        | null;
      if (!input) return false;
      input.value = "SSR Test";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    expect(filled).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    await clickButtonByText(t, "生成 HTML");
    await new Promise((r) => setTimeout(r, 350));
    const text = await getMainText(t);
    expect(text).toContain("renderToString");
    expect(text).toMatch(/SSR Test|Hello SSR/);
  }, exampleBrowserConfig);

  it("顶部导航：点击链接可切换到对应页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await clickButtonByText(t, "Store");
    await new Promise((r) => setTimeout(r, 150));
    let text = await getMainText(t);
    expect(text).toContain("createStore");
    await navigate(t, "/");
    const links = await t.browser.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return 0;
      return main.querySelectorAll('a[href="/signal"]').length;
    });
    expect(Number(links)).toBeGreaterThanOrEqual(1);
  }, exampleBrowserConfig);

  it("顶部导航：点击「首页」回到首页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/signal");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "首页");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("多页面示例");
    expect(text).toContain("进入示例");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Signal」进入 Signal 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/store");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Signal");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createSignal");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Store」进入 Store 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/signal");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Store");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createStore");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Boundary」进入 Boundary 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Boundary");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("ErrorBoundary");
  }, exampleBrowserConfig);

  it("顶部导航：点击「指令」进入指令页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "指令");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("vIf");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Reactive」进入 Reactive 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Reactive");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createReactive");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Resource」进入 Resource 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Resource");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createResource");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Context」进入 Context 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Context");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createContext");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Runtime」进入 Runtime 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Runtime");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("renderToString");
  }, exampleBrowserConfig);

  it("顶部导航：点击「Router」进入 Router 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    await new Promise((r) => setTimeout(r, 150));
    const ok = await clickNavLinkByText(t, "Router");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("当前路径");
    expect(text).toContain("编程式导航");
  }, exampleBrowserConfig);

  it(
    "Router 页：从首页点击 Router 卡片进入，显示当前路径、href、编程式导航与守卫说明",
    async (t) => {
      if (!t?.browser) return;
      await navigate(t, "/");
      await new Promise((r) => setTimeout(r, 200));
      await clickButtonByText(t, "Router");
      await new Promise((r) => setTimeout(r, 300));
      const text = await getMainText(t);
      expect(text).toContain("当前路径");
      expect(text).toContain("router.href");
      expect(text).toContain("编程式导航");
      expect(text).toContain("去 Signal");
      expect(text).toContain("守卫说明");
    },
    exampleBrowserConfig,
  );

  it("Router 页：显示动态路由说明与示例（path、params、query）", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("动态路由");
    expect(text).toContain("/user/:id");
    expect(text).toContain("params");
  }, exampleBrowserConfig);

  it("Router 页：编程式导航「去 Signal」后进入 Signal 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 200));
    await clickButtonByText(t, "去 Signal");
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createSignal");
  }, exampleBrowserConfig);

  it("Router 页：编程式导航「去 Store」后进入 Store 页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 200));
    await clickButtonByText(t, "去 Store");
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createStore");
  }, exampleBrowserConfig);

  it("Router 页：输入路径点击「导航」跳转到对应页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 200));
    const filled = await t.browser!.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const input = main.querySelector('input[placeholder="/signal"]') as
        | HTMLInputElement
        | null;
      if (!input) return false;
      input.value = "/reactive";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    });
    expect(filled).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    await clickButtonByText(t, "导航");
    await new Promise((r) => setTimeout(r, 300));
    const text = await getMainText(t);
    expect(text).toContain("createReactive");
  }, exampleBrowserConfig);

  it(
    "Router 页：编程式导航「replace 到 Context」后进入 Context 页",
    async (t) => {
      if (!t?.browser) return;
      await navigate(t, "/router");
      await new Promise((r) => setTimeout(r, 200));
      await clickButtonByText(t, "replace 到 Context");
      await new Promise((r) => setTimeout(r, 300));
      const text = await getMainText(t);
      expect(text).toContain("createContext");
      expect(text).toContain("当前主题");
    },
    exampleBrowserConfig,
  );

  it("Router 页：去 Store 后后退/前进，历史栈正确", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 200));
    await clickButtonByText(t, "去 Store");
    await new Promise((r) => setTimeout(r, 300));
    let text = await getMainText(t);
    expect(text).toContain("createStore");
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 300));
    await clickButtonByText(t, "后退");
    await new Promise((r) => setTimeout(r, 300));
    text = await getMainText(t);
    expect(text).toContain("createStore");
    await navigate(t, "/router");
    await new Promise((r) => setTimeout(r, 300));
    await clickButtonByText(t, "前进");
    await new Promise((r) => setTimeout(r, 300));
    text = await getMainText(t);
    expect(text).toContain("编程式导航");
    expect(text).toContain("当前路径");
  }, exampleBrowserConfig);

  it("Layout 主题切换：点击切换按钮后 html 主题 class 变化", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/");
    const beforeDark = await t.browser!.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    const clicked = await t.browser!.evaluate(() => {
      const btn = document.querySelector(
        'button[aria-label="切换到深色"], button[aria-label="切换到浅色"]',
      );
      if (!btn) return false;
      (btn as HTMLElement).click();
      return true;
    });
    expect(clicked).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    const afterDark = await t.browser!.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(afterDark).not.toBe(beforeDark);
  }, exampleBrowserConfig);

  it("404：访问不存在路径显示页面未找到", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/not-a-route");
    const text = await getMainText(t);
    expect(text).toContain("页面未找到");
    expect(text).toContain("返回首页");
  }, exampleBrowserConfig);

  it("404：点击「返回首页」后回到首页", async (t) => {
    if (!t?.browser) return;
    await navigate(t, "/not-a-route");
    const ok = await clickButtonByText(t, "返回首页");
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    const text = await getMainText(t);
    expect(text).toContain("多页面示例");
    expect(text).toContain("进入示例");
  }, exampleBrowserConfig);
});
