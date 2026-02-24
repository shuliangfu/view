/**
 * dev 命令：通过 createApp 创建应用（mode: dev），执行 app.start() 启动开发服务与 HMR
 */

import { cwd, exit, setEnv } from "@dreamer/runtime-adapter";
import { createApp } from "../core/app.ts";
import { loadViewConfig } from "../core/config.ts";

/**
 * 执行开发流程：loadViewConfig → createApp({ mode: 'dev' }) → app.start()
 * @param options 命令行选项，--host/--port 覆盖 config
 * @returns 进程退出码
 */
export async function run(
  options?: Record<string, unknown>,
): Promise<number> {
  setEnv("DENO_ENV", "dev");
  const root = cwd();
  const config = await loadViewConfig(root);

  if (options?.host != null) {
    (config.server ??= {}).dev = {
      ...config.server?.dev,
      host: options.host as string,
    };
  }
  if (options?.port != null) {
    (config.server ??= {}).dev = {
      ...config.server?.dev,
      port: options.port as number,
    };
  }

  const app = createApp({ root, mode: "dev", viewConfig: config });
  return app.start();
}

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 */
export async function main(options?: Record<string, unknown>): Promise<void> {
  const code = await run(options);
  if (code !== 0) exit(1);
}
