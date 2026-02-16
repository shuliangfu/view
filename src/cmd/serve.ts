/**
 * 静态服务（带 SPA fallback）：从项目根目录提供文件，无匹配时返回 index.html
 * 供 cmd/start.ts（prod）与 dev（dev）使用，项目内无需再维护 server.ts
 *
 * 使用 @dreamer/server 的 Http 提供 HTTP 服务，使用 @dreamer/plugins/static 提供静态资源，
 * 使用 @dreamer/runtime-adapter 的 readFile/upgradeWebSocket/getEnv 兼容 Deno/Bun。
 * 通过 options.mode 区分 dev/prod，使用 view.config 中的 server.dev / server.prod；dev 下可配置 HMR。
 * 当 dev 构建产出 .css 文件（build.cssImport.extract: true）时，会在返回 index.html 时注入 <link> 标签。
 */

import { injectCSSIntoHTML } from "@dreamer/esbuild/css-injector";
import { existsSync, readFile, resolve } from "@dreamer/runtime-adapter";
import {
  HttpContext,
  type PathHandler,
  Server as HttpServer,
  type ServerOptions,
} from "@dreamer/server";

/** dev 时从内存提供 main.js，不写 outDir（已废弃，请用 devServeOutputs） */
export interface DevServeMainJs {
  /** 请求路径，如 "/dist/main.js" */
  path: string;
  /** 内存中的打包结果 */
  content: string;
}

/**
 * dev 时从内存提供构建产物（含 main.js 与 chunk-xxx.js），避免开启 code splitting 时
 * 请求 chunk 落到 SPA fallback 返回 HTML 导致 MIME 类型错误。
 */
export interface DevServeOutput {
  /** 请求路径，如 "/dist/main.js"、"/dist/chunk-xxx.js" */
  path: string;
  /** 内存中的内容 */
  content: string;
}

/** 启动 serve 时的选项：不传 mode 时仅用 port/host（兼容旧用法） */
export interface ViewServeOptions extends ServerOptions {
  /** dev 时提供：从内存提供 main.js，不写入 outDir（兼容旧用法，与 devServeOutputs 二选一） */
  devServeMainJs?: DevServeMainJs;
  /** dev 时提供：从内存提供全部构建产物（main.js + chunk-*.js 等），开启 code splitting 时必传 */
  devServeOutputs?: DevServeOutput[];
  /** dev 时可选：每次请求用该 getter 取最新产出，HMR rebuild 后更新以便浏览器拉到新 chunk */
  getDevServeOutputs?: () => DevServeOutput[];
}

/** 根目录规范化：去掉末尾斜杠 */
function normalizeRoot(root: string): string {
  return root.replace(/\/+$/, "") || ".";
}

/**
 * 启动静态服务，SPA fallback；阻塞直到进程结束（Ctrl+C 等）
 * 使用 @dreamer/server 的 Http、@dreamer/plugins/static 提供静态与 SPA fallback，
 * 使用 runtime-adapter 的 getEnv/readFile/upgradeWebSocket 兼容 Deno 与 Bun。
 * 当 options.mode 为 dev/prod 时从 view.config 读取 server.dev / server.prod；dev 下可按配置启用 HMR。
 *
 * @param root 项目根目录（含 index.html、dist/ 等）
 * @param portOrOptions 兼容旧用法：仅传 number 时为 port；传对象时为 ServeOptions（mode、port、host、resolved）
 * @returns 进程退出码（正常结束为 0）
 */
