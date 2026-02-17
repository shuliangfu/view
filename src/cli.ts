#!/usr/bin/env -S deno run -A

/**
 * view-cli 入口：init、dev、build、start、upgrade、update；支持 version/-v 显示版本。
 *
 * @module @dreamer/view/cli
 * @packageDocumentation
 *
 * 使用 @dreamer/console 的 Command 注册子命令，子命令由 cmd/* 动态导入执行。
 *
 * **导出函数：** createCLI(version) — 创建并返回 CLI Command 实例
 *
 * @example
 * deno run -A jsr:@dreamer/view/cli dev
 * view-cli --version
 * view-cli upgrade --beta
 */

import { Command } from "@dreamer/console";
import { args } from "@dreamer/runtime-adapter";
import { initViewI18n } from "./cmd/i18n.ts";
import { getViewVersion } from "./version.ts";

// CLI 入口处初始化 i18n（getEnv/detectLocale 仅服务端可用，不能放在 mod.ts）
initViewI18n();

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
 * 创建 view-cli 命令实例并注册子命令（init、dev、build、start、upgrade、update、version 等）。
 *
 * @param version - 框架版本号（由 getViewVersion() 获取），用于 setVersion 与 --version/-v 输出
 * @returns Command 实例，可调用 .parse() 等执行
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
