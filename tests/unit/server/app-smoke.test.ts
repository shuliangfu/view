/**
 * @fileoverview `createApp` 构造与基础字段（不执行真实 build/start）。
 */
import { describe, expect, it } from "@dreamer/test";
import { createApp } from "../../../src/server/core/app.ts";
import type { AppConfig } from "../../../src/server/types.ts";

describe("server/core/app (createApp)", () => {
  it("应构造 App 实例并保留 root、mode 与容器", () => {
    const viewConfig: AppConfig = {
      server: {
        dev: { port: 8787, host: "127.0.0.1" },
        prod: { port: 8788, host: "0.0.0.0" },
      },
      build: {
        entry: "src/main.tsx",
        outDir: "dist",
        outFile: "main.js",
        minify: false,
        sourcemap: false,
        plugins: [],
        chunkNames: "[name]",
      },
    };
    const app = createApp({
      root: "/tmp/view-app-smoke",
      mode: "dev",
      viewConfig,
    });
    expect(app.root).toBe("/tmp/view-app-smoke");
    expect(app.mode).toBe("dev");
    expect(app.container).toBeDefined();
    expect(app.plugins).toBeDefined();
  });
});
