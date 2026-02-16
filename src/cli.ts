#!/usr/bin/env -S deno run -A

/**
 * @module @dreamer/view/cli
 * @description
 * view-cli 入口：init、dev、build、start、upgrade、update；支持 version/-v 显示版本。
 * 使用 @dreamer/console 的 Command 注册子命令，usage/help 由 console 自动实现；子命令由 cmd/* 动态导入执行。
 *
 * @example
 * deno run -A jsr:@dreamer/view/cli dev
 * deno run -A jsr:@dreamer/view/cli build
 * view-cli --version   # 或 -v 显示版本
 * view-cli upgrade    # 升级到最新稳定版
 * view-cli upgrade --beta  # 可升级到 beta
 * view-cli update     # 更新项目依赖与 lockfile
 */

import { Command } from "@dreamer/console";
import { args } from "@dreamer/runtime-adapter";
import { getViewVersion } from "./version.ts";

/**
 * 构建 CLI 版本展示字符串（供 setVersion 与 --version/-v 输出）
 */
function buildVersionStr(version: string): string {
  return `view-cli
Version: ${version}

@dreamer/view development tool: init, dev, build, start, upgrade, update.
`;
}

/**
 * 创建 view-cli 命令实例并注册子命令
 * @param version 框架版本号（由 getViewVersion() 获取），用于 setVersion 与 --version/-v
 */
export function createCLI(version: string): Command {
  const cli = new Command(
    "view-cli",
    "@dreamer/view development tool: init, dev, build, start, upgrade, update",
  ).setVersion(buildVersionStr(version));

  // ---------------------------------------------------------------------------
  // init — 初始化项目
  // ---------------------------------------------------------------------------
  cli
    .command("init", "Initialize project from example structure")
    .argument({
      name: "dir",
      description: "Target directory (default: current directory)",
      required: false,
    })
    .option({
      name: "beta",
      description:
        "Allow latest beta/pre-release; if stable is newer than beta, stable is still used",
      type: "boolean",
      defaultValue: false,
    })
    .action(async (args: string[], options: Record<string, unknown>) => {
      const { main: initMain } = await import("./cmd/init.ts");
      const initOptions: Record<string, unknown> = {
        ...options,
        dir: args[0],
      };
      await initMain(initOptions);
    });

  // ---------------------------------------------------------------------------
  // dev — 开发服务器（构建 + 静态服务）
  // ---------------------------------------------------------------------------
  cli
    .command("dev", "Build then start static server (dev)")
    .option({
      name: "host",
      alias: "h",
      description: "Host to bind (overrides config)",
      requiresValue: true,
      type: "string",
    })
    .option({
      name: "port",
      alias: "p",
      description: "Port to listen on (overrides config)",
      requiresValue: true,
      type: "number",
    })
    .keepAlive()
    .action(async (_args: string[], options: Record<string, unknown>) => {
      const { main: devMain } = await import("./cmd/dev.ts");
      await devMain(options);
    });

  // ---------------------------------------------------------------------------
  // start — 生产静态服务
  // ---------------------------------------------------------------------------
  cli
    .command("start", "Start static server only (requires prior build)")
    .option({
      name: "host",
      alias: "h",
      description: "Host to bind (overrides config)",
      requiresValue: true,
      type: "string",
    })
    .option({
      name: "port",
      alias: "p",
      description: "Port to listen on (overrides config)",
      requiresValue: true,
      type: "number",
    })
    .keepAlive()
    .action(async (_args: string[], options: Record<string, unknown>) => {
      const { main: startMain } = await import("./cmd/start.ts");
      await startMain(options);
    });

  // ---------------------------------------------------------------------------
  // build — 构建
  // ---------------------------------------------------------------------------
  cli
    .command("build", "Build only (output to dist/)")
    .action(async () => {
      const { main: buildMain } = await import("./cmd/build.ts");
      await buildMain();
    });

  // ---------------------------------------------------------------------------
  // upgrade — 升级 view-cli 到最新版本
  // ---------------------------------------------------------------------------
  cli
    .command(
      "upgrade",
      "Upgrade @dreamer/view to latest version (re-run setup)",
    )
    .option({
      name: "beta",
      description:
        "Allow upgrading to latest beta; if stable is newer than beta, stable is still used",
      type: "boolean",
      defaultValue: false,
    })
    .action(async (_args: string[], options: Record<string, unknown>) => {
      const { main: upgradeMain } = await import("./cmd/upgrade.ts");
      await upgradeMain(_args, options);
    });

  // ---------------------------------------------------------------------------
  // update — 更新项目依赖与 lockfile（deno update / bun update）
  // ---------------------------------------------------------------------------
  cli
    .command(
      "update",
      "Update project dependencies and lockfile (deno update / bun update)",
    )
    .option({
      name: "latest",
      description:
        "Update to latest versions (deno update --latest / bun update)",
      type: "boolean",
      defaultValue: false,
    })
    .action(async (args: string[], options: Record<string, unknown>) => {
      const { main: updateMain } = await import("./cmd/update.ts");
      await updateMain(args, options);
    });

  // ---------------------------------------------------------------------------
  // version — 显示版本（与 --version / -v 等效）
  // ---------------------------------------------------------------------------
  cli
    .command("version", "Show view-cli and @dreamer/view version")
    .alias("v")
    .action(() => {
      console.log(buildVersionStr(version));
    });

  return cli;
}

if (import.meta.main) {
  const version = await getViewVersion(false);
  const cli = createCLI(version);
  await cli.execute(args());
}
