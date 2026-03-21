/**
 * View 应用主类（框架核心入口）
 *
 * 在类内完成：配置初始化、服务容器、插件、中间件（内置）的初始化。
 * start/build 调用 core/serve、core/build；cmd 仅调用本模块方法。
 *
 * @module @dreamer/view/server/core/app
 */

import { PluginManager } from "@dreamer/plugin";
import type { Plugin } from "@dreamer/plugin";
import { ServiceContainer } from "@dreamer/service";
import { cwd, join, setEnv } from "@dreamer/runtime-adapter";
import { getServerConfigForMode, loadViewConfig } from "./config.ts";
import type { AppConfig } from "./config.ts";
import { ViewServer } from "./serve.ts";
import type { ViewServerMiddleware, ViewServerOptions } from "./serve.ts";
import { prepareDevBuild, runBuildWithConfig } from "./build.ts";
import {
  $tr,
  normalizeLanguageToLocale,
  setViewLocale,
} from "../../i18n.ts";
import { logger, setLoggerConfig } from "../utils/logger.ts";

/** 创建 App 时的选项（可传入已加载的 viewConfig，否则从 root 加载） */
export interface CreateAppOptions {
  /** 项目根目录，默认 cwd() */
  root?: string;
  /** 模式：dev 或 prod，影响 start 时是否做内存构建与 HMR */
  mode?: "dev" | "prod";
  /** 已加载的 view 配置；不传则从 root 加载 view.config */
  viewConfig?: AppConfig;
}

/** View 应用实例接口（由 App 类实现） */
export interface ViewApp {
  readonly container: ServiceContainer;
  readonly plugins: PluginManager;
  registerPlugin(plugin: Plugin): void;
  /** 注册服务端中间件（在 app 中统一注册，start 时传给 ViewServer 按序执行） */
  use(middleware: ViewServerMiddleware): void;
  start(): Promise<number>;
  build(): Promise<number>;
}

/**
 * View 应用主类
 *
 * 构造函数内完成同步初始化：服务容器、插件管理器；
 * 异步初始化（配置加载、注册插件）在 _initialize() 中完成，由 start()/build() 首次调用时 await。
 */
export class App implements ViewApp {
  /** 项目根目录 */
  readonly root: string;
  /** 运行模式 */
  readonly mode: "dev" | "prod";
  /** 服务容器（配置、root、mode 等注册于此） */
  readonly container: ServiceContainer;
  /** 插件管理器 */
  readonly plugins: PluginManager;
  /** 在 app 中统一注册的中间件（start 时传给 ViewServer 按序执行，含 static 等插件提供者） */
  private _middlewares: ViewServerMiddleware[] = [];
  /** 已加载的 view 配置（在 _initialize 后可用） */
  private _viewConfig!: AppConfig;
  /** 构造函数传入的配置（可选，未传则从 root 加载） */
  private _configFromOptions?: AppConfig;
  /** 异步初始化 Promise（配置加载、插件注册） */
  private _initPromise: Promise<void>;
  /** 是否已完成初始化 */
  private _initialized = false;

  /**
   * 创建 App 实例
   * 同步完成：服务容器、插件管理器；异步完成：配置加载、插件注册（在 start/build 时 await）
   */
  constructor(options: CreateAppOptions = {}) {
    this.root = options.root ?? cwd();
    this.mode = options.mode ?? "prod";
    this._configFromOptions = options.viewConfig;

    // 1. 服务容器初始化
    this.container = new ServiceContainer();
    this.container.registerSingleton("ViewRoot", () => this.root);
    this.container.registerSingleton("ViewMode", () => this.mode);
    this.container.registerSingleton("ViewApp", () => this);

    // 2. 插件管理器初始化
    this.plugins = new PluginManager(this.container, {
      autoActivate: false,
      continueOnError: true,
    });

    // 3. 异步初始化：配置加载、AppConfig 注册、插件注册（内置 + viewConfig.plugins）
    this._initPromise = this._initialize();
  }

  /**
   * 注册服务端中间件（插件或调用方在 bootstrap 前/后通过 app.use() 注册，start 时传给 ViewServer）
   */
  use(middleware: ViewServerMiddleware): void {
    this._middlewares.push(middleware);
  }

  /**
   * 异步初始化：加载配置、注册到容器、注册插件；中间件通过 app.use() 或插件注册。
   */
  private async _initialize(): Promise<void> {
    // 配置初始化：未传入则从 root 加载
    this._viewConfig = this._configFromOptions ??
      await loadViewConfig(this.root);
    this.container.registerSingleton("AppConfig", () => this._viewConfig);

    // 根据 config.language 设置 i18n locale 与语言环境变量（LANG），供 detectLocale() 等使用
    const lang = this._viewConfig.language;
    if (lang) {
      const locale = normalizeLanguageToLocale(lang);
      if (locale) {
        setViewLocale(locale);
        try {
          setEnv("LANG", lang);
        } catch {
          // 部分环境只读时忽略
        }
      }
    }

    // 插件初始化：view.config.ts 中 plugins 为 Plugin 实例数组，由 ViewApp 注册
    const plugins = this._viewConfig.plugins ?? [];
    for (const plugin of plugins) {
      this.plugins.register(plugin);
    }

    // 应用 view.config 中的 logger 配置到 Server 统一 logger
    setLoggerConfig(this._viewConfig.logger);

    // 中间件：view 不向用户暴露 use()，内置中间件（index、static、spa fallback）在 serve 层配置，此处无需初始化
    this._initialized = true;
  }

