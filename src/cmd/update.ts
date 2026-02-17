/**
 * view update 命令
 *
 * 职责：
 * - 执行 deno update 或 bun update，更新当前项目依赖与 lockfile
 * - 兼容 Deno 与 Bun 运行时
 *
 * 运行方式：
 * - view-cli update
 * - view-cli update --latest
 * - view-cli update --interactive
 */

import { error, info, success } from "@dreamer/console";
import { createCommand, cwd, IS_BUN, IS_DENO } from "@dreamer/runtime-adapter";
import { $t } from "./i18n.ts";

/**
 * 获取当前运行时名称（deno 或 bun）
 */
function getRuntime(): "deno" | "bun" {
  if (IS_DENO) return "deno";
  if (IS_BUN) return "bun";
  throw new Error($t("error.runtimeUnsupported"));
}

/**
 * update 命令主入口
 *
 * @param args 命令行参数（会透传给 deno update / bun update，如 --interactive）
 * @param options 解析后的选项，options.latest 为 true 时传入 --latest
 */
export async function main(
  args: string[],
  options: Record<string, unknown>,
): Promise<void> {
  const runtime = getRuntime();
  const projectRoot = cwd();

  const updateArgs = ["update"];
  if (options?.latest === true) {
    updateArgs.push("--latest");
  }
  updateArgs.push(...args);

  info(`Running ${runtime} update...`);

  const cmd = createCommand(runtime, {
    args: updateArgs,
    cwd: projectRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = cmd.spawn();
  const status = await child.status;

  if (status.success) {
    success("Update complete.");
  } else {
    error(`Update failed with exit code ${status.code ?? "?"}`);
  }
}
