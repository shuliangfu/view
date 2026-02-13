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
  dirname,
  ensureDir,
  existsSync,
  execPath,
  join,
  readTextFile,
  remove,
  resolve,
} from "@dreamer/runtime-adapter";
import { afterAll, cleanupAllBrowsers, describe, expect, it } from "@dreamer/test";

/** 规整路径：消除 .. 与 .，保证绝对路径一致（runtime-adapter resolve 不规整 ..） */
function normalizeAbsolutePath(p: string): string {
  const isAbsolute = p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  return isAbsolute ? "/" + out.join("/") : out.join("/");
}

/** view 包根目录：由当前测试文件路径向上两级 */
const _testDir = dirname(
  typeof import.meta.url !== "undefined" && import.meta.url.startsWith("file:")
    ? new URL(import.meta.url).pathname
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

  it("view init <dir> 应在目标目录生成 view.config.ts、deno.json、src 等", async () => {
    await ensureDir(INIT_OUT_DIR);
    // 直接调用 init main，与 CLI 同逻辑，避免子进程 cwd/路径差异导致断言失败
    const { main: initMain } = await import("../../src/cmd/init.ts");
    await initMain({ dir: INIT_OUT_DIR });

    const viewConfigPath = join(INIT_OUT_DIR, "view.config.ts");
    const denoJsonPath = join(INIT_OUT_DIR, "deno.json");
    const mainTsxPath = join(INIT_OUT_DIR, "src", "main.tsx");
    const routesDir = join(INIT_OUT_DIR, "src", "routes");
    const routerDir = join(INIT_OUT_DIR, "src", "router");

    expect(existsSync(viewConfigPath)).toBe(true);
    expect(existsSync(denoJsonPath)).toBe(true);
    expect(existsSync(mainTsxPath)).toBe(true);
    expect(existsSync(routesDir)).toBe(true);
    expect(existsSync(routerDir)).toBe(true);

    const viewConfigContent = await readTextFile(viewConfigPath);
    expect(viewConfigContent).toContain("view 项目配置");
    expect(viewConfigContent).toContain("server");
    expect(viewConfigContent).toContain("build");

    const denoJsonContent = await readTextFile(denoJsonPath);
    expect(denoJsonContent).toContain("@dreamer/view");
    expect(denoJsonContent).toContain("dev");
    expect(denoJsonContent).toContain("build");
    expect(denoJsonContent).toContain("start");
  }, { sanitizeOps: false, sanitizeResources: false });
});

describe("CLI：build", () => {
  it("在 examples 目录执行 view build 应产出 dist/ 且含 main.js", async () => {
    const cmd = createCommand(execPath(), {
      args: ["run", "-A", "../src/cli.ts", "build"],
      cwd: EXAMPLES_DIR,
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    expect(out.success).toBe(true);

    const distDir = join(EXAMPLES_DIR, "dist");
    const mainJs = join(EXAMPLES_DIR, "dist", "main.js");
    expect(existsSync(distDir)).toBe(true);
    expect(existsSync(mainJs)).toBe(true);
  });
});

/** start 用例用浏览器访问页面（与用户一致），避免测试进程 fetch 在部分环境下连不上 127.0.0.1；entryPoint 用绝对路径以兼容 Windows */
const startBrowserConfig = {
  sanitizeOps: false,
  sanitizeResources: false,
  timeout: 60_000,
  browser: {
    enabled: true,
    headless: true,
    browserSource: "test" as const,
    entryPoint: join(VIEW_ROOT, "examples", "dist", "main.js"),
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

  it("先 build 再 start --port 后，用浏览器打开首页应含「多页面示例」", async (t) => {
    // 先确保已 build（与上面 build 用例共享产物）
    const buildCmd = createCommand(execPath(), {
      args: ["run", "-A", "../src/cli.ts", "build"],
      cwd: EXAMPLES_DIR,
      stdout: "piped",
      stderr: "piped",
    });
    const buildOut = await buildCmd.output();
    expect(buildOut.success).toBe(true);

    const startCmd = createCommand(execPath(), {
      args: [
        "run",
        "-A",
        join(VIEW_ROOT, "src", "cli.ts"),
        "start",
        "--port",
        String(START_PORT),
      ],
      cwd: EXAMPLES_DIR,
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

    // 等待 stdout 出现 "Server started" 再用浏览器打开，并给 drain 时间读完，避免子进程堵在 console.log
    const deadlineReady = Date.now() + 10_000;
    while (Date.now() < deadlineReady) {
      const len = stdoutChunks.reduce((a, c) => a + c.length, 0);
      if (len > 0) {
        const buf = new Uint8Array(len);
        let off = 0;
        for (const c of stdoutChunks) {
          buf.set(c, off);
          off += c.length;
        }
        const out = new TextDecoder().decode(buf);
        if (out.includes("Server started") && out.includes(String(START_PORT))) {
          await new Promise((r) => setTimeout(r, 500));
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    if (!t?.browser?.goto) {
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
      throw new Error(
        "Start test requires browser; missing t.browser.goto. stdout: " +
          decodeChunks(stdoutChunks),
      );
    }

    await t.browser.goto(START_URL);
    await new Promise((r) => setTimeout(r, 400));
    const mainText = (await t.browser.evaluate(() => {
      const main = document.querySelector("main");
      return main ? main.innerText : document.body?.innerText ?? "";
    })) as string;
    expect(mainText).toContain("多页面示例");
  }, startBrowserConfig);
});
