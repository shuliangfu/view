/**
 * dev 命令：前端 CSR 开发，内存编译（不写 outDir）并启动静态服务，使用 prepareDevBuild + server.dev 与 HMR
 */

import { cwd, exit, setEnv } from "@dreamer/runtime-adapter";
import { prepareDevBuild } from "./build.ts";
import { loadViewConfig } from "./config.ts";
import { run as runServe, type ViewServeOptions } from "./serve.ts";

/**
 * 执行开发流程：prepareDevBuild 做首次内存构建并创建 context，热更新时 watcher 把 changedPath 传给 builder.rebuild 做增量编译。
 * @param options 命令行选项，--host/--port 最高优先级
 * @returns 进程退出码
 */
export async function run(
  options?: Record<string, unknown>,
): Promise<number> {
  setEnv("DENO_ENV", "dev");
  const root = cwd();
  const config = await loadViewConfig(root);

  const { devServeOutputs, rebuild } = await prepareDevBuild(root, config);

  if (devServeOutputs.length === 0) {
    console.warn(
      "[view dev] No output contents; ensure build produced output.",
    );
  }

  // 热更新后用最新产出替换，serve 通过 getDevServeOutputs() 每次请求取最新
  let latestOutputs = devServeOutputs;
  const getDevServeOutputs = () => latestOutputs;

  const watchCfg = config.server?.dev?.dev?.watch;
  const watchPaths = Array.isArray(watchCfg)
    ? watchCfg
    : (watchCfg?.paths ?? ["./src"]);
  const baseIgnore = Array.isArray(watchCfg)
    ? ["node_modules", ".git", "dist"]
    : (watchCfg?.ignore ?? ["node_modules", ".git", "dist"]);
  // 自动生成的 routers.tsx 加入忽略，避免 generateRoutersFile 写入后触发第二次 rebuild 导致下发错误的 chunkUrl
  const watchIgnore = baseIgnore.some((s) => s.includes("routers.tsx"))
    ? baseIgnore
    : [...baseIgnore, "routers.tsx"];

  // 命令行 --host/--port 最高优先级，其次 config
  const host = (options?.host as string | undefined) ??
    config.server?.dev?.host ??
    "127.0.0.1";
  const port = (options?.port as number | undefined) ??
    config.server?.dev?.port ??
    8787;

  const devServer: ViewServeOptions = {
    host,
    port,
    mode: "dev",
    dev: {
      hmr: (() => {
        const hmr = config.server?.dev?.dev?.hmr;
        const obj = typeof hmr === "object" && hmr !== null ? hmr : null;
        return {
          enabled: obj?.enabled ?? true,
          path: obj?.path ?? "/__hmr",
        };
      })(),
      watch: {
        paths: watchPaths,
        ignore: watchIgnore,
      },
      builder: {
        rebuild(options?: { changedPath?: string }) {
          return rebuild(options).then((result) => {
            latestOutputs = result.devServeOutputs;
            return {
              outputFiles: result.outputFiles,
              chunkUrl: result.chunkUrl,
              routePath: result.routePath,
            };
          });
        },
      },
    },
  };

  return await runServe(root, {
    ...devServer,
    devServeOutputs,
    getDevServeOutputs,
  });
}

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 * @param options 命令行选项，--host/--port 覆盖 config
 */
export async function main(options?: Record<string, unknown>): Promise<void> {
  const code = await run(options);
  if (code !== 0) exit(1);
}
