#!/usr/bin/env -S deno run -A
/**
 * @module cli
 * @description view-cli 入口，与 git v1.3.9 对齐：**init、dev、build、start、upgrade、update**；支持 **--version / -v**。
 *
 * **可执行**：在包根目录（含 `deno.json`）下 `chmod +x src/cli.ts` 后可直接 `./src/cli.ts <command>`；
 * 或 `deno run -A jsr:@dreamer/view/cli …`。
 *
 * **导出：** `createCLI(version)` — 供测试或嵌入调用。
 */

import { Command } from "@dreamer/console";
import { $tr } from "./i18n.ts";
import { main as build } from "./cli/build.ts";
import { main as dev } from "./cli/dev.ts";
import { main as init } from "./cli/init.ts";
import { main as start } from "./cli/start.ts";
import { main as update } from "./cli/update.ts";
import { main as upgrade } from "./cli/upgrade.ts";
import { getViewVersion } from "./server/utils/version.ts";

/**
 * 构建 --version 输出文案（与 v1.3.9 一致，走 i18n）
 * @param version 当前框架版本号
 */
function buildVersionStr(version: string): string {
  return $tr("cli.versionBanner", { version });
}

/**
 * 创建并注册全部子命令（与 v1.3.9 行为一致）
 * @param version 供 setVersion 使用
 */
export function createCLI(version: string): Command {
  const cli = new Command("view-cli", $tr("cli.description")).setVersion(
    "\n" + buildVersionStr(version) + "\n",
  );

  cli
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
    .action(async (args, options) => {
      await init({ ...options, dir: args[0] } as Record<string, unknown>);
    });

  cli
    .command("dev", $tr("cli.devDesc"))
    .option({
      name: "host",
      alias: "h",
      description: $tr("cli.optionHost"),
      requiresValue: true,
      type: "string",
    })
    .option({
      name: "port",
      alias: "p",
      description: $tr("cli.optionPort"),
      requiresValue: true,
      type: "number",
    })
    .keepAlive()
    .action(async (_args, options) => {
      await dev(options);
    });

  cli
    .command("start", $tr("cli.startDesc"))
    .option({
      name: "host",
      alias: "h",
      description: $tr("cli.optionHost"),
      requiresValue: true,
      type: "string",
    })
    .option({
      name: "port",
      alias: "p",
      description: $tr("cli.optionPort"),
      requiresValue: true,
      type: "number",
    })
    .keepAlive()
    .action(async (_args, options) => {
      await start(options);
    });

  cli
    .command("build", $tr("cli.buildDesc"))
    .action(async () => {
      await build();
    });

  cli
    .command("upgrade", $tr("cli.upgradeDesc"))
    .option({
      name: "beta",
      description: $tr("cli.upgradeOptionBeta"),
      type: "boolean",
      defaultValue: false,
    })
    .action(async (args, options) => {
      await upgrade(args, options as Record<string, unknown>);
    });

  cli
    .command("update", $tr("cli.updateDesc"))
    .option({
      name: "latest",
      description: $tr("cli.updateOptionLatest"),
      type: "boolean",
      defaultValue: false,
    })
    .action(async (args, options) => {
      await update(args, options as Record<string, unknown>);
    });

  return cli;
}

if (import.meta.main) {
  const version = await getViewVersion(false);
  const cli = createCLI(version);
  await cli.execute();
}
