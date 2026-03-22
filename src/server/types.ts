/**
 * View 应用配置类型定义（AppConfig）
 *
 * 供 view.config.ts / view.config.json 使用，所有配置项在此统一定义。
 * build 配置对齐 @dreamer/esbuild 的 ClientConfig，便于与 BuilderClient 一致。
 * 使用方式：import type { AppConfig } from "../src/server/types.ts";
 *
 * @module @dreamer/view/server/types
 */

import type { Logger, LoggerConfig } from "@dreamer/logger";
import type { Plugin } from "@dreamer/plugin";
import type {
  BuildPlugin,
  ClientBundleOptions,
  SourceMapConfig,
} from "@dreamer/esbuild";

// ==================== 开发工具（dev 子配置，与 @dreamer/server DevConfig 对齐） ====================

/** HMR 配置（开发模式热更新） */
export interface AppHMRConfig {
  /** 是否启用 HMR，默认 true */
  enabled?: boolean;
  /** WebSocket 路径，默认 "/__hmr" */
  path?: string;
  /** 客户端脚本路径（可选） */
  clientScript?: string;
}

/** 文件监听配置（开发模式 watch） */
export interface AppWatchConfig {
  /** 监听的文件/目录路径，如 ["./src"] */
  paths?: string[];
  /** 忽略的文件/目录模式，如 ["node_modules", ".git", "dist"] */
  ignore?: string[];
  /** 监听选项（如 recursive） */
  options?: { recursive?: boolean };
}

/** 开发环境下的 dev 子配置（hmr、watch），会传给 @dreamer/server；与 AppServerDevConfig 的 hmr/watch 同构 */
export interface AppServerDevOptions {
  hmr?: AppHMRConfig | boolean;
  watch?: AppWatchConfig | string[];
}

// ==================== 服务器配置 ====================

/** 开发环境服务器配置（dev 命令使用）；hmr、watch 直接写在 server.dev 下，无需再套一层 dev */
export interface AppServerDevConfig {
  /** 端口号，默认 8787，也可通过环境变量 PORT 覆盖 */
  port?: number;
  /** 主机名，默认 "127.0.0.1" */
  host?: string;
  /** HMR 配置，会传给 @dreamer/server 的 dev 选项 */
  hmr?: AppHMRConfig | boolean;
  /** 文件监听配置，会传给 @dreamer/server 的 dev 选项 */
  watch?: AppWatchConfig | string[];
}

/** 生产环境服务器配置（start 命令使用） */
export interface AppServerProdConfig {
  /** 端口号，默认 8787，也可通过环境变量 PORT 覆盖 */
  port?: number;
  /** 主机名，默认 "127.0.0.1" */
  host?: string;
}

/** 服务器配置：基础 host/port 可被 dev、prod 覆盖；dev 下可配置 hmr、watch */
export interface AppServerConfig {
  /** 主机名（基础配置，dev/prod 未指定时使用），默认 "127.0.0.1" */
  host?: string;
  /** 端口号（基础配置，dev/prod 未指定时使用），默认 8787 */
  port?: number;
  /** 开发环境配置，可覆盖顶层 host、port，并配置 hmr、watch */
  dev?: AppServerDevConfig;
  /** 生产环境配置，可覆盖顶层 host、port */
  prod?: AppServerProdConfig;
}

// ==================== 构建配置（对齐 @dreamer/esbuild ClientConfig） ====================

/**
 * 构建模式覆盖（与 AppBuildConfig 同结构，不含 dev/prod 自身）
 * 用于 build.dev / build.prod 在 dev 或 prod 模式下覆盖顶层 build。
 */
export type AppBuildOverride = Partial<
  Omit<AppBuildConfig, "dev" | "prod">
>;

/**
 * 编译配置（build / dev 时生效）
 *
 * 对齐 @dreamer/esbuild 的 ClientConfig：entry、bundle、sourcemap、cssImport、plugins、html 等
 * 与 BuilderClient 一致；outDir/outFile 为 view 层约定，会映射为 ClientConfig.output。
 * build.dev / build.prod 可与顶层 build 同结构，在 dev 或 prod 模式下覆盖顶层配置。
 */
