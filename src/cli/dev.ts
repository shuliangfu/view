/**
 * dev 命令：通过 createApp 创建应用（mode: dev），执行 app.start() 启动开发服务与 HMR
 */

import { cwd, exit, getEnv, setEnv } from "@dreamer/runtime-adapter";
import { createApp } from "../server/core/app.ts";
import { loadViewConfig } from "../server/core/config.ts";

/**
 * 执行开发流程：loadViewConfig → createApp({ mode: 'dev' }) → app.start()
 * @param options 命令行选项，--host/--port 覆盖 config（并覆盖下方环境变量中的端口）
 * @returns 进程退出码
 */
export async function run(
  options?: Record<string, unknown>,
): Promise<number> {
  setEnv("DENO_ENV", "dev");
  const root = cwd();
  const config = await loadViewConfig(root);

  /**
   * `PORT`：与 dweb E2E / 常见部署约定一致；子进程可传入可用端口，避免默认 8787 已被占用时直接退出。
   */
  const portEnv = getEnv("PORT");
  if (portEnv != null && portEnv !== "") {
    const parsed = parseInt(portEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      (config.server ??= {}).dev = {
        ...config.server?.dev,
        port: parsed,
      };
    }
  }

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
