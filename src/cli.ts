#!/usr/bin/env -S deno run -A

/**
 * @dreamer/view CLI 入口
 *
 * 使用 @dreamer/console 的 Command 注册子命令，usage/help 由 console 自动实现。
 * 子命令：init、dev、build、start，各由 cmd/* 动态导入执行。
 * 主入口显式传入运行时参数，确保在 deno task 等场景下子命令能正确匹配。
 *
 * @module
 */

import { Command } from "@dreamer/console";
import { args } from "@dreamer/runtime-adapter";

/**
 * 创建 view-cli 命令实例并注册子命令
 */
export function createCLI(): Command {
  const cli = new Command(
    "view-cli",
    "@dreamer/view development tool: init, dev, build, start",
  );

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

  return cli;
}

if (import.meta.main) {
  const cli = createCLI();
  await cli.execute(args());
}