export interface AppBuildConfig {
  /** 入口文件（单入口，相对项目根），默认 "src/main.tsx"，对应 ClientConfig.entry */
  entry?: string;
  /**
   * 多入口配置（与 entry 互斥），对应 ClientConfig.entries
   * 键为入口名，值为 { entry, output? }
   */
  entries?: {
    [name: string]: {
      entry: string;
      output?: string;
    };
  };
  /** 输出目录（相对项目根），默认 "dist"，与 outFile 一起映射为 ClientConfig.output */
  outDir?: string;
  /** 输出文件名（在 outDir 下），默认 "main.js" */
  outFile?: string;
  /**
   * 打包选项，对应 ClientConfig.bundle（@dreamer/esbuild ClientBundleOptions）
   * 含 minify、sourcemap、splitting、external、format、alias、chunkNames。
   * 若未设 bundle，下述顶层 shorthand 会并入 bundle 传给 BuilderClient。
   */
  bundle?: ClientBundleOptions;
  /** 是否压缩（生产构建），默认 true；shorthand，会并入 bundle.minify */
  minify?: boolean;
  /** 是否生成 sourcemap 或详细配置，默认 true；shorthand，会并入 bundle.sourcemap */
  sourcemap?: SourceMapConfig | boolean;
  /** 是否启用代码分割或细粒度配置；shorthand，会并入 bundle.splitting */
  splitting?: ClientBundleOptions["splitting"];
  /** 产出 chunk 命名模板，默认 "[name]-[hash]"；shorthand，会并入 bundle.chunkNames */
  chunkNames?: string;
  /** 插件列表，对应 ClientConfig.plugins */
  plugins?: BuildPlugin[];
  /**
   * CSS 导入处理，对应 ClientConfig.cssImport
   * 默认 { enabled: true, extract: false }；extract: true 时产出独立 .css，dev 时 serve 会自动注入 <link>
   */
  cssImport?: {
    enabled?: boolean;
    extract?: boolean;
    cssOnly?: boolean;
  };
  /** 是否启用调试日志（resolver / onLoad 等），对应 ClientConfig.debug */
  debug?: boolean;
  /** 日志实例（未传时使用默认 logger），使用 @dreamer/logger 的 Logger */
  logger?: Logger;
  /**
   * 是否启用 View 编译优化插件（createOptimizePlugin，对 .tsx 做常量折叠与静态提升）。
   * 仅生产构建生效；默认 true。View 层专用，非 esbuild 字段。
   */
  optimize?: boolean;
  /**
   * TSX/JSX 走哪条链路（dev / prod 均生效；也可用 build.dev / build.prod 覆盖）。
   *
   * - **compiler**（默认）：esbuild 加载 `.tsx` 前经 `compileSource`，与 `view` 模板编译器产物一致（`insert`、指令等）。
   * - **runtime**：不经 `compileSource`，由 esbuild 按 `jsx: "automatic"` + `jsxImportSource: "@dreamer/view"` 转为 `jsx`/`jsxs`，
   *   行为对齐手写 `jsx-runtime` 路径；若源码依赖仅编译器支持的语法，请勿用此项。
   *
   * 环境变量 **`VIEW_FORCE_BUILD_JSX`**（`compiler` | `runtime`）可覆盖本项，供 E2E 在子进程中强制 `compiler`。
   */
  jsx?: "compiler" | "runtime";
  /**
   * 资源处理：生产构建完成后由 @dreamer/esbuild 的 AssetsProcessor 执行。
   * 复制 publicDir 到 outDir/assetsDir，排除 exclude，并对图片做压缩/格式/hash；会更新产出中的引用路径并生成 asset-manifest.json。
   */
  assets?: AppAssetsConfig;
  /** 仅 dev 模式生效：与顶层 build 同结构，覆盖顶层配置（如 minify: false、sourcemap: true） */
  dev?: AppBuildOverride;
  /** 仅 prod 模式生效：与顶层 build 同结构，覆盖顶层配置 */
  prod?: AppBuildOverride;
}

/** 图片处理选项（与 @dreamer/esbuild AssetsConfig.images 一致） */
export interface AppAssetsImageOptions {
  compress?: boolean;
  format?: "webp" | "avif" | "original";
  hash?: boolean;
  quality?: number;
}

/**
 * 资源处理配置（与 @dreamer/esbuild AssetsConfig 结构一致，供 AssetsProcessor 使用）
 */
export interface AppAssetsConfig {
  /** 静态资源源目录（相对 cwd），复制到 outDir/assetsDir */
  publicDir?: string;
  /** 输出子目录（默认 "assets"），复制目标为 outDir/assetsDir */
  assetsDir?: string;
  /** 复制时排除的文件/目录（相对于 publicDir），如 ["tailwind.css", "index.css"] */
  exclude?: string[];
  /** 图片处理：压缩、格式转换、hash 文件名（需 @dreamer/image） */
  images?: AppAssetsImageOptions;
}

// ==================== 应用完整配置（view.config.ts 的 default export 类型） ====================

/**
 * View 应用完整配置（AppConfig）
 *
 * view.config.ts 或 view.config.json 的 default export 应满足此类型。
 * CLI 的 build / start / dev 会读取并应用。
 */
export interface AppConfig {
  /** 应用名称（可选，用于展示、文档等） */
  name?: string;
  /** 应用版本（可选，如 "1.0.0"） */
  version?: string;
  /** 默认语言（可选，如 "en-US"、"zh-CN"，用于 i18n、日志等） */
  language?: string;
  /** Server 日志配置（可选），直接使用 @dreamer/logger 的 LoggerConfig，未设时使用默认：level info、format text、output console */
  logger?: LoggerConfig;
  /** 服务器相关：dev 与 prod 的 port、host、dev 下 hmr/watch */
  server?: AppServerConfig;
  /** 编译相关：入口、输出、压缩、sourcemap、splitting、plugins 等 */
  build?: AppBuildConfig;
  /** 插件列表，使用 @dreamer/plugin 的 Plugin 类型，由 ViewApp 解析并注册 */
  plugins?: Plugin[];
}
