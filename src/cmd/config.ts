/**
 * view 项目配置：view.config.ts 的类型定义与加载
 *
 * view 为前端项目，默认使用 CSR（客户端渲染）；用于配置启动服务器（端口、host）
 * 和编译（入口、输出目录、压缩、sourcemap 等）。项目根目录下可放置 view.config.ts
 * 或 view.config.json，CLI 的 build/start/dev 会读取并应用。
 */

import type { BuildPlugin } from "@dreamer/esbuild";
import type { DevConfig } from "@dreamer/server";
import {
  existsSync,
  join,
  pathToFileUrl,
  resolve,
} from "@dreamer/runtime-adapter";

/**
 * 开发环境服务器配置（dev 命令使用）
 */
export interface ViewServerDevConfig {
  /** 端口号，默认 8787，也可通过环境变量 PORT 覆盖 */
  port?: number;
  /** 主机名，默认 "127.0.0.1" */
  host?: string;
  /** 开发工具配置（hmr、watch），会传给 @dreamer/server 的 dev 选项 */
  dev?: Pick<DevConfig, "hmr" | "watch">;
}

/**
 * 生产环境服务器配置（start 命令使用）
 */
export interface ViewServerProdConfig {
  /** 端口号，默认 8787，也可通过环境变量 PORT 覆盖 */
  port?: number;
  /** 主机名，默认 "127.0.0.1" */
  host?: string;
}

/**
 * 服务器配置：按 dev / prod 分别配置 host、port；dev 下可配置 hmr
 */
export interface ViewServerConfig {
  dev?: ViewServerDevConfig;
  prod?: ViewServerProdConfig;
}

export interface SplittingStrategy {
  enabled?: boolean;
  byRoute?: boolean;
  byComponent?: boolean;
  bySize?: number;
  custom?: (path: string) => boolean;
}

/**
 * 编译配置（build / dev 时生效）
 *
 * 对齐 @dreamer/esbuild 的 BuilderBundle 客户端打包选项，CLI 读取后传给 bundler.build()。
 */
export interface ViewBuildConfig {
  /** 入口文件路径（相对项目根），默认 "src/main.tsx" */
  entry?: string;
  /** 输出目录（相对项目根），默认 "dist" */
  outDir?: string;
  /** 输出文件名（在 outDir 下），默认 "main.js" */
  outFile?: string;
  /** 是否压缩（生产构建），默认 true */
  minify?: boolean;
  /** 是否生成 sourcemap，默认 true */
  sourcemap?: boolean;
  /** 是否启用代码分割，默认 true */
  /** 代码分割配置，默认 { enabled: true, byRoute: true, byComponent: true, bySize: 50000 } */
  splitting?: boolean | SplittingStrategy;
  // @dreamer/esbuild ClientPlugin
  plugins: BuildPlugin[];
  //
  chunkNames?: string;
}

/**
 * view 项目完整配置（view.config.ts 的 default export 类型）
 */
export interface ViewConfig {
  /** 服务器相关 */
  server?: ViewServerConfig;
  /** 编译相关 */
  build?: ViewBuildConfig;
}

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";

const DEFAULT_CONFIG: ViewConfig = {
  server: {
    dev: {
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
    },
    prod: {
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
    },
  },
  build: {
    entry: "src/main.tsx",
    outDir: "dist",
    outFile: "main.js",
    minify: true,
    sourcemap: true,
    plugins: [],
    chunkNames: "[name]-[hash]",
  },
};

/**
 * 从项目根目录加载 view.config.ts 或 view.config.json，合并默认配置后返回
 *
 * @param root 项目根目录（绝对或相对路径，会 resolve）
 * @returns 合并后的 ViewConfig，若不存在配置文件则返回默认配置
 */
export async function loadViewConfig(root: string): Promise<ViewConfig> {
  const base = resolve(root);

  // 优先尝试 view.config.ts（支持 default export）
  const configTsPath = join(base, "view.config.ts");
  if (existsSync(configTsPath)) {
    try {
      const url = pathToFileUrl(configTsPath);
      const mod = await import(url);
      const user = (mod.default ?? mod) as ViewConfig | undefined;
      if (user && typeof user === "object") {
        return mergeConfig(DEFAULT_CONFIG, user);
      }
    } catch (err) {
      console.warn(
        "[view] Failed to load view.config.ts:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 其次尝试 view.config.json
  const configJsonPath = join(base, "view.config.json");
  if (existsSync(configJsonPath)) {
    try {
      const { readFile } = await import("@dreamer/runtime-adapter");
      const raw = await readFile(configJsonPath);
      const text = typeof raw === "string"
        ? raw
        : new TextDecoder().decode(raw);
      const user = JSON.parse(text) as ViewConfig;
      if (user && typeof user === "object") {
        return mergeConfig(DEFAULT_CONFIG, user);
      }
    } catch (err) {
      console.warn(
        "[view] Failed to load view.config.json:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { ...defaultsDeep(DEFAULT_CONFIG) };
}

/**
 * 合并用户配置到默认配置（server.dev / server.prod 浅合并）
 */
function mergeConfig(
  defaults: ViewConfig,
  user: ViewConfig,
): ViewConfig {
  return {
    server: {
      dev: { ...defaults.server?.dev, ...user.server?.dev },
      prod: { ...defaults.server?.prod, ...user.server?.prod },
    },
    build: {
      ...defaults.build,
      ...user.build,
      plugins: user.build?.plugins ?? [],
    },
  };
}

/**
 * 深拷贝一层默认值（避免直接改 DEFAULT_CONFIG）
 */
function defaultsDeep(config: ViewConfig): ViewConfig {
  return {
    server: config.server
      ? {
        dev: config.server.dev ? { ...config.server.dev } : undefined,
        prod: config.server.prod ? { ...config.server.prod } : undefined,
      }
      : undefined,
    build: config.build ? { ...config.build } : undefined,
  };
}