  /** 等待初始化完成（供 start/build 内部使用） */
  private async _ensureInitialized(): Promise<void> {
    await this._initPromise;
  }

  /** 注册单个插件 */
  registerPlugin(plugin: Plugin): void {
    this.plugins.register(plugin);
  }

  /**
   * 启动 HTTP 服务（dev 时先 prepareDevBuild 再 runServe，prod 时直接 runServe）
   */
  async start(): Promise<number> {
    await this._ensureInitialized();

    const registered = this.plugins.getRegisteredPlugins();
    if (registered.length > 0) {
      await this.plugins.bootstrap();
    }

    const viewConfig = this._viewConfig;
    const serverConfig = getServerConfigForMode(viewConfig, this.mode);
    const { host, port } = serverConfig;
    const outDir = viewConfig.build?.outDir ?? "dist";

    if (this.mode === "dev") {
      setEnv("DENO_ENV", "dev");
      const { devServeOutputs, rebuild } = await prepareDevBuild(
        this.root,
        viewConfig,
      );
      if (devServeOutputs.length === 0) {
        logger.warn($tr("cli.dev.noOutput"));
      }
      let latestOutputs = devServeOutputs;
      const getDevServeOutputs = () => latestOutputs;
      const watchCfg = serverConfig.dev?.watch;
      const watchPaths = Array.isArray(watchCfg)
        ? watchCfg
        : (watchCfg?.paths ?? ["./src"]);
      const baseIgnore = Array.isArray(watchCfg)
        ? ["node_modules", ".git", "dist"]
        : (watchCfg?.ignore ?? ["node_modules", ".git", "dist"]);
      const watchIgnore = baseIgnore.some((s) => s.includes("routers.tsx"))
        ? baseIgnore
        : [...baseIgnore, "routers.tsx"];
      const hmr = serverConfig.dev?.hmr;
      const obj = typeof hmr === "object" && hmr !== null ? hmr : null;
      const serveOptions: ViewServerOptions = {
        host,
        port,
        mode: "dev",
        dev: {
          hmr: {
            enabled: obj?.enabled ?? true,
            path: obj?.path ?? "/__hmr",
          },
          watch: { paths: watchPaths, ignore: watchIgnore },
          builder: {
            rebuild(opts?: { changedPath?: string }) {
              return rebuild(opts).then((result) => {
                latestOutputs = result.devServeOutputs;
                return {
                  outputFiles: result.outputFiles,
                  chunkUrl: result.chunkUrl,
                  routePath: result.routePath,
                };
              });
            },
          },
        },
        devServeOutputs,
        getDevServeOutputs,
        devEntry: viewConfig.build?.entry ?? "src/main.tsx",
        middlewares: this._middlewares,
        pluginRequestHooks: registered.length > 0
          ? {
            triggerRequest: (ctx) =>
              this.plugins.triggerRequest(
                ctx as Parameters<typeof this.plugins.triggerRequest>[0],
              ),
            triggerResponse: (ctx) =>
              this.plugins.triggerResponse(
                ctx as Parameters<typeof this.plugins.triggerResponse>[0],
              ),
          }
          : undefined,
      };
      const server = new ViewServer(this.root, serveOptions);
      const code = await server.start();
      if (registered.length > 0) {
        await this.plugins.triggerStart();
      }
      return code;
    }

    setEnv("DENO_ENV", "prod");
    const prodRoot = join(this.root, outDir);
    const server = new ViewServer(prodRoot, {
      host,
      port,
      middlewares: this._middlewares,
      pluginRequestHooks: registered.length > 0
        ? {
          triggerRequest: (ctx) =>
            this.plugins.triggerRequest(
              ctx as Parameters<typeof this.plugins.triggerRequest>[0],
            ),
          triggerResponse: (ctx) =>
            this.plugins.triggerResponse(
              ctx as Parameters<typeof this.plugins.triggerResponse>[0],
            ),
        }
        : undefined,
    });
    const code = await server.start();
    if (registered.length > 0) {
      await this.plugins.triggerStart();
    }
    return code;
  }

  /**
   * 执行生产构建（generateRoutersFile + BuilderClient.build）
   * 会依次：bootstrap 插件 → triggerBuild（如 Tailwind 编译 CSS 到 dist/assets）→ runBuildWithConfig → triggerBuildComplete。
   */
  async build(): Promise<number> {
    await this._ensureInitialized();
    const registered = this.plugins.getRegisteredPlugins();
    if (registered.length > 0) {
      await this.plugins.bootstrap();
      await this.plugins.triggerBuild({
        mode: "prod",
        target: "client",
        outDir: this._viewConfig.build?.outDir ?? "dist",
      });
    }
    const exitCode = await runBuildWithConfig(this.root, this._viewConfig);
    if (registered.length > 0) {
      await this.plugins.triggerBuildComplete({
        outputFiles: [],
        duration: 0,
      });
    }
    return exitCode;
  }
}

/**
 * 创建 View 应用实例（工厂函数，便于 cmd 与外部调用）
 * 返回 App 类实例，需调用 app.start() 或 app.build() 启动或构建。
 */
export function createApp(options: CreateAppOptions = {}): App {
  return new App(options);
}
