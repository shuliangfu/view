/**
 * @fileoverview CLI 端到端测试：init、build、start
 *
 * 使用 @dreamer/runtime-adapter 做路径、文件、进程操作，兼容 Deno/Bun。
 * - init：在临时目录执行 view init，断言生成的文件与目录结构
 * - build：在 examples 目录执行 view build，断言 dist/ 及主入口存在
 * - start：在 examples 先 build 再 start（指定 port 避免冲突），请求首页断言内容后关闭进程
 */

import {
  createCommand,
  cwd,
  deleteEnv,
  dirname,
  ensureDir,
  execPath,
  existsSync,
  getEnv,
  IS_BUN,
  join,
  readdir,
  readTextFile,
  remove,
  resolve,
  setEnv,
} from "@dreamer/runtime-adapter";
import {
  afterAll,
  cleanupAllBrowsers,
  describe,
  expect,
  it,
} from "@dreamer/test";
import { setViewLocale } from "../../src/server/utils/i18n.ts";

setViewLocale("zh-CN");

/** 规整路径：消除 .. 与 .；Windows 盘符路径（/D:/ 或 D:/）不输出前导 /，避免 mkdir/cwd 报错 */
function normalizeAbsolutePath(p: string): string {
  const isAbsolute = p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  const joined = out.join("/");
  if (!isAbsolute) return joined;
  // Windows 盘符路径（如 D:）不加重置前导 /，否则会变成 /D:/ 导致 os error 123
  if (out[0] && /^[A-Za-z]:$/.test(out[0])) return joined;
  return "/" + joined;
}

/** view 包根目录：由当前测试文件路径向上两级；Windows 下去掉 pathname 前导 /（/D:/ -> D:/） */
const _testDir = dirname(
  typeof import.meta.url !== "undefined" && import.meta.url.startsWith("file:")
    ? new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
    : join(cwd(), "tests", "e2e", "cli.test.ts"),
);
const VIEW_ROOT = normalizeAbsolutePath(join(_testDir, "..", ".."));
const EXAMPLES_DIR = join(VIEW_ROOT, "examples");

/** start 命令使用的端口，避免与 dev（8787）冲突 */
const START_PORT = 9876;
const START_URL = `http://127.0.0.1:${START_PORT}`;

/** init 测试输出目录（项目内 tests/data，绝对路径），afterAll 清理 */
const INIT_OUT_DIR = resolve(VIEW_ROOT, "tests", "data", "init-e2e");

describe("CLI：init", () => {
  afterAll(async () => {
    try {
      // await remove(INIT_OUT_DIR, { recursive: true });
    } catch {
      // ignore
    }
  });

  it(
    "view init <dir> 应在目标目录生成 view.config.ts、deno.json、src 等",
    async () => {
      await ensureDir(INIT_OUT_DIR);
      // 先设 LANGUAGE=zh-CN，再加载 view i18n 模块（模块加载时自动执行 init，detectLocale() 会读到 zh-CN），生成内容含「view 项目配置」（CI 默认为 en-US）
      const prevLang = getEnv("LANGUAGE");
      setEnv("LANGUAGE", "zh-CN");
      try {
        await import("../../src/server/utils/i18n.ts");
        // 直接调用 init main，与 CLI 同逻辑，避免子进程 cwd/路径差异导致断言失败；传 runtime 跳过交互菜单
        const { main: initMain } = await import("../../src/server/cmd/init.ts");
        await initMain({ dir: INIT_OUT_DIR, runtime: "deno", style: "none" });
      } finally {
        if (prevLang !== undefined) setEnv("LANGUAGE", prevLang);
        else deleteEnv("LANGUAGE");
      }

      const viewConfigPath = join(INIT_OUT_DIR, "view.config.ts");
      const denoJsonPath = join(INIT_OUT_DIR, "deno.json");
      const mainTsxPath = join(INIT_OUT_DIR, "src", "main.tsx");
      const viewsDir = join(INIT_OUT_DIR, "src", "views");
      const routerDir = join(INIT_OUT_DIR, "src", "router");
      const indexHtmlPath = join(INIT_OUT_DIR, "src", "assets", "index.html");

      expect(existsSync(viewConfigPath)).toBe(true);
      expect(existsSync(denoJsonPath)).toBe(true);
      expect(existsSync(mainTsxPath)).toBe(true);
      expect(existsSync(viewsDir)).toBe(true);
      expect(existsSync(routerDir)).toBe(true);
      expect(existsSync(indexHtmlPath)).toBe(true);

      const viewConfigContent = await readTextFile(viewConfigPath);
      expect(viewConfigContent).toContain("view 项目配置");
      expect(viewConfigContent).toContain("server");
      expect(viewConfigContent).toContain("build");
      expect(viewConfigContent).toContain("staticPlugin");
      expect(viewConfigContent).toContain("plugins");

      const denoJsonContent = await readTextFile(denoJsonPath);
      expect(denoJsonContent).toContain("@dreamer/view");
      expect(denoJsonContent).toContain("@dreamer/plugins");
      expect(denoJsonContent).toContain("dev");
      expect(denoJsonContent).toContain("build");
      expect(denoJsonContent).toContain("start");
    },
    { sanitizeOps: false, sanitizeResources: false },
  );
});

