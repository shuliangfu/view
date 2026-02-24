/**
 * 静态服务核心（类形式）：由 core/app 调用，提供 server.start()。
 * index.html 已移至 src/assets，由 static 插件提供；此处仅做 dev 内存构建产出与中间件链。
 *
 * @module @dreamer/view/server/core/serve
 */

import { $tr } from "../utils/i18n.ts";
import { logger } from "../utils/logger.ts";
import {
  type PathHandler,
  Server as HttpServer,
  type ServerOptions,
} from "@dreamer/server";
import type { DevServeOutput } from "./build.ts";

/** 中间件函数：与 @dreamer/server 的 use(ctx, next) 一致 */
export type ViewServerMiddleware = (
  ctx: {
    path: string;
    method: string;
    response?: Response;
    [k: string]: unknown;
  },
  next: () => Promise<void>,
) => Promise<void> | void;

/** dev 时从内存提供 main.js（已废弃，请用 devServeOutputs） */
export interface DevServeMainJs {
  path: string;
  content: string;
}

/**
 * 插件请求钩子：由 app 传入，用于在框架层触发插件的 onRequest / onResponse。
 * ctx 与 @dreamer/server 的 HttpContext 一致，可当作 @dreamer/plugin 的 RequestContext 使用。
 */
export interface ViewServerPluginRequestHooks {
  triggerRequest: (ctx: ViewServerContext) => Promise<Response | undefined>;
  triggerResponse: (ctx: ViewServerContext) => Promise<void>;
}

/** 与 @dreamer/server 中间件上下文兼容的 ctx 形状（含 request、path、method、response 等） */
export type ViewServerContext = {
  request: Request;
  path: string;
  method: string;
  response?: Response;
  url?: URL;
  headers?: Headers;
  [k: string]: unknown;
};

/** 启动服务时的选项；中间件由 app 统一注册后传入，如 static 插件提供的静态处理 */
export interface ViewServerOptions extends ServerOptions {
  devServeMainJs?: DevServeMainJs;
  devServeOutputs?: DevServeOutput[];
  getDevServeOutputs?: () => DevServeOutput[];
  /** dev 时入口文件相对路径，用于 /__css?path=__global__ 解析 main.tsx 中的全局 CSS，默认 "src/main.tsx" */
  devEntry?: string;
  /** 在 app 中统一注册的中间件列表（含 static 插件等），按顺序执行后未响应则返回 404 */
  middlewares?: ViewServerMiddleware[];
  /** 插件 onRequest/onResponse 钩子（有插件时由 app 传入，在框架 serve 层按请求触发） */
  pluginRequestHooks?: ViewServerPluginRequestHooks;
}

/** 兼容旧类型名 */
export type ViewServeOptions = ViewServerOptions;

/**
 * View 静态服务类
 *
 * 职责：dev 时内存构建产出、app 注册的中间件链（含 static 插件提供 index.html 等静态资源）。
 * 中间件在 app 中统一注册后通过 options.middlewares 传入。
 */
export class ViewServer {
  private readonly root: string;
  private readonly options: ViewServerOptions;
  private httpServer: HttpServer | null = null;

  constructor(root: string, options: ViewServerOptions = {}) {
    this.root = root;
    this.options = { ...options };
  }

  /**
   * 启动 HTTP 服务：dev 路径处理器、app 注册的中间件（含 static 插件），然后监听。
   */
  async start(): Promise<number> {
    const opts = this.options;
    const devServeOutputs = opts.devServeOutputs ?? [];
    const getDevServeOutputs = opts.getDevServeOutputs;
    const middlewares = opts.middlewares ?? [];

    const httpOptions: ServerOptions = {
      host: opts.host,
      port: opts.port,
      mode: opts.mode,
      dev: opts.dev,
      onListen: ({ host, port }: { host: string; port: number }) => {
        logger.info(`✅ ${$tr("cli.serve.started", { host, port })}`);
        console.log("");
      },
    };

    this.httpServer = new HttpServer(httpOptions);

    // 1. dev 时从内存提供构建产出（pathHandlers）；并支持 /__css 按路由返回页面 CSS（参考 dweb）
    const pathHandlers: PathHandler[] = [];
    const outputsGetter = getDevServeOutputs ?? (() => devServeOutputs);
    const initialOutputs = outputsGetter();

    if (initialOutputs.length > 0) {
      pathHandlers.push({
        pathPrefix: "/",
        handler: (req: Request): Response | null => {
          const pathname = new URL(req.url).pathname;
          if (pathname === "/" || pathname === "") return null;
          const outputs = outputsGetter();
          const outputMap = new Map<string, string>(
            outputs.map((o) => [o.path, o.content]),
          );
          const content = outputMap.get(pathname);
          if (content === undefined) return null;
          const isMap = pathname.endsWith(".map");
          const isCss = pathname.endsWith(".css");
          const contentType = isMap
            ? "application/json; charset=utf-8"
            : isCss
            ? "text/css; charset=utf-8"
            : "application/javascript; charset=utf-8";
          return new Response(content, {
            status: 200,
            headers: {
              "content-type": contentType,
              "cache-control": "no-store, no-cache, must-revalidate",
              "pragma": "no-cache",
            },
          });
        },
      });
    }
    if (pathHandlers.length > 0) {
      this.httpServer.setPathHandlers(() => pathHandlers);
    }

    // 2. GET/HEAD：可选插件 onRequest → 中间件链（含 static 插件提供 index.html 等）→ 未处理则 404 → 插件 onResponse
    const pluginRequestHooks = opts.pluginRequestHooks;
    this.httpServer.use(async (ctx, next) => {
      if (ctx.method !== "GET" && ctx.method !== "HEAD") {
        ctx.response = new Response("Method Not Allowed", { status: 405 });
        await next();
        return;
      }
      const runMiddlewaresAndFallback = async (): Promise<void> => {
        let i = 0;
        const runNext = async (): Promise<void> => {
          if (i < middlewares.length) {
            await middlewares[i++](ctx, runNext);
          } else if (!ctx.response) {
            ctx.response = new Response("Not Found", { status: 404 });
          }
        };
        await runNext();
      };
      if (pluginRequestHooks) {
        const res = await pluginRequestHooks.triggerRequest(ctx);
        if (res) {
          ctx.response = res;
        } else {
          await runMiddlewaresAndFallback();
        }
        await pluginRequestHooks.triggerResponse(ctx);
      } else {
        await runMiddlewaresAndFallback();
      }
      await next();
    });

    await this.httpServer.start();
    return 0;
  }
}
