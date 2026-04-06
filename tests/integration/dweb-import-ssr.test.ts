/**
 * 集成：在 **dweb view-hybrid/basic** 的 import 映射下跑 SSR 冒烟脚本，
 * 调试「`document is not defined` + microtask flush」类问题。
 *
 * 运行：`deno test -A tests/integration/dweb-import-ssr.test.ts`
 * （需在 monorepo 中存在 `dweb/examples/view-hybrid/basic`。）
 */

import {
  createCommand,
  dirname,
  execPath,
  exists,
  fromFileUrl,
  resolve,
} from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";

/** 本目录 */
const INTEGRATION_DIR = dirname(fromFileUrl(import.meta.url));
/** `view` 包根 */
const VIEW_ROOT = resolve(INTEGRATION_DIR, "../..");
/** monorepo 根（`view` 的上一级） */
const REPO_ROOT = resolve(VIEW_ROOT, "..");
/** dweb 官方示例中与用户 `deno task dev` 一致的配置目录 */
const DWEB_VIEW_HYBRID_BASIC = resolve(
  REPO_ROOT,
  "dweb/examples/view-hybrid/basic",
);
const SMOKE_RUNNER = resolve(INTEGRATION_DIR, "ssr-dweb-smoke-runner.ts");
const BASIC_CONFIG = resolve(DWEB_VIEW_HYBRID_BASIC, "deno.json");

describe("integration：dweb 式 import 下 View SSR", () => {
  it("当不存在 dweb 示例目录时跳过子进程（不失败）", async () => {
    if (await exists(DWEB_VIEW_HYBRID_BASIC)) {
      return;
    }
    expect(await exists(SMOKE_RUNNER)).toBe(true);
  });

  it("子进程使用 basic/deno.json 跑冒烟脚本：stderr 不得含 document is not defined", async () => {
    if (!await exists(DWEB_VIEW_HYBRID_BASIC)) {
      console.warn(
        "[dweb-import-ssr] 跳过：未找到",
        DWEB_VIEW_HYBRID_BASIC,
      );
      return;
    }
    if (!await exists(SMOKE_RUNNER)) {
      throw new Error("ssr-dweb-smoke-runner.ts 缺失");
    }

    const isBun = execPath().includes("bun");
    const cmd = createCommand(execPath(), {
      args: isBun ? ["run", SMOKE_RUNNER] : [
        "run",
        "-A",
        `--config=${BASIC_CONFIG}`,
        SMOKE_RUNNER,
      ],
      cwd: DWEB_VIEW_HYBRID_BASIC,
      stdout: "piped",
      stderr: "piped",
    });

    const out = await cmd.output();
    const stderr = new TextDecoder().decode(out.stderr);
    const stdout = new TextDecoder().decode(out.stdout);

    if (!out.success) {
      console.error("[dweb-import-ssr] stderr:\n", stderr);
      console.error("[dweb-import-ssr] stdout:\n", stdout);
    }
    expect(out.success).toBe(true);
    expect(stderr).not.toContain("document is not defined");
    expect(stderr).not.toContain("ReferenceError");
    expect(stdout).toContain("[ssr-dweb-smoke] ok");
  });
});
