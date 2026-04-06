/**
 * @fileoverview `view/examples` 示例站点端到端浏览器测试（位于 view 包内，非 @dreamer/test 框架仓库）
 *
 * 覆盖各示例页的主要可点击/可输入交互（与源码中的按钮、Link、表单一致）。
 *
 * 流程：`generateRoutersFile` → 在 `examples/` 下 **`deno task dev`**（与手动启动一致）；
 * 端口策略对齐 **dweb `tests/e2e/browser-render-utils.ts`**：从 8787 起探测第一个空闲端口，经环境变量 **`PORT`**
 * 传给子进程（避免默认端口被占用时子进程立刻以 code=1 退出）。标准输出/错误 **inherit**，便于看到编译与绑定错误。
 *
 * 依赖：已安装 Chromium（`npx playwright install chromium`）。
 * 运行：`deno task test:e2e` 或 `deno test -A tests/e2e/examples-e2e.test.ts`
 */

import {
  connect,
  createCommand,
  dirname,
  execPath,
  fromFileUrl,
  getEnvAll,
  platform,
  resolve,
} from "@dreamer/runtime-adapter";
import type { SpawnedProcess } from "@dreamer/runtime-adapter";
import {
  afterAll,
  beforeAll,
  cleanupAllBrowsers,
  describe,
  expect,
  it,
} from "@dreamer/test";
import type { TestContext } from "@dreamer/test";
import { generateRoutersFile } from "../../src/server/core/routers.ts";

/** 带已初始化 Playwright 的测试上下文（E2E 用例前提） */
type E2EBrowserContext = TestContext & {
  browser: NonNullable<TestContext["browser"]>;
};

/**
 * 断言当前用例已启用浏览器：收窄类型，避免 `t` / `t.browser` 可选告警
 * @param t 运行器注入的上下文
 */
function assertBrowserE2E(
  t: TestContext | undefined,
): asserts t is E2EBrowserContext {
  if (!t?.browser) {
    throw new Error("view/examples E2E：本用例需要 browser 测试上下文");
  }
}

/** Playwright `Page` 快捷方式 */
function pw(t: E2EBrowserContext) {
  return t.browser.page;
}

/**
 * 与 `examples/src/views/home/index.tsx` 中 `HOME_MODULES` 的 `href` 顺序一致
 * （用于首页每张模块卡片的导航验收）
 */
const HOME_MODULE_HREFS = [
  "/signal",
  "/store",
  "/control-flow",
  "/boundary",
  "/resource",
  "/router",
  "/route-guard",
  "/context",
  "/form",
  "/portal",
  "/runtime",
  "/transition",
  "/performance",
  "/gallery",
  "/layout-nested/inner",
] as const;

/** 本文件所在目录 */
const THIS_DIR = dirname(fromFileUrl(import.meta.url));
/** `view/examples` 根目录（相对本文件 `tests/e2e` → `../../examples`） */
const VIEW_EXAMPLES_ROOT = resolve(THIS_DIR, "../../examples");

/** 与 `examples/view.config.ts` 默认 dev 端口一致；E2E 从此端口起探测空闲端口（见 dweb e2e） */
const EXAMPLES_DEV_HOST = "127.0.0.1";
const EXAMPLES_DEV_PREFERRED_PORT = 8787;

/** 实际绑定端口（`beforeAll` 内赋值，与子进程 `PORT` 一致） */
let examplesDevPort = EXAMPLES_DEV_PREFERRED_PORT;

/** 单用例超时：首测含 dev 冷编译 + 起服 + 冷启动 Chromium */
const E2E_TIMEOUT_MS = 360_000;

/** 开发服 base URL（无尾斜杠，`beforeAll` 赋值） */
let examplesBaseUrl = "";
/** `deno task dev` 子进程（`afterAll` 中结束） */
let examplesDevChild: SpawnedProcess | null = null;

/**
 * 检测端口是否已有监听（与 dweb `browser-render-utils` 一致）
 * @param host 主机
 * @param port 端口
 */