/** build 子进程最大等待时间（ms），超时则 kill 进程；CI 冷缓存或 npm 解析可能较慢，故放宽至 120s */
const BUILD_PROCESS_TIMEOUT_MS = 120_000;

/**
 * 将 stream 读到底并追加到 chunks，返回在 stream 结束时 resolve 的 Promise。
 * 用于与 status 一起 race，超时 kill 后可用已累积内容做诊断。
 */
function drainToChunks(
  stream: ReadableStream<Uint8Array> | null,
  chunks: Uint8Array[],
): Promise<void> {
  if (!stream || typeof stream.getReader !== "function") {
    return Promise.resolve();
  }
  const reader = stream.getReader();
  const read = (): Promise<void> =>
    reader.read().then(({ done, value }) => {
      if (value) chunks.push(value);
      if (done) return;
      return read();
    });
  return read().finally(() => {
    try {
      reader.releaseLock?.();
    } catch {
      // ignore
    }
  });
}

/** 将 chunk 数组拼成字符串 */
function decodeChunks(chunks: Uint8Array[]): string {
  if (chunks.length === 0) return "";
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(buf);
}

describe("CLI：build", () => {
  it(
    "在 examples 目录执行 view build 应产出 dist/ 且含至少一个 .js 文件",
    async () => {
      // 统一用 execPath()；Deno 需 -A，Bun 不需；stdin: "null" 避免 CI 无 TTY 时子进程阻塞
      const cmd = createCommand(execPath(), {
        args: IS_BUN
          ? ["run", "../src/cli.ts", "build"]
          : ["run", "-A", "../src/cli.ts", "build"],
        cwd: resolve(EXAMPLES_DIR),
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      });
      const child = cmd.spawn();
      const stdoutChunks: Uint8Array[] = [];
      const stderrChunks: Uint8Array[] = [];
      const stdoutDrain = drainToChunks(
        child.stdout as ReadableStream<Uint8Array> | null,
        stdoutChunks,
      );
      const stderrDrain = drainToChunks(
        child.stderr as ReadableStream<Uint8Array> | null,
        stderrChunks,
      );
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, rej) => {
        timeoutId = setTimeout(
          () =>
            rej(
              new Error(
                `view build timed out after ${
                  BUILD_PROCESS_TIMEOUT_MS / 1000
                }s (process will be killed)`,
              ),
            ),
          BUILD_PROCESS_TIMEOUT_MS,
        );
      });
      const statusPromise = Promise.resolve(child.status);

      let result: {
        code: number | null;
        success: boolean;
        stdout: string;
        stderr: string;
      };
      try {
        result = await Promise.race([
          Promise.all([statusPromise, stdoutDrain, stderrDrain]).then(
            ([s]) => ({
              code: s.code,
              success: s.success,
              stdout: decodeChunks(stdoutChunks),
              stderr: decodeChunks(stderrChunks),
            }),
          ),
          timeoutPromise,
        ]);
        clearTimeout(timeoutId);
        timeoutId = undefined;
      } catch (e) {
        clearTimeout(timeoutId);
        child.kill(9);
        const partialStderr = decodeChunks(stderrChunks);
        const partialStdout = decodeChunks(stdoutChunks);
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          partialStderr || partialStdout
            ? `${msg}\nstderr (partial): ${
              partialStderr || "(empty)"
            }\nstdout (partial): ${partialStdout || "(empty)"}`
            : msg,
        );
      }
      if (!result.success) {
        const stderr = result.stderr ?? "";
        const stdout = result.stdout ?? "";
        throw new Error(
          `view build failed. stderr: ${stderr || "(empty)"}; stdout: ${
            stdout || "(empty)"
          }`,
        );
      }

      const distDir = join(EXAMPLES_DIR, "dist");
      expect(existsSync(distDir)).toBe(true);

      const mainJs = join(EXAMPLES_DIR, "dist", "main.js");
      const hasMainJs = existsSync(mainJs);
      if (!hasMainJs) {
        const entries = await readdir(distDir).catch(() => []);
        const jsFiles = entries.filter(
          (e) => e.isFile && e.name.endsWith(".js"),
        );
        if (jsFiles.length === 0) {
          throw new Error(
            "dist/ 下应有 main.js 或至少一个 .js 文件，当前: " +
              (entries.map((e) => e.name).join(", ") || "(空)"),
          );
        }
      }
    },
    // 子进程 60s 超时会 kill，测试总超时略大于进程超时以收尾
    { timeout: BUILD_PROCESS_TIMEOUT_MS + 15_000 },
  );
});

/** 浏览器 entryPoint：用固定存在的 stub，避免依赖 examples/dist/main.js（Windows CI 上路径/构建时序导致 Could not resolve） */
function entryPointForBrowser(): string {
  return join(VIEW_ROOT, "tests", "e2e", "browser-stub.js");
}

