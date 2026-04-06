#!/usr/bin/env -S deno run -A
/**
 * @module cli
 * @description Dreamer View 命令行入口：`view init|dev|build|start`。
 *
 * **可执行**：在包根目录（含 `deno.json`）下 `chmod +x src/cli.ts` 后可直接 `./src/cli.ts init`；
 * 或始终使用 `deno run -A @dreamer/view/cli …` / `deno task`（由工作目录解析 import）。
 *
 * - **init**：与 v1.3.9 `view-cli init [dir]` 一致——**有 `dir` 则在子目录创建，不传则在当前目录创建**；`--beta` 使用 beta 依赖
 * - **dev**：开发服务器与 HMR（`-p` 端口、`-h` 主机）
 * - **build**：生产构建
 * - **start**：生产预览服务（`-p`、`-h`）
 */

import { Command } from "@dreamer/console";
import { main as build } from "./cli/build.ts";
import { main as dev } from "./cli/dev.ts";
import { main as init } from "./cli/init.ts";
import { main as start } from "./cli/start.ts";
import { $tr } from "./i18n.ts";

const program = new Command("view")
  .info("Dreamer View CLI");

/**
 * init：与 git tag v1.3.9 一致——仅位置参数 `dir`（可选），无 `-d`/`--dir`；
 * `dir` 未传时 init 内按当前目录处理。
 */
program
  .command("init", $tr("cli.initDesc"))
  .argument({
    name: "dir",
    description: $tr("cli.initArgDir"),
    required: false,
  })
  .option({
    name: "beta",
    description: $tr("cli.initOptionBeta"),
    type: "boolean",
    defaultValue: false,
  })
  .example("view init my-app", "Scaffold into ./my-app")
  .example("view init", "Scaffold in current directory")
  .action((args, options) =>
    init({ ...options, dir: args[0] } as Record<string, unknown>)
  );

program
  .keepAlive()
  .command("dev", "Start development server with HMR")
  .option({
    name: "port",
    alias: "p",
    description: "Server port",
    requiresValue: true,
    type: "number",
  })
  .option({
    name: "host",
    alias: "h",
    description: "Server host",
    requiresValue: true,
    type: "string",
  })
  .action((_args, options) => dev(options));

program
  .command("build", "Build the project for production")
  .action((_args, options) => build(options));

program
  .command("start", "Start production server")
  .option({
    name: "port",
    alias: "p",
    description: "Server port",
    requiresValue: true,
    type: "number",
  })
  .option({
    name: "host",
    alias: "h",
    description: "Server host",
    requiresValue: true,
    type: "string",
  })
  .action((_args, options) => start(options));

await program.execute();