async function isPortInUse(host: string, port: number): Promise<boolean> {
  try {
    const conn = await connect({ host, port });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * 从起始端口起顺序查找第一个未被占用的端口，保证与子进程传入的 `PORT` 一致
 * @param host 主机
 * @param startPort 首选端口（通常为 8787）
 * @param maxAttempts 最大尝试次数
 */
async function findAvailablePort(
  host: string,
  startPort: number,
  maxAttempts = 50,
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (!(await isPortInUse(host, port))) return port;
  }
  throw new Error(
    `e2e: 从端口 ${startPort} 起尝试 ${maxAttempts} 次均被占用，无法启动 examples dev`,
  );
}

/**
 * 轮询直到 `deno task dev` 对 `/` 返回**预期壳 HTML**（不仅要求 HTTP 2xx，避免端口上另有服务也返回 200）。
 * 首次冷编译可能较慢，超时见调用方。
 *
 * @param baseUrl 无尾斜杠，例如 `http://127.0.0.1:8787`
 * @param timeoutMs 超时毫秒数
 */
async function waitForExamplesDevReady(
  baseUrl: string,
  timeoutMs: number,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/`;
  const start = Date.now();
  const pollInterval = 500;
  let lastErr: string | undefined;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
      } else {
        const body = await res.text();
        const hasRoot = body.includes('id="root"') ||
          body.includes("id='root'");
        /** 与 `examples/src/assets/index.html` 中 `/main.js` 一致 */
        const hasEntry = body.includes("main.js") || body.includes("main.tsx");
        if (!hasRoot) {
          lastErr = "响应 HTML 缺少 #root（可能非 view examples）";
        } else if (!hasEntry) {
          lastErr = "响应未包含主入口脚本（main.js）";
        } else {
          const elapsedMs = Date.now() - start;
          console.log(
            `[view e2e] examples dev 已就绪: GET ${url}（等待 ${elapsedMs}ms）`,
          );
          return;
        }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(
    `examples 开发服在 ${timeoutMs}ms 内未就绪: ${url}（最后错误: ${
      lastErr ?? "unknown"
    }）。若子进程已退出，请查看上方 inherit 输出的日志。`,
  );
}

/**
 * 等待示例壳挂载：`#root` 且（根 `nav` 或 `data-demo-layout`）
 *
 * 注意：`t.browser.waitFor` 底层为 Playwright `waitForFunction`，回调在**页面上下文**执行，
 * 不能引用外层闭包变量（否则会报 `expectRootNav is not defined`）。因此按选项拆成两条无闭包谓词。
 *
 * @param t 测试上下文
 * @param options.expectRootNav 为 false 时不强制顶栏（standalone 页，仅需 `#root`）
 */
async function waitExamplesShell(
  t: TestContext | undefined,
  options: { expectRootNav?: boolean } = {},
): Promise<void> {
  if (!t?.browser) {
    throw new Error("waitExamplesShell: 未提供浏览器上下文");
  }
  const expectRootNav = options.expectRootNav !== false;
  if (expectRootNav) {
    await t.browser.waitFor(
      () => {
        const root = document.getElementById("root");
        if (!root) return false;
        if (document.querySelector("[data-demo-layout]")) return true;
        if (document.querySelector("nav")) return true;
        return false;
      },
      { timeout: 90_000 },
    );
  } else {
    // standalone：不强制顶栏 nav，有 #root 即视为可测（与原先 !expectRootNav 分支一致）
    await t.browser.waitFor(
      () => document.getElementById("root") !== null,
      { timeout: 90_000 },
    );
  }
}

/**
 * `goto` 到示例站 path 并等待壳就绪
 * @param t 测试上下文
 * @param path 以 `/` 开头
 * @param shellOpts 传给 `waitExamplesShell`
 */
async function gotoExamplesPath(
  t: TestContext | undefined,
  path: string,
  shellOpts?: { expectRootNav?: boolean },
): Promise<void> {
  if (!t?.browser) {
    throw new Error("gotoExamplesPath: 未提供浏览器上下文");
  }
  const url = `${examplesBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  await t.browser.goto(url);
  await waitExamplesShell(t, shellOpts);
}

describe("@dreamer/view examples 站点 E2E（浏览器）", () => {
  beforeAll(async () => {
    await generateRoutersFile(VIEW_EXAMPLES_ROOT);

    // 与 dweb e2e 一致：先占可用端口再传给子进程，避免 8787 已被占用时 dev 立刻退出（code=1）
    examplesDevPort = await findAvailablePort(
      EXAMPLES_DEV_HOST,
      EXAMPLES_DEV_PREFERRED_PORT,
    );
    // 与 examples/view.config 的 jsx: "runtime" 一致（构建管线不再使用 view-root-compile）。
    const subprocessEnv: Record<string, string> = {
      ...getEnvAll(),
      PORT: String(examplesDevPort),
    };

    // 与手动 `cd examples && deno task dev` 一致；inherit 子进程日志便于排查启动失败
    const isBun = execPath().includes("bun");
    const devCmd = createCommand(execPath(), {
      args: isBun ? ["run", "dev"] : ["task", "dev"],
      cwd: VIEW_EXAMPLES_ROOT,
      env: subprocessEnv,
      stdout: "inherit",
      stderr: "inherit",
    });
    examplesDevChild = devCmd.spawn();

    const maxWait = platform() === "windows" ? 120_000 : 180_000;
    examplesBaseUrl = `http://${EXAMPLES_DEV_HOST}:${examplesDevPort}`.replace(
      /\/$/,
      "",
    );
    await waitForExamplesDevReady(examplesBaseUrl, maxWait);
    // 与 dweb basic 套件类似：就绪后再稍等，减轻首包与 HMR 竞态
    await new Promise((r) => setTimeout(r, 2000));
  });

  afterAll(async () => {
    if (examplesDevChild) {
      try {
        examplesDevChild.kill(9);
      } catch {
        /* ignore */
      }
      try {
        await examplesDevChild.status;
      } catch {
        /* ignore */
      }
      examplesDevChild = null;
    }
    await cleanupAllBrowsers();
  });

  it("[首页] Hero、顶栏、主题切换、GitHub、首页模块卡片网格导航", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/");
    expect(
      await t.browser.evaluate(() =>
        document.body.innerText.includes("更小，更快")
      ),
    ).toBe(true);
    expect(
      await t.browser.evaluate(() =>
        document.body.innerText.includes("@dreamer/view")
      ),
    ).toBe(true);

    /** 主题按钮仅有 title，Playwright 用 name 匹配 title；waitFor 谓词必须在页面内自洽，不可闭包引用 hadDark */
    const hadDark = await t.browser.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    if (hadDark) {
      await pw(t).getByRole("button", { name: "切换到浅色" }).click();
      await t.browser.waitFor(
        () => !document.documentElement.classList.contains("dark"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "切换到深色" }).click();
    } else {
      await pw(t).getByRole("button", { name: "切换到深色" }).click();
      await t.browser.waitFor(
        () => document.documentElement.classList.contains("dark"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "切换到浅色" }).click();
    }

    const gh = pw(t).locator('a[title="view 模板引擎 — GitHub"]');
    const [popup] = await Promise.all([
      pw(t).waitForEvent("popup"),
      gh.click(),
    ]);
    await popup.close();

    for (const href of HOME_MODULE_HREFS) {
      await gotoExamplesPath(t, "/");
      /**
       * 顶栏下拉里也有同 href 的 Link（DOM 更早），`.first()` 会点到被遮挡的 menuitem。
       * 模块卡片仅在 `main` 内，与 `examples/src/views/home/index.tsx` 网格一致。
       */
      await pw(t).locator("main").locator(`a[href="${href}"]`).click();
      /** pathname 比较在 Playwright 侧执行，避免 waitForFunction 无法捕获循环变量 href */
      await pw(t).waitForURL((u: URL) => u.pathname === href, {
        timeout: 25_000,
      });
    }
  }, { timeout: E2E_TIMEOUT_MS });

  it("[首页→导航] 顶栏「示例」下拉进入 Gallery", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/");
    /**
     * 下拉靠 `group-hover`：只 hover 按钮时鼠标移向菜单会失 hover 导致菜单消失。
     * 对整块 `li.group/list` hover，且菜单项为 `role="menuitem"`（见 `_layout.tsx`）。
     */
    const examplesGroup = pw(t).locator("header nav li").filter({
      has: pw(t).getByRole("button", { name: "示例" }),
    });
    await examplesGroup.hover();
    await examplesGroup.getByRole("menuitem", {
      name: "Gallery",
      exact: true,
    }).click();
    await t.browser.waitFor(
      () =>
        globalThis.location.pathname === "/gallery" &&
        document.body.innerText.includes("交互画廊"),
      { timeout: 25_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[gallery] 三张缩略图、预览、缩放、关闭", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/gallery");
    for (const title of ["宁静峡谷", "晨雾森林", "翠绿之径"]) {
      await pw(t).getByText(title, { exact: true }).first().click();
      // 预览层为 fixed 全屏遮罩 + 关闭按钮；关闭后整块卸载，用 detached 避免误用正文里的「✕」等字符
      const previewLayer = pw(t).locator("div.fixed.inset-0").filter({
        has: pw(t).getByRole("button", { name: "✕", exact: true }),
      });
      await previewLayer.waitFor({ state: "visible", timeout: 15_000 });
      await t.browser.waitFor(
        () => document.body.innerText.includes("%"),
        { timeout: 15_000 },
      );
      await pw(t).getByRole("button", { name: "＋", exact: true }).click();
      await pw(t).getByRole("button", { name: "－", exact: true }).click();
      await pw(t).getByRole("button", { name: "✕", exact: true }).click();
      await previewLayer.waitFor({ state: "detached", timeout: 10_000 });
    }
  }, { timeout: E2E_TIMEOUT_MS });

  it("[signal] 增减重置计数、双向绑定输入", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/signal");
    await pw(t).getByRole("button", { name: "增加计数" }).click();
    await pw(t).getByRole("button", { name: "增加计数" }).click();
    let text = await t.browser.evaluate(() => document.body.innerText);
    expect(text).toMatch(/当前值[\s\S]*2/);
    await pw(t).getByRole("button", { name: "减少计数" }).click();
    text = await t.browser.evaluate(() => document.body.innerText);
    expect(text).toMatch(/当前值[\s\S]*1/);
    await pw(t).getByRole("button", { name: "重置" }).click();
    text = await t.browser.evaluate(() => document.body.innerText);
    expect(text).toMatch(/当前值[\s\S]*0/);
    await pw(t).getByPlaceholder("在此输入...").fill("E2E");
    await t.browser.waitFor(
      () => document.body.innerText.includes("你好，E2E"),
      { timeout: 10_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[performance] createSelector 切换、表单填写、打印、重置", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/performance");
    /** aria-label 为「选择项 N」；getByLabel("选择项 7") 会误匹配 70–79，须 exact */
    await pw(t).getByRole("button", { name: "选择项 7", exact: true }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("当前选中: 7"),
      { timeout: 15_000 },
    );
    await pw(t).getByRole("button", { name: "选择项 0", exact: true }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("当前选中: 0"),
      { timeout: 15_000 },
    );
    // 示例中 label 与控件未用 htmlFor/id 关联，accessible name 不可靠；在 createForm 区块内按结构定位
    const perfFormSection = pw(t).locator("section").filter({
      has: pw(t).getByRole("heading", {
        name: "表单颗粒度演示 (createForm)",
      }),
    });
    await perfFormSection.locator("input").first().fill("e2e-user");
    await perfFormSection.getByPlaceholder("example@dreamer.com").fill(
      "e2e@test.dev",
    );
    await perfFormSection.locator("textarea").first().fill("e2e bio");
    await pw(t).getByRole("button", { name: "打印数据" }).click();
    await pw(t).getByRole("button", { name: "重置" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("dreamer"),
      { timeout: 10_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[form] 各字段、提交成功 toast、重置", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/form");
    await pw(t).getByPlaceholder("请输入用户名...").fill("reg-e2e");
    await pw(t).getByPlaceholder("请输入密码...").fill("secret");
    await pw(t).getByPlaceholder("example@dreamer.com").fill("r@e2e.dev");
    await pw(t).getByPlaceholder("写点什么...").fill("hello e2e");
    await pw(t).getByRole("button", { name: "立即提交" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("提交成功"),
      { timeout: 15_000 },
    );
    await pw(t).getByRole("button", { name: "重置" }).click();
  }, { timeout: E2E_TIMEOUT_MS });

  it("[store] 用户钩子、昵称、待办、清除持久化刷新", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/store");
    await pw(t).getByRole("button", { name: /Demo User/ }).click();
    /**
     * 视图为 `${name} (${role.toUpperCase()})`，故为 `Demo User (USER)`，无连续子串 `DEMO USER`。
     */
    await t.browser.waitFor(
      () =>
        document.body.innerText.includes("Demo User") &&
        document.body.innerText.includes("(USER)"),
      { timeout: 10_000 },
    );
    await pw(t).getByRole("button", { name: /admin/ }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("ADMIN"),
      { timeout: 10_000 },
    );
    await pw(t).getByRole("button", { name: "incrementLoginCount()" }).click();
    await pw(t).getByRole("button", { name: "logoutUser()" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("GUEST"),
      { timeout: 10_000 },
    );
    const nick = pw(t).getByPlaceholder("新昵称 → setUserName");
    await nick.fill("NickE2E");
    await nick.press("Enter");
    /** 展示为 `userStore.name` 原文 + `(ROLE)`，昵称为 NickE2E 非全大写 */
    await t.browser.waitFor(
      () => document.body.innerText.includes("NickE2E"),
      { timeout: 10_000 },
    );
    await pw(t).locator("li").filter({ hasText: "掌握 createStore" }).click();
    /**
     * 框架可能对 class 做运行时拼接，getAttribute("class") 不一定含 `line-through`；
     * 待办完成时 checkbox 会为 checked，更稳定。
     */
    await t.browser.waitFor(
      () => {
        const items = globalThis.document.querySelectorAll("li");
        for (let i = 0; i < items.length; i++) {
          const li = items[i];
          if (!(li.textContent ?? "").includes("掌握 createStore")) continue;
          const cb = li.querySelector(
            "input[type='checkbox'], input[type=checkbox]",
          );
          if (cb instanceof HTMLInputElement && cb.checked) return true;
        }
        return false;
      },
      { timeout: 15_000 },
    );
    const addTodo = pw(t).getByPlaceholder("添加新的待办...");
    await addTodo.fill("E2E todo");
    await addTodo.press("Enter");
    await t.browser.waitFor(
      () => document.body.innerText.includes("E2E todo"),
      { timeout: 10_000 },
    );

    await Promise.all([
      pw(t).waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      }),
      pw(t).getByRole("button", { name: /清除用户持久化/ }).click(),
    ]);
    /**
     * 刷新后仅用 Playwright locator 等待壳层，避免部分环境下 waitForFunction 默认 30s 与闭包差异。
     */
    await pw(t).locator("#root").waitFor({
      state: "attached",
      timeout: 90_000,
    });
    await pw(t).locator("header nav").waitFor({
      state: "visible",
      timeout: 90_000,
    });
    expect(await t.browser.evaluate(() => globalThis.location.pathname)).toBe(
      "/store",
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[boundary] 引爆错误、尝试重置、正常区域文案", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/boundary");
    await pw(t).getByRole("button", { name: "引爆错误！" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("组件已崩溃"),
      { timeout: 15_000 },
    );
    await pw(t).getByRole("button", { name: "尝试重置" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("危险区域"),
      { timeout: 15_000 },
    );
    expect(
      await t.browser.evaluate(() =>
        document.body.innerText.includes("正常区域")
      ),
    ).toBe(true);
  }, { timeout: E2E_TIMEOUT_MS });

  it("[context] 登录为管理员、注销", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/context");
    await pw(t).getByRole("button", { name: "登录为管理员" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("Admin"),
      { timeout: 10_000 },
    );
    expect(
      await t.browser.evaluate(() =>
        document.body.innerText.includes("superuser")
      ),
    ).toBe(true);
    await pw(t).getByRole("button", { name: "注销" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("Guest"),
      { timeout: 10_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it(
    "[control-flow] Switch/For/Index/Show/Dynamic/Context 全交互",
    async (t) => {
      assertBrowserE2E(t);
      await gotoExamplesPath(t, "/control-flow");
      await pw(t).getByRole("button", { name: "显示 B" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("选项 B 已激活"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "隐藏全部" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("目前没有任何匹配项"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "显示 A" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("选项 A 已激活"),
        { timeout: 10_000 },
      );

      await pw(t).locator("li").filter({ hasText: "香蕉" }).getByRole(
        "button",
        {
          name: "删除",
        },
      ).click();
      await t.browser.waitFor(
        () => !document.body.innerText.includes("香蕉"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "增加西瓜" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("西瓜"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "重置列表" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("香蕉"),
        { timeout: 10_000 },
      );

      await pw(t).getByRole("button", { name: "全部增加 5 分" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("93"),
        { timeout: 10_000 },
      );

      await pw(t).getByRole("button", { name: "关闭面板" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("开启面板"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "开启面板" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("内部面板"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: /切换标签/ }).click();
      await pw(t).getByRole("button", { name: /切换标签/ }).click();

      await pw(t).getByRole("button", { name: "登录为管理员" }).click();
      await t.browser.waitFor(
        () => document.body.innerText.includes("superuser"),
        { timeout: 10_000 },
      );
      await pw(t).getByRole("button", { name: "注销" }).click();
      // 避免仅匹配页面其它「none」（如 Dynamic 标签），断言 Context 区 Consumer 文案
      await t.browser.waitFor(
        () =>
          /用户名:\s*Guest/.test(document.body.innerText) &&
          /角色:\s*none/.test(document.body.innerText),
        { timeout: 10_000 },
      );
    },
    { timeout: E2E_TIMEOUT_MS },
  );

  it("[resource] ID1/2 成功、ID3 失败与重试、切回 ID1", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/resource");
    await pw(t).getByRole("button", { name: "ID: 1" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("用户 1"),
      { timeout: 25_000 },
    );
    await pw(t).getByRole("button", { name: "ID: 2" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("用户 2"),
      { timeout: 25_000 },
    );
    await pw(t).getByRole("button", { name: "ID: 3" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("加载失败"),
      { timeout: 25_000 },
    );
    await pw(t).getByRole("button", { name: "尝试重试" }).click();
    await pw(t).getByRole("button", { name: "ID: 1" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("用户 1"),
      { timeout: 25_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[portal] 打开模态框、我知道了", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/portal");
    await pw(t).getByRole("button", { name: "打开全局模态框" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("Portal Modal"),
      { timeout: 15_000 },
    );
    await pw(t).getByRole("button", { name: "我知道了" }).click();
    await t.browser.waitFor(
      () => !document.body.innerText.includes("Portal Modal"),
      { timeout: 10_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[transition] 常规/慢速切换与异步就绪文案", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/transition");
    await pw(t).getByRole("button", { name: "慢速加载" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("正在后台加载"),
      { timeout: 20_000 },
    );
    await t.browser.waitFor(
      () => document.body.innerText.includes("异步内容已就绪"),
      { timeout: 25_000 },
    );
    await pw(t).getByRole("button", { name: "常规内容" }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("常规首页展示"),
      { timeout: 15_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[runtime] 修改输入再生成 SSR 片段", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/runtime");
    await pw(t).getByPlaceholder("输入要 SSR 的内容...").fill("E2E-SSR");
    await pw(t).getByRole("button", { name: /立即生成 HTML/ }).click();
    await t.browser.waitFor(
      () => document.body.innerText.includes("E2E-SSR"),
      { timeout: 15_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it(
    "[router] Link、navigate、replace、back/forward、动态段与 query",
    async (t) => {
      assertBrowserE2E(t);
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("link", { name: /返回首页/ }).click();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/",
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("link", { name: /性能演示/ }).click();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/performance",
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("link", { name: /Store \+ query/ }).click();
      await t.browser.waitFor(
        () =>
          globalThis.location.pathname === "/store" &&
          globalThis.location.search.includes("from=router-demo"),
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("button", { name: /navigate\("\/store"\)/ })
        .click();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/store",
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("button", { name: /replace/ }).click();
      await t.browser.waitFor(
        () =>
          globalThis.location.pathname === "/resource" &&
          globalThis.location.search.includes("replaced=1"),
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("button", { name: /navigate\("\/store"\)/ })
        .click();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/store",
        { timeout: 20_000 },
      );
      await pw(t).goBack();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/router",
        { timeout: 20_000 },
      );
      await pw(t).goForward();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/store",
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("link", {
        name: "路由卫士演示",
        exact: true,
      }).click();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/route-guard",
        { timeout: 20_000 },
      );
      await gotoExamplesPath(t, "/router");
      await pw(t).getByRole("link", { name: "/router/user/alice" }).click();
      await t.browser.waitFor(
        () =>
          globalThis.location.pathname.includes("alice") &&
          document.body.innerText.includes("alice"),
        { timeout: 20_000 },
      );
      await pw(t).getByRole("link", { name: /bob\?from=demo/ }).click();
      await t.browser.waitFor(
        () =>
          document.body.innerText.includes("bob") &&
          document.body.innerText.includes("demo"),
        { timeout: 20_000 },
      );
      await pw(t).getByRole("button", { name: /charlie/ }).click();
      await t.browser.waitFor(
        () => globalThis.location.pathname.includes("charlie"),
        { timeout: 20_000 },
      );
      await pw(t).getByRole("link", { name: /返回路由总览/ }).click();
      await t.browser.waitFor(
        () => globalThis.location.pathname === "/router",
        { timeout: 20_000 },
      );
    },
    { timeout: E2E_TIMEOUT_MS },
  );

  it("[route-guard] Link 与 navigate 拦截、对比区 Link", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/route-guard");
    await pw(t).getByRole("checkbox").check();
    await pw(t).getByRole("link", { name: /Link → \/form/ }).click();
    await new Promise((r) => setTimeout(r, 400));
    expect(await t.browser.evaluate(() => globalThis.location.pathname)).toBe(
      "/route-guard",
    );
    await pw(t).getByRole("button", { name: /navigate\("\/form"\)/ }).click();
    await new Promise((r) => setTimeout(r, 400));
    expect(await t.browser.evaluate(() => globalThis.location.pathname)).toBe(
      "/route-guard",
    );
    await pw(t).getByRole("checkbox").uncheck();
    await pw(t).getByRole("link", { name: "→ 路由总览" }).click();
    await t.browser.waitFor(
      () => globalThis.location.pathname === "/router",
      { timeout: 20_000 },
    );
    await gotoExamplesPath(t, "/route-guard");
    await pw(t).getByRole("link", { name: "→ Store 演示" }).click();
    await t.browser.waitFor(
      () => globalThis.location.pathname === "/store",
      { timeout: 20_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[layout-nested/inner] 标记与三条 Link", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/layout-nested/inner");
    expect(
      await t.browser.evaluate(() =>
        document.querySelector('[data-demo-layout="layout-nested-outer"]') !==
          null
      ),
    ).toBe(true);
    await pw(t).getByRole("link", { name: /不继承/ }).click();
    await waitExamplesShell(t, { expectRootNav: false });
    expect(await t.browser.evaluate(() => globalThis.location.pathname)).toBe(
      "/layout-nested/standalone",
    );
    await gotoExamplesPath(t, "/layout-nested/inner");
    await pw(t).getByRole("link", { name: /Gallery/ }).click();
    await t.browser.waitFor(
      () => globalThis.location.pathname === "/gallery",
      { timeout: 20_000 },
    );
    await gotoExamplesPath(t, "/layout-nested/inner");
    await pw(t).getByRole("link", { name: "回首页" }).click();
    await t.browser.waitFor(
      () => globalThis.location.pathname === "/",
      { timeout: 20_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[layout-nested/standalone] 壳与两条 Link", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/layout-nested/standalone", {
      expectRootNav: false,
    });
    expect(
      await t.browser.evaluate(() =>
        document.querySelector(
          '[data-demo-layout="layout-standalone-no-inherit"]',
        ) !==
          null
      ),
    ).toBe(true);
    await pw(t).getByRole("link", { name: /多层继承/ }).click();
    await t.browser.waitFor(
      () => globalThis.location.pathname === "/layout-nested/inner",
      { timeout: 20_000 },
    );
    await gotoExamplesPath(t, "/layout-nested/standalone", {
      expectRootNav: false,
    });
    await pw(t).getByRole("link", { name: /回首页/ }).click();
    await t.browser.waitFor(
      () => globalThis.location.pathname === "/",
      { timeout: 20_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });

  it("[404] 未知路径", async (t) => {
    assertBrowserE2E(t);
    await gotoExamplesPath(t, "/no-such-examples-path-e2e");
    await t.browser.waitFor(
      () => document.body.innerText.includes("页面未找到"),
      { timeout: 30_000 },
    );
  }, { timeout: E2E_TIMEOUT_MS });
}, {
  sanitizeOps: false,
  sanitizeResources: false,
  browser: {
    enabled: true,
    headless: true,
    dumpio: true,
    browserSource: "test",
    reuseBrowser: true,
  },
});
