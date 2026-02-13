/**
 * dev 命令：先构建再启动静态服务（开发流程）
 * 等价于 deno task bundle && deno task serve。
 */

import { run as runBuild } from "./build.ts";
import { run as runStart } from "./start.ts";

/**
 * 执行开发流程：build 成功后启动 server
 * @param root 项目根目录（examples）
 * @returns 进程退出码，build 失败或 server 退出非 0 时返回非 0
 */
export async function run(root: string): Promise<number> {
  const code = await runBuild(root);
  if (code !== 0) {
    console.error("Build failed, exiting.");
    return code;
  }
  return runStart(root);
}
