/**
 * build 命令：仅调用框架 core（createApp + app.build()），不包含构建逻辑。
 *
 * @module @dreamer/view/server/cmd/build
 */

import { cwd, exit } from "@dreamer/runtime-adapter";
import { createApp } from "../core/app.ts";
import { loadViewConfig } from "../core/config.ts";

/**
 * CLI 入口：通过 createApp → app.build() 执行构建
 */
export async function main(_args?: string[]): Promise<void> {
  const root = cwd();
  const viewConfig = await loadViewConfig(root);
  const app = createApp({ root, mode: "prod", viewConfig });
  const code = await app.build();
  if (code !== 0) exit(1);
}
