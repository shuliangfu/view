/**
 * start 命令：启动 prod 静态服务（内置 serve，无需项目内 server.ts）
 * 需先执行 build，再运行本命令以提供 dist/ 与 index.html。
 * 使用 view.config 的 server.prod（port、host）。
 */

import { loadViewConfig } from "./config.ts";
import { cwd, exit, join, setEnv } from "@dreamer/runtime-adapter";
import { run as runServe } from "./serve.ts";
import type { ViewServeOptions } from "./serve.ts";

/**
 * 启动静态服务（prod 模式），阻塞直到进程退出
 * 项目根目录取当前工作目录（cwd）
 * @param options 命令行选项，--host/--port 最高优先级
 * @returns 进程退出码
 */
export async function run(
  options?: Record<string, unknown>,
): Promise<number> {
  setEnv("DENO_ENV", "prod");
  const root = cwd();
  const config = await loadViewConfig(root);

  const outDir = config.build?.outDir ?? "dist";

  const prodRoot = join(root, outDir);

  // 命令行 --host/--port 最高优先级，其次 config（port 支持字符串以便 CLI 解析后兼容）
  const host = (options?.host as string | undefined) ??
    config.server?.prod?.host ??
    "127.0.0.1";
  const portRaw = options?.port ?? config.server?.prod?.port ?? 8787;
  const port: number = typeof portRaw === "string"
    ? parseInt(portRaw, 10)
    : typeof portRaw === "number" && Number.isFinite(portRaw)
    ? portRaw
    : 8787;

  const prodServer: ViewServeOptions = {
    host,
    port,
  };

  return await runServe(prodRoot, prodServer);
}

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 * @param options 命令行选项，--host/--port 覆盖 config
 */
export async function main(options?: Record<string, unknown>): Promise<void> {
  const code = await run(options);
  if (code !== 0) exit(1);
}