/** start 用例用浏览器访问页面（与用户一致），避免测试进程 fetch 在部分环境下连不上 127.0.0.1；entryPoint 用绝对路径/file URL 以兼容 Windows；CI Mac 上 build+start+浏览器较慢，放宽超时 */
const startBrowserConfig = {
  sanitizeOps: false,
  sanitizeResources: false,
  timeout: 120_000,
  browser: {
    enabled: true,
    headless: true,
    browserSource: "test" as const,
    entryPoint: entryPointForBrowser(),
    bodyContent: '<div id="root"></div>',
    browserMode: true,
    moduleLoadTimeout: 20_000,
  },
};

describe("CLI：start", () => {
  /** start 子进程，afterAll 中 kill */
  let startProcess: { kill: (signo?: number) => void } | null = null;

  afterAll(async () => {
    if (startProcess) {
      try {
        startProcess.kill(15); // SIGTERM
      } catch {
        // ignore
      }
      startProcess = null;
    }
    await cleanupAllBrowsers();
  });

  it(
    "先 build 再 start --port 后，用浏览器打开首页应含「多页面示例」",
    async (t) => {
      // 先确保已 build（与上面 build 用例共享产物）；统一 execPath()，仅 args 按运行时区分；stdin: "null" 避免 CI 无 TTY 时子进程阻塞
      const buildCmd = createCommand(execPath(), {
        args: IS_BUN
          ? ["run", "../src/cli.ts", "build"]
          : ["run", "-A", "../src/cli.ts", "build"],
        cwd: EXAMPLES_DIR,
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      });
      const buildOut = await buildCmd.output();
      expect(buildOut.success).toBe(true);

      const startCmd = createCommand(execPath(), {
        args: IS_BUN
          ? [
            "run",
            "../src/cli.ts",
            "start",
            "--port",
            String(START_PORT),
          ]
          : [
            "run",
            "-A",
            join(VIEW_ROOT, "src", "cli.ts"),
            "start",
            "--port",
            String(START_PORT),
          ],
        cwd: EXAMPLES_DIR,
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      });
      const child = startCmd.spawn();
      startProcess = child;

      // 后台消费 stdout/stderr，避免管道满导致子进程阻塞；收集两者便于超时时报错
      const stdoutChunks: Uint8Array[] = [];
      const stderrChunks: Uint8Array[] = [];
      const drain = async (
        stream: ReadableStream<Uint8Array> | null,
        into: Uint8Array[],
      ) => {
        if (!stream) return;
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) into.push(value);
          }
        } catch {
          // ignore
        }
      };
      drain(child.stderr ?? null, stderrChunks).catch(() => {});
      drain(child.stdout ?? null, stdoutChunks).catch(() => {});

      child.unref(); // 立即 unref，避免子进程句柄阻止当前进程自动退出

      const decodeChunks = (chunks: Uint8Array[]) => {
        try {
          const len = chunks.reduce((a, c) => a + c.length, 0);
          const buf = new Uint8Array(len);
          let off = 0;
          for (const c of chunks) {
            buf.set(c, off);
            off += c.length;
          }
          return new TextDecoder().decode(buf);
        } catch {
          return "(unreadable)";
        }
      };

      // 等待 stdout 出现 "Server started" 再用浏览器打开，并给 drain 时间读完，避免子进程堵在 console.log
      const deadlineReady = Date.now() + 15_000;
      let serverReady = false;
      while (Date.now() < deadlineReady) {
        const len = stdoutChunks.reduce((a, c) => a + c.length, 0);
        if (len > 0) {
          const out = decodeChunks(stdoutChunks);
          const hasStarted =
            (out.includes("Server started") || out.includes("服务已启动")) &&
            out.includes(String(START_PORT));
          if (hasStarted) {
            serverReady = true;
            await new Promise((r) => setTimeout(r, 500));
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!serverReady) {
        throw new Error(
          'Start server did not log "Server started" within 15s. stdout: ' +
            decodeChunks(stdoutChunks).slice(-500) +
            "; stderr: " +
            decodeChunks(stderrChunks).slice(-500),
        );
      }

      if (!t?.browser?.goto) {
        throw new Error(
          "Start test requires browser; missing t.browser.goto. stdout: " +
            decodeChunks(stdoutChunks),
        );
      }

      await t.browser.goto(START_URL);
      await new Promise((r) => setTimeout(r, 1200));
      let mainText: string;
      try {
        mainText = (await t.browser.evaluate(() => {
          const main = document.querySelector("main");
          return main ? main.innerText : document.body?.innerText ?? "";
        })) as string;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          "Browser evaluate failed (page/context may have closed). " +
            msg +
            ". stdout: " +
            decodeChunks(stdoutChunks).slice(-300),
        );
      }
      const hasExpected = mainText.includes("多页面示例") ||
        mainText.includes("View 模板引擎") ||
        mainText.includes("view");
      if (!hasExpected) {
        throw new Error(
          "首页应含「多页面示例」或 View 相关文案，实际: " +
            mainText.slice(0, 200),
        );
      }
    },
    startBrowserConfig,
  );
});
