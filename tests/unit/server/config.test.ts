/**
 * @fileoverview `loadViewConfig`、`getServerConfigForMode`、`getBuildConfigForMode`。
 */
import {
  join,
  makeTempDir,
  remove,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";
import {
  getBuildConfigForMode,
  getServerConfigForMode,
  loadViewConfig,
} from "../../../src/server/core/config.ts";
import type { AppConfig } from "../../../src/server/types.ts";

describe("server/core/config", () => {
  it("loadViewConfig：无配置文件时应返回默认结构", async () => {
    const dir = await makeTempDir();
    try {
      const cfg = await loadViewConfig(dir);
      expect(cfg.build?.entry).toBe("src/main.tsx");
      expect(cfg.build?.outDir).toBe("dist");
      expect(cfg.server?.dev?.port).toBe(8787);
    } finally {
      await remove(dir, { recursive: true });
    }
  });

  it("loadViewConfig：应解析 view.config.json 并合并默认值", async () => {
    const dir = await makeTempDir();
    try {
      const jsonPath = join(dir, "view.config.json");
      await writeTextFile(
        jsonPath,
        JSON.stringify({
          name: "test-app",
          server: { dev: { port: 9999 } },
        }),
      );
      const cfg = await loadViewConfig(dir);
      expect(cfg.name).toBe("test-app");
      expect(cfg.server?.dev?.port).toBe(9999);
      expect(cfg.build?.entry).toBe("src/main.tsx");
    } finally {
      await remove(dir, { recursive: true });
    }
  });

  it("getServerConfigForMode：dev 模式应合并 dev.host/port", () => {
    const cfg: AppConfig = {
      server: {
        host: "0.0.0.0",
        port: 1111,
        dev: { host: "127.0.0.1", port: 2222, hmr: true },
        prod: { host: "0.0.0.0", port: 3333 },
      },
    };
    const dev = getServerConfigForMode(cfg, "dev");
    expect(dev.host).toBe("127.0.0.1");
    expect(dev.port).toBe(2222);
    expect(dev.dev?.hmr).toBe(true);

    const prod = getServerConfigForMode(cfg, "prod");
    expect(prod.host).toBe("0.0.0.0");
    expect(prod.port).toBe(3333);
    expect(prod.dev).toBeUndefined();
  });

  it("getBuildConfigForMode：应合并 mode 对应覆盖项", () => {
    const cfg: AppConfig = {
      build: {
        entry: "src/main.tsx",
        outDir: "dist",
        outFile: "main.js",
        minify: true,
        sourcemap: true,
        plugins: [],
        chunkNames: "[name]",
        dev: { minify: false },
      },
    };
    const devBuild = getBuildConfigForMode(cfg, "dev");
    expect(devBuild.minify).toBe(false);
    expect(devBuild.entry).toBe("src/main.tsx");
  });
});
