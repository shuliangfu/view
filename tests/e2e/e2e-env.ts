/**
 * @fileoverview E2E 子进程环境：强制 examples 使用 compileSource，避免 view.config 误设 `jsx: "runtime"` 导致空白页。
 */

import { getEnvAll } from "@dreamer/runtime-adapter";

/** 与 `getBuildConfigForMode` 中读取的键一致 */
const VIEW_FORCE_BUILD_JSX = "VIEW_FORCE_BUILD_JSX";

/**
 * 合并当前进程环境并注入 `VIEW_FORCE_BUILD_JSX=compiler`，供 `createCommand({ env })` 使用
 * （Deno/Bun 子进程需完整 env，不可只传单键）。
 *
 * @returns 传给子进程的 env 对象
 */
export function envForExamplesChildProcess(): Record<string, string> {
  return { ...getEnvAll(), [VIEW_FORCE_BUILD_JSX]: "compiler" };
}
