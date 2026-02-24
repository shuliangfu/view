/**
 * view 项目配置
 *
 * 用于 CLI：build / start / dev 会读取此文件。
 * - server.dev：dev 命令使用的 port、host、hmr
 * - server.prod：start 命令使用的 port、host
 * - build：对齐 @dreamer/esbuild 客户端编译选项，由 BuilderBundle.build() 使用
 * - build.dev：仅 dev 模式生效，覆盖顶层 build（如不压缩、保留 sourcemap）
 * - build.prod：仅 prod 模式生效，覆盖顶层 build
 */

import type { AppConfig } from "../src/server/types.ts";
import { tailwindPlugin } from "@dreamer/plugins/tailwindcss";
import { staticPlugin } from "@dreamer/plugins/static";

const config: AppConfig = {
  server: {
    port: 8787,
    host: "127.0.0.1",
    dev: {
      hmr: { enabled: true, path: "/__hmr" },
      watch: {
        paths: ["./src"],
        ignore: ["node_modules", ".git", "dist"],
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
    splitting: true,

    /** 资源处理：复制 src/assets（含 images）到 dist/assets，压缩并 hash 化图片 */
    assets: {
      publicDir: "src/assets",
      assetsDir: "assets",
      /** 排除会被其他插件编译的 CSS 源文件，只保留编译产物（如 tailwind.xxx.css） */
      exclude: ["tailwind.css", "index.css"],
      images: {
        compress: true,
        quality: 80, // 压缩质量 0-100，80 平衡质量与体积
        format: "avif", // 需 ImageMagick；若转换失败可改为 "original" 仅做 hash
        hash: true,
      },
    },

    /** 是否开启 BuilderClient 调试日志（resolver / onLoad 等），便于排查构建问题 */
    // debug: true,

    /** dev 模式下的覆盖：不压缩、保留 sourcemap，便于调试 */
    dev: {
      minify: false,
      sourcemap: true,
    },
    /** prod 模式下的覆盖：压缩、可关闭 sourcemap 减小体积 */
    prod: {
      minify: true,
      sourcemap: true,
    },
  },
  /**
   * 插件按注册顺序执行：先 tailwind（onRequest 可处理 /assets/tailwind.css，onResponse 注入 link），
   * 再 static（onRequest 返回 index.html 等静态文件）
   */
  plugins: [
    tailwindPlugin({
      output: "dist/assets",
      cssEntry: "src/assets/tailwind.css",
      assetsPath: "/assets",
    }),
    staticPlugin({
      statics: [
        { root: "src/assets", prefix: "/*" },
        { root: "dist", prefix: "/*" },
      ],
    }),
  ],
  /** 日志配置（可选）：未设时使用默认 level info、format text、仅控制台输出 */
  // logger: {
  //   level: "info",              // "debug" | "info" | "warn" | "error" | "fatal"
  //   format: "text",             // "text" | "json" | "color"
  //   showTime: true,             // 是否显示时间戳
  //   showLevel: true,            // 是否显示级别标签 [info]、[error] 等
  //   color: true,                // 是否启用颜色，默认自动检测
  //   output: {
  //     console: true,             // 是否输出到控制台
  //     file: {
  //       path: "runtime/logs/app.log",  // 日志文件路径
  //       rotate: true,            // 是否按大小轮转
  //       maxSize: 10 * 1024 * 1024,     // 单文件最大字节（如 10MB）
  //       maxFiles: 5,             // 轮转保留文件数
  //     },
  //   },
  // },
};

export default config;
