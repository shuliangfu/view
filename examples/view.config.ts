/**
 * view 项目配置
 *
 * 用于 CLI：build / start / dev 会读取此文件。
 * - server.dev：dev 命令使用的 port、host、hmr
 * - server.prod：start 命令使用的 port、host
 * - build：对齐 @dreamer/esbuild 客户端编译选项，由 BuilderBundle.build() 使用
 */

import type { ViewConfig } from "../src/cmd/config.ts";

const config: ViewConfig = {
  server: {
    dev: {
      port: 8787,
      host: "127.0.0.1",
      dev: {
        hmr: { enabled: true, path: "/__hmr" },
        watch: {
          paths: ["./src"],
          ignore: ["node_modules", ".git", "dist"],
        },
      },
    },
    prod: {
      port: 8787,
      host: "127.0.0.1",
    },
  },
  build: {
    entry: "src/main.tsx",
    outDir: "dist",
    outFile: "main.js",
    minify: true,
    sourcemap: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "@dreamer/view",
    browserMode: false,
    splitting: true,
  },
};

export default config;
