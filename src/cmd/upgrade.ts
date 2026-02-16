/**
 * view upgrade 命令
 *
 * 职责：
 * - 检查并升级 @dreamer/view 到最新版本
 * - 从 JSR 获取最新版本信息
 * - 发现新版本时自动重新执行 setup 安装 view-cli
 * - 支持 --beta：默认仅升级稳定版，--beta 时可升级到 beta 最新版
 *
 * 运行方式：
 * - view-cli upgrade          # 仅升级到稳定版
 * - view-cli upgrade --beta   # 可升级到 beta 最新版
 */

import {
  error,
  failSpinner,
  info,
  startSpinner,
  succeedSpinner,
  success,
} from "@dreamer/console";
import { createCommand, IS_BUN, IS_DENO } from "@dreamer/runtime-adapter";
import {
  compareVersions,
  fetchLatestViewVersionFromJsr,
  getViewVersion,
  writeVersionCache,
} from "../version.ts";

/**
 * 获取当前运行时名称（deno 或 bun），供 createCommand 使用
 */
function getRuntime(): "deno" | "bun" {
  if (IS_DENO) return "deno";
  if (IS_BUN) return "bun";
  throw new Error("Unsupported runtime: only Deno and Bun are supported.");
}

/**
 * 获取执行 deno run / bun run 脚本的参数字段
 * - Deno: ["run", "-A", spec]
 * - Bun: ["run", spec]
 */
function getRunArgs(spec: string): string[] {
  if (IS_DENO) return ["run", "-A", spec];
  if (IS_BUN) return ["run", spec];
  return ["run", "-A", spec];
}

/**
 * upgrade 命令主入口
 *
 * @param _args 命令行参数（未使用）
 * @param options 解析后的选项，options.beta 为 true 时升级到 beta 最新版
 */
export async function main(
  _args: string[],
  options: Record<string, unknown>,
): Promise<void> {
  const useBeta = options?.beta === true;
  const runtime = getRuntime();
  const current = await getViewVersion(false);
  info(`Current @dreamer/view version: ${current}`);
  info("Checking latest version...");

  const latest = await fetchLatestViewVersionFromJsr(useBeta);
  if (!latest) {
    if (!useBeta) {
      error(
        "No stable release found. Try --beta to update to the latest beta.",
      );
    } else {
      error("Could not fetch latest version from JSR.");
    }
    return;
  }

  if (current === latest || compareVersions(latest, current) <= 0) {
    success(`Already on latest version: ${current}`);
    return;
  }

  success(`New version available: ${latest}`);

  const setupSpec = `jsr:@dreamer/view@${latest}/setup`;
  const cmd = createCommand(runtime, {
    args: getRunArgs(setupSpec),
    stdout: "null",
    stderr: "null",
    stdin: "inherit",
  });
  startSpinner("Installing...");
  const child = cmd.spawn();
  const status = await child.status;

  if (status.success) {
    succeedSpinner(`Upgraded to ${latest}`);
    await writeVersionCache(latest);
  } else {
    failSpinner("Auto install failed.");
    error("Please install manually:");
    info(`  deno run -A ${setupSpec}`);
    info("  Or use the version you need, e.g. jsr:@dreamer/view@1.0.0/setup");
  }
}
