/**
 * view 项目配置：view.config.ts 的加载与合并
 *
 * 类型定义在 ../types.ts（AppConfig），此处仅负责加载与合并。
 * 项目根目录下可放置 view.config.ts 或 view.config.json，CLI 的 build/start/dev 会读取并应用。
 */

import {
  existsSync,
  getEnv,
  join,
  pathToFileUrl,
  resolve,
} from "@dreamer/runtime-adapter";
import { $tr } from "../../i18n.ts";
import { logger } from "../utils/logger.ts";
import type {
  AppBuildConfig,
  AppConfig,
  AppServerDevConfig,
  AppServerDevOptions,
} from "../types.ts";

export type { AppBuildConfig, AppConfig } from "../types.ts";

/** 按 mode 合并后的服务器配置（host/port 已含默认值，dev 模式含 dev 选项） */
export interface MergedServerConfig {
  host: string;
  port: number;
  /** 仅 dev 模式时有值（hmr、watch） */
  dev?: AppServerDevOptions;
}

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";

const DEFAULT_CONFIG: AppConfig = {
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
    /** 默认走 compileSource，与既有 view 项目一致 */
    jsx: "compiler",
    plugins: [],
    chunkNames: "[name]-[hash]",
  },
};

/**
 * 从项目根目录加载 view.config.ts 或 view.config.json，合并默认配置后返回
 *
 * @param root 项目根目录（绝对或相对路径，会 resolve）
 * @returns 合并后的 AppConfig，若不存在配置文件则返回默认配置
 */
export async function loadViewConfig(root: string): Promise<AppConfig> {
  const base = resolve(root);

  const configTsPath = join(base, "view.config.ts");
  if (existsSync(configTsPath)) {
    try {
      const url = pathToFileUrl(configTsPath);
      const mod = await import(url);
      const user = (mod.default ?? mod) as AppConfig | undefined;
      if (user && typeof user === "object") {
        return mergeConfig(DEFAULT_CONFIG, user);
      }
    } catch (err) {
      logger.warn(
        $tr("cli.config.loadFailedTs", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  const configJsonPath = join(base, "view.config.json");
  if (existsSync(configJsonPath)) {
    try {
      const { readFile } = await import("@dreamer/runtime-adapter");
      const raw = await readFile(configJsonPath);
      const text = typeof raw === "string"
        ? raw
        : new TextDecoder().decode(raw);
      const user = JSON.parse(text) as AppConfig;
      if (user && typeof user === "object") {
        return mergeConfig(DEFAULT_CONFIG, user);
      }
    } catch (err) {
      logger.warn(
        $tr("cli.config.loadFailedJson", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return { ...defaultsDeep(DEFAULT_CONFIG) };
}

function mergeConfig(defaults: AppConfig, user: AppConfig): AppConfig {
  return {
    name: user.name ?? defaults.name,
    version: user.version ?? defaults.version,
    language: user.language ?? defaults.language,
    /** 合并后传入 setLoggerConfig，未设时为 undefined，使用默认 logger */
    logger: user.logger ?? defaults.logger,
    server: {
      host: user.server?.host ?? defaults.server?.host,
      port: user.server?.port ?? defaults.server?.port,
      dev: { ...defaults.server?.dev, ...user.server?.dev },
      prod: { ...defaults.server?.prod, ...user.server?.prod },
    },
    build: {
      ...defaults.build,
      ...user.build,
      plugins: user.build?.plugins ?? defaults.build?.plugins ?? [],
    },
    plugins: user.plugins ?? defaults.plugins ?? [],
  };
}

function defaultsDeep(config: AppConfig): AppConfig {
  return {
    server: config.server
      ? {
        host: config.server.host,
        port: config.server.port,
        dev: config.server.dev ? { ...config.server.dev } : undefined,
        prod: config.server.prod ? { ...config.server.prod } : undefined,
      }
      : undefined,
    build: config.build ? { ...config.build } : undefined,
    plugins: config.plugins ? [...config.plugins] : undefined,
  };
}

/**
 * 按模式（dev / prod）合并 server 与 server.dev 或 server.prod，供 start/dev 使用
 * 基础 server.host、server.port 会被 server.dev 或 server.prod 覆盖。
 */
export function getServerConfigForMode(
  config: AppConfig,
  mode: "dev" | "prod",
): MergedServerConfig {
  const base = config.server ?? {};
  const overrides = mode === "dev" ? config.server?.dev : config.server?.prod;
  const host = overrides?.host ?? base.host ?? DEFAULT_HOST;
  const port = overrides?.port ?? base.port ?? DEFAULT_PORT;
  const result: MergedServerConfig = { host, port };
  if (mode === "dev") {
    const devOverrides = overrides as AppServerDevConfig | undefined;
    if (devOverrides?.hmr !== undefined || devOverrides?.watch !== undefined) {
      result.dev = {
        hmr: devOverrides?.hmr,
        watch: devOverrides?.watch,
      };
    }
  }
  return result;
}

/**
 * 按模式（dev / prod）合并 build 与 build.dev 或 build.prod，供 CLI 构建使用
 */
export function getBuildConfigForMode(
  config: AppConfig,
  mode: "dev" | "prod",
): AppBuildConfig {
  const base = config.build ?? {};
  const overrides = mode === "dev" ? config.build?.dev : config.build?.prod;
  const merged: AppBuildConfig = {
    ...base,
    ...overrides,
    plugins: overrides?.plugins ?? base?.plugins ?? [],
  };
  /**
   * 供 E2E / CI 覆盖：examples 视图依赖 compileSource，`jsx: "runtime"` 会导致页面空白。
   * 子进程可设 `VIEW_FORCE_BUILD_JSX=compiler` 或 `runtime` 强制链路（见 tests/e2e）。
   */
  const forced = getEnv("VIEW_FORCE_BUILD_JSX");
  if (forced === "compiler" || forced === "runtime") {
    return { ...merged, jsx: forced };
  }
  return merged;
}
