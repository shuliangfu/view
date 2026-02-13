#!/usr/bin/env -S deno run -A

/**
 * @module @dreamer/view/setup
 * @description
 * view-cli 全局命令安装脚本：执行 deno install 将 view CLI 安装为全局命令 view-cli，支持从 JSR 或本地运行。安装后可在任意目录执行 view-cli init、dev、build、start。
 *
 * @example
 * ```bash
 * deno run -A jsr:@dreamer/view/setup
 * ```
 */

import {
  createCommand,
  dirname,
  execPath,
  exit,
  join,
  makeTempFile,
  readTextFile,
  remove,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { loadViewDenoJson, writeVersionCache } from "./version.ts";

/** CLI 全局命令名称（与 cli.ts 中一致） */
const CLI_NAME = "view-cli";

/** ANSI 颜色（安装成功绿、失败红） */
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/**
 * 安装成功后写入版本缓存到 ~/.dreamer/view/version.json，供 view-cli init 等快速读取
 */
async function writeVersionCacheOnInstall(): Promise<void> {
  try {
    const config = await loadViewDenoJson();
    if (config?.version) {
      await writeVersionCache(config.version);
    }
  } catch {
    // 忽略，不影响安装成功
  }
}

/**
 * 判断当前是否从本地文件运行（非 JSR/远程）
 */
function isLocalRun(): boolean {
  try {
    const url = import.meta.url;
    return url.startsWith("file:");
  } catch {
    return false;
  }
}

/**
 * 从 import.meta.url 解析当前文件所在目录的文件系统路径（兼容 Windows）
 */
function getCurrentDir(): string {
  if (
    typeof import.meta.url === "undefined" ||
    !import.meta.url.startsWith("file:")
  ) {
    return ".";
  }
  const pathname = new URL(import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  );
  return dirname(pathname);
}

/**
 * 获取 view 包根目录路径
 * setup.ts 位于 src/，故当前目录的上一级为包根
 */
function getPackageRoot(): string {
  const currentDir = getCurrentDir();
  return join(currentDir, "..");
}

/**
 * 获取 CLI 入口路径或 JSR 说明符
 * - 本地：返回项目内 src/cli.ts 的绝对路径
 * - JSR：返回带版本的 jsr:@dreamer/view@<version>/cli，避免 deno install 解析为 * 导致找不到版本
 * @param viewVersion 从 JSR 运行时的包版本（由 loadViewDenoJson 等提供），未传时退回无版本（可能触发 * 解析错误）
 */
function getCliEntry(viewVersion?: string): string {
  if (isLocalRun()) {
    const root = getPackageRoot();
    return join(root, "src", "cli.ts");
  }
  if (viewVersion) {
    return `jsr:@dreamer/view@${viewVersion}/cli`;
  }
  return "jsr:@dreamer/view/cli";
}

/**
 * 生成无 workspace 的临时 config，避免 JSR 发布包中 examples 缺失导致的解析错误
 * - 本地运行：从包根 deno.json 读取
 * - JSR 运行：通过 fetch 从包根 URL 获取 deno.json
 */
async function createTempCliConfig(): Promise<string> {
  let config: Record<string, unknown>;
  if (isLocalRun()) {
    const root = getPackageRoot();
    const denoJsonPath = join(root, "deno.json");
    try {
      const raw = await readTextFile(denoJsonPath);
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      console.error("Failed to read deno.json:", denoJsonPath, err);
      exit(1);
    }
  } else {
    // JSR 运行：deno.json 在包根，setup.ts 在 src/，故 ../deno.json
    const denoJsonUrl = new URL("../deno.json", import.meta.url).href;
    try {
      const res = await fetch(denoJsonUrl);
      if (!res.ok) {
        console.error("Failed to fetch deno.json:", res.status);
        exit(1);
      }
      const raw = await res.text();
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      console.error("Failed to fetch or parse deno.json:", denoJsonUrl, err);
      exit(1);
    }
  }
  // 移除 workspace、tasks、publish、lint 等仅开发时需要的字段，保留 exports（CLI 解析 ./cli 需要）
  const { workspace: _w, tasks: _t, publish: _p, lint: _l, ...cliConfig } =
    config;
  const tempPath = await makeTempFile({ prefix: "view-cli-", suffix: ".json" });
  await writeTextFile(tempPath, JSON.stringify(cliConfig, null, 2));
  return tempPath;
}

/**
 * 执行 deno install 安装全局命令
 *
 * - JSR 远程安装：先取当前包版本（fetch 包根 deno.json），再安装 jsr:@dreamer/view@<version>/cli，避免解析为 * 报错
 * - 本地调试安装：使用 --config 临时 config（去除 workspace），避免解析 examples 等不存在的路径
 */
async function installGlobalCli(): Promise<void> {
  const runtime = execPath();
  let cliEntry: string;
  if (isLocalRun()) {
    cliEntry = getCliEntry();
  } else {
    const config = await loadViewDenoJson();
    cliEntry = getCliEntry(config?.version);
  }
  const args: string[] = [
    "install",
    "--global",
    "-f",
    "-q", // 静默模式，不输出 Deno 默认的 "Successfully installed" 等提示
    "-n",
    CLI_NAME,
    "-A",
  ];

  if (isLocalRun()) {
    const tempConfigPath = await createTempCliConfig();
    args.push("--config", tempConfigPath);
    try {
      args.push(cliEntry);
      const cmd = createCommand(runtime, {
        args,
        stdout: "piped",
        stderr: "piped",
        stdin: "inherit",
      });
      console.log(`Installing ${CLI_NAME}...`);
      const child = cmd.spawn();
      const status = await child.status;
      if (status.success) {
        console.log(`${GREEN}${CLI_NAME} installed successfully.${RESET}`);
        await writeVersionCacheOnInstall();
        printUsage();
      } else {
        const stderr = child.stderr
          ? await new Response(child.stderr).text()
          : "";
        console.error(
          `${RED}Install failed (exit code ${status.code ?? ""}). ${stderr}${RESET}`,
        );
        exit(status.code ?? 1);
      }
    } finally {
      await remove(tempConfigPath).catch(() => {});
    }
  } else {
    args.push(cliEntry);
    const cmd = createCommand(runtime, {
      args,
      stdout: "piped",
      stderr: "piped",
      stdin: "inherit",
    });
    console.log(`Installing ${CLI_NAME}...`);
    const child = cmd.spawn();
    const status = await child.status;
    if (status.success) {
      console.log(`${GREEN}${CLI_NAME} installed successfully.${RESET}`);
      await writeVersionCacheOnInstall();
      printUsage();
    } else {
      const stderr = child.stderr
        ? await new Response(child.stderr).text()
        : "";
      console.error(
        `${RED}Install failed (exit code ${status.code ?? ""}). ${stderr}${RESET}`,
      );
      exit(status.code ?? 1);
    }
  }
}

/** 打印 view-cli 使用说明（# 注释列对齐） */
function printUsage(): void {
  const w = 12; // 命令部分宽度，保证 # 对齐
  const pad = (s: string) => s.padEnd(w);
  console.log("Usage:");
  console.log(
    `  ${CLI_NAME} ${
      pad("init [dir]")
    } # Initialize project from example structure`,
  );
  console.log(
    `  ${CLI_NAME} ${pad("dev")} # Build then start static server (dev)`,
  );
  console.log(`  ${CLI_NAME} ${pad("build")} # Build only (output to dist/)`);
  console.log(
    `  ${CLI_NAME} ${
      pad("start")
    } # Start static server only (requires prior build)`,
  );
  console.log(
    `  ${CLI_NAME} ${
      pad("upgrade")
    } # Upgrade @dreamer/view to latest (use --beta for beta)`,
  );
  console.log(
    `  ${CLI_NAME} ${pad("update")} # Update project dependencies and lockfile`,
  );
  console.log(`  ${CLI_NAME} ${pad("version")} # Show version`);
  console.log(`  ${CLI_NAME} ${pad("--version")} # Show version (alias: -v)`);
  console.log(`  ${CLI_NAME} ${pad("--help")} # Show help`);
  console.log("");
}

// 主入口
if (import.meta.main) {
  installGlobalCli().catch((err) => {
    console.error("Install failed.", err);
    exit(1);
  });
}