export async function run(
  root: string,
  options?: ViewServeOptions,
): Promise<number> {
  const base = normalizeRoot(root);

  const devServeOutputs = options?.devServeOutputs ?? [];
  const getDevServeOutputs = options?.getDevServeOutputs;
  delete options?.devServeOutputs;
  delete options?.getDevServeOutputs;

  // console.log(options);

  const httpOptions: ServerOptions = {
    ...options,
    // 优先使用调用方传入的 mode（dev/start 会传），否则用环境变量，保证 dev 时一定为 "dev" 才能启动 DevTools/HMR
    onListen: ({ host, port }: { host: string; port: number }) => {
      console.log(`✅ Server started http://${host}:${port}`);
      console.log("");
    },
  };

  const app = new HttpServer(httpOptions);

  app.http.use(async (ctx, next) => {
    if (ctx.path === "/" || ctx.path === "") {
      ctx.response = await serveIndexHtml();
    }
    await next();
  });

  /** 返回 index.html 内容（SPA fallback）；dev 且存在内存产出时重写 dist 为无前缀，使 /main.js 可用；若有 .css 产出则注入 <link> */
  async function serveIndexHtml(): Promise<Response> {
    try {
      const raw = await readFile(`${base}/index.html`);
      let str = typeof raw === "string"
        ? raw
        : new TextDecoder().decode(raw as Uint8Array);
      const outputs = outputsGetter();
      const cssPaths = outputs
        .filter((o) => o.path.endsWith(".css"))
        .map((o) => (o.path.startsWith("/") ? o.path : "/" + o.path));
      if (cssPaths.length > 0) {
        str = injectCSSIntoHTML(str, cssPaths, {});
      }
      const out = initialOutputs.length > 0
        ? str.replace(/(["'])\.\/dist\//g, "$1./").replace(
          /(["'])\/dist\//g,
          "$1/",
        )
        : str;
      return new Response(out, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("index.html not found", { status: 404 });
    }
  }

  /** 按扩展名返回常见静态资源的 Content-Type */
  const CONTENT_TYPES: Record<string, string> = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".cjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2",
  };

  /**
   * 尝试从 base 目录提供静态文件；路径会做规范化与越界检查，防止 path traversal。
   * 仅 GET/HEAD 且非根路径时使用；找不到或越界时返回 null，由调用方回退到 index.html。
   */
  async function tryServeStatic(pathname: string): Promise<Response | null> {
    const relative = pathname.replace(/^\//, "").split("/").filter(
      (p) => p && p !== "." && p !== "..",
    ).join("/");
    if (!relative) return null;
    const normalizedBase = resolve(base).replace(/\/+$/, "") || "/";
    const filePath = resolve(base, relative);
    if (
      filePath !== normalizedBase && !filePath.startsWith(normalizedBase + "/")
    ) {
      return null;
    }
    if (!existsSync(filePath)) return null;
    try {
      const raw = await readFile(filePath);
      const body = typeof raw === "string" ? raw : (raw as Uint8Array);
      const ext = pathname.includes(".")
        ? pathname.slice(pathname.lastIndexOf("."))
        : "";
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
      return new Response(body as BodyInit, {
        status: 200,
        headers: { "content-type": contentType },
      });
    } catch {
      return null;
    }
  }

  const pathHandlers: PathHandler[] = [];

  const outputsGetter = getDevServeOutputs ?? (() => devServeOutputs);
  const initialOutputs = outputsGetter();
  if (initialOutputs.length > 0) {
    /* 用 "/" 作为 prefix，使 /main.js、/src/main.js、/dist/chunk-xxx.js 等任意产出路径都能命中 outputMap；
     * 关闭代码分割时产出可能为 /src/main.js，而 index 请求 /main.js，必须统一走 map 查找 */
    const pathPrefix = "/";

    /* 单文件或多文件都走 pathHandler，每次请求用 getter 取最新产出以支持 HMR；"/" 不处理以便走中间件读 index.html */
    pathHandlers.push({
      pathPrefix,
      handler: (req: Request): Response | null => {
        const pathname = new URL(req.url).pathname;
        if (pathname === "/" || pathname === "") {
          return null;
        }
        const outputs = outputsGetter();
        const outputMap = new Map<string, string>(
          outputs.map((o) => [o.path, o.content]),
        );
        const content = outputMap.get(pathname);
        if (content === undefined) {
          /* 非构建产出（如 /favicon.svg）交给后续中间件，由 tryServeStatic 从 base 提供 */
          return null;
        }
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
    app.setPathHandlers(() => pathHandlers);
  }

  app.use(async (ctx, next) => {
    if (ctx.method !== "GET" && ctx.method !== "HEAD") {
      ctx.response = new Response("Method Not Allowed", { status: 405 });
      await next();
      return;
    }

    const reqCtx: HttpContext = {
      request: ctx.request,
      path: ctx.path,
      method: ctx.method,
      url: ctx.url,
      headers: ctx.headers,
      response: undefined,
      cookies: {
        get: () => undefined,
        set: () => {},
        remove: () => {},
        getAll: () => ({}),
      },
    };

    if (reqCtx.response) {
      ctx.response = reqCtx.response;
    } else {
      const staticRes = await tryServeStatic(ctx.path);
      ctx.response = staticRes ?? await serveIndexHtml();
      await next();
      return;
    }
    await next();
  });

  await app.start();

  return 0;
}
