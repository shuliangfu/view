/**
 * start 命令：通过 createApp 创建应用（mode: prod），执行 app.start() 启动生产静态服务
 * 需先执行 build，再运行本命令以提供 dist/ 与 index.html。
 */

import { cwd, exit, setEnv } from "@dreamer/runtime-adapter";
import { createApp } from "../core/app.ts";
import { loadViewConfig } from "../core/config.ts";

/**
 * 启动静态服务（prod 模式），阻塞直到进程退出
 * @param options 命令行选项，--host/--port 最高优先级
 * @returns 进程退出码
 */
export async function run(
  options?: Record<string, unknown>,
): Promise<number> {
  setEnv("DENO_ENV", "prod");
  const root = cwd();
  const config = await loadViewConfig(root);

  if (options?.host != null) {
    (config.server ??= {}).prod = {
      ...config.server?.prod,
      host: options.host as string,
    };
  }
  if (options?.port != null) {
    const portRaw = options.port;
    const port = typeof portRaw === "string"
      ? parseInt(portRaw, 10)
      : typeof portRaw === "number" && Number.isFinite(portRaw)
      ? portRaw
      : config.server?.prod?.port ?? 8787;
    (config.server ??= {}).prod = { ...config.server?.prod, port };
  }

  const app = createApp({ root, mode: "prod", viewConfig: config });
  return app.start();
}

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 */
export async function main(options?: Record<string, unknown>): Promise<void> {
  const code = await run(options);
  if (code !== 0) exit(1);
}
