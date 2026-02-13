/**
 * build 命令：前端 CSR 构建，使用 @dreamer/esbuild BuilderClient 编译，写入 outDir
 * 读取 view.config 的 build（entry、outDir、outFile、minify、sourcemap 等）。
 * 与 dweb 一致，使用 BuilderClient + ClientConfig；engine 用 "view"；支持 HMR 的 prepareDevBuild（createContext + rebuild 内存编译）。
 */

import { BuilderClient, type ClientConfig } from "@dreamer/esbuild";
import {
  basename,
  cwd,
  dirname,
  existsSync,
  exit,
  join,
  mkdir,
  readFile,
  resolve,
  setEnv,
  writeFile,
} from "@dreamer/runtime-adapter";
import type { ViewConfig } from "./config.ts";
import { loadViewConfig } from "./config.ts";

/**
 * 开发模式在 main.js 开头注入的 __HMR_REFRESH__（无感刷新）：
 * unmount 当前 root，再 import(mainUrl?t=ts) 拉取并执行新 main，由新 main 的 createRoot 重新渲染；
 * hmrOpts.chunkUrl 由服务端下发，可选先 import(chunkUrl) 预加载再拉 main；每次 rebuild 的 chunkUrl 已是新 hash，无需再拼 ?t=。
 * 若 import 失败或超时后 #root 仍为空则回退整页重载。
 */
const HMR_BANNER = `
(function(){
  var g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : {}));
  var getMainUrl = function(){
    try {
      var s = (typeof document !== "undefined" && document.currentScript) ? document.currentScript : null;
      var src = s && (s.src || (s.getAttribute && s.getAttribute("src")));
      var path = src ? src.split("?")[0] : "/dist/main.js";
      if (typeof g.location !== "undefined" && g.location.origin && path.indexOf("http") !== 0) {
        return g.location.origin + (path.indexOf("/") === 0 ? path : "/" + path);
      }
      return path;
    } catch (e) { return "/dist/main.js"; }
  };
  g.__HMR_REFRESH__ = function(hmrOpts){
    var reload = function(){
      if (typeof g.location !== "undefined") g.location.reload();
    };
    var chunkUrl = hmrOpts && hmrOpts.chunkUrl;
    var r = g.__VIEW_ROOT__;
    var mainUrl = getMainUrl();
    mainUrl = mainUrl + (mainUrl.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
    var runMain = function(){
      g.__VIEW_HMR_CLEAR_ROUTE_CACHE__ = true;
      if (r && typeof r.unmount === "function") r.unmount();
      var clearRoot = function(){
        var rootEl = typeof g.document !== "undefined" && g.document.getElementById ? g.document.getElementById("root") : null;
        if (rootEl) { while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild); }
      };
      clearRoot();
      import(/* @vite-ignore */ mainUrl)
        .then(function(){
          var el = typeof g.document !== "undefined" && g.document.getElementById ? g.document.getElementById("root") : null;
          var check = function(){
            if (!el){
              console.warn("[view] HMR: #root 不存在，回退整页重载");
              reload();
              return;
            }
            if (el.childNodes.length === 0){
              console.warn("[view] HMR 无感刷新后容器仍为空，回退整页重载");
              reload();
            }
          };
          var raf = typeof g.requestAnimationFrame !== "undefined" ? g.requestAnimationFrame : function(f){ setTimeout(f, 16); };
          raf(function(){ raf(check); });
          setTimeout(check, 500);
        })
        .catch(function(err){
          console.warn("[view] HMR 无感刷新失败，回退整页重载:", err?.message || err);
          reload();
        });
    };
    if (chunkUrl && typeof chunkUrl === "string" && g.__VIEW_HMR_BUMP__) {
      var routePath = hmrOpts && hmrOpts.routePath;
      if (typeof routePath !== "string") {
        var name = chunkUrl.split("/").pop() || "";
        var base = name.replace(/\\.js$/i, "");
        var seg = base;
        var lastDash = base.lastIndexOf("-");
        if (lastDash > 0) {
          var after = base.slice(lastDash + 1);
          if (/^[a-f0-9]{6,12}$/i.test(after)) seg = base.slice(0, lastDash);
        }
        routePath = (seg === "home" || seg === "index") ? "/" : "/" + seg;
      }
      if (typeof routePath === "string") {
        if (!g.__VIEW_HMR_CHUNK_FOR_PATH__) g.__VIEW_HMR_CHUNK_FOR_PATH__ = {};
        g.__VIEW_HMR_CHUNK_FOR_PATH__[routePath] = chunkUrl;
      }
      g.__VIEW_HMR_CLEAR_ROUTE_CACHE__ = true;
      import(/* @vite-ignore */ chunkUrl).then(function(){ g.__VIEW_HMR_BUMP__(); }).catch(runMain);
      return;
    }
    runMain();
  };
})();
`;

/**
 * 向 dev 产出的入口文件注入 HMR banner。
 */
function injectHmrBannerIntoEntry(
  outputs: DevServeOutput[],
  entryFileName: string,
): void {
  const entry = outputs.find((o) =>
    o.path.endsWith(entryFileName) && !o.path.endsWith(".map")
  );
  if (entry) {
    entry.content = entry.content + "\n" + HMR_BANNER;
  }
}

/** dev 时从内存提供单条产出（路径 + 内容），供 serve 与 HMR 使用 */
export interface DevServeOutput {
  path: string;
  content: string;
}

/** 开发模式 HMR 重建结果：outputFiles 供 server 广播，chunkUrl/routePath 供细粒度 HMR，devServeOutputs 用于 serve */
export interface HmrRebuildResult {
  outputFiles: Array<{ path: string; contents: Uint8Array }>;
  chunkUrl?: string;
  /** 与 chunkUrl 对应：该 chunk 所属路由的 path（如 "/"、"/signal"），供客户端用 chunkUrl 拉当前路由 */
  routePath?: string;
  devServeOutputs: DevServeOutput[];
}

/** 开发模式增量构建：缓存的 BuilderClient，用于 createContext + rebuild 加速 HMR（参考 dweb） */
let cachedDevBuilder: BuilderClient | null = null;

/**
 * 将构建产物的绝对路径转为浏览器请求路径（如 /dist/main.js、/dist/chunk-xxx.js）。
 * 传 stripOutDir 时去掉该目录前缀，使 dev 内存产出的请求路径为 /main.js、/chunk-xxx.js，与 index 中 src="/main.js" 一致。
 */
export function toRequestPath(
  root: string,
  absolutePath: string,
  options?: { stripOutDir?: string },
): string {
  const normalizedRoot = root.replace(/\/+$/, "") || ".";
  let relative = absolutePath
    .slice(normalizedRoot.length)
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  const strip = options?.stripOutDir?.replace(/\/+$/, "");
  if (strip && (relative === strip || relative.startsWith(strip + "/"))) {
    relative = relative.slice(relative.startsWith(strip + "/") ? strip.length + 1 : strip.length);
  }
  return "/" + relative;
}

/**
 * 根据变更文件路径从输出文件名中匹配对应 chunk（esbuild chunkNames: [name]-[hash]）
 * 路由 chunk 通常以目录名命名（如 home/index.tsx -> home-XXX.js），故同时用文件名与父目录名匹配。
 */
function getChunkRequestPathForChangedPath(
  changedPath: string,
  outputRequestPaths: string[],
): string | undefined {
  const name = basename(changedPath, ".tsx");
  const nameAlt = basename(changedPath, ".ts");
  const parentName = basename(dirname(changedPath));
  const jsPaths = outputRequestPaths.filter(
    (p) => p.endsWith(".js") && !p.endsWith(".map"),
  );
  for (const p of jsPaths) {
    const base = basename(p, ".js");
    const segment = base.split("-")[0];
    if (
      segment === name ||
      segment === nameAlt ||
      base === name ||
      base === nameAlt ||
      segment === parentName ||
      base === parentName
    ) {
      return p.startsWith("/") ? p : "/" + p;
    }
  }
  return undefined;
}

/**
 * 根据变更文件路径推断对应路由 path（约定：routes/home|index -> "/"，其余 -> "/{segment}"）
 * 供 HMR 下发 routePath，客户端用 chunkUrl 仅更新该路由。
 * @internal 供 prepareDevBuild 与单元测试使用
 */
export function getRoutePathForChangedPath(
  changedPath: string,
): string | undefined {
  const normalized = changedPath.replace(/\\/g, "/");
  const routesIdx = normalized.indexOf("/routes/");
  if (routesIdx < 0) return undefined;
  const afterRoutes = normalized.slice(routesIdx + "/routes/".length);
  let segment = afterRoutes.split("/")[0];
  if (!segment) return undefined;
  // 去掉扩展名，使 route path 为纯路径（如 about.tsx -> about）
  if (segment.includes(".")) segment = segment.split(".")[0];
  if (segment === "home" || segment === "index") return "/";
  return "/" + segment;
}

/**
 * 根据 view 配置生成 BuilderClient 用的 ClientConfig
 * engine 固定为 "solid"，通过 alias 将 solid-js 解析为 @dreamer/view，实现用 view 作为 JSX 运行时
 */
export function toClientConfig(
  root: string,
  entry: string,
  outDir: string,
  _outFile: string,
  buildConfig: ViewConfig["build"],
): ClientConfig {
  const entryPath = resolve(join(root, entry));
  const outputDir = resolve(join(root, outDir));
  return {
    entry: entryPath,
    output: outputDir,
    engine: "view",
    plugins: buildConfig?.plugins ?? [],
    bundle: {
      minify: buildConfig?.minify ?? true,
      sourcemap: buildConfig?.sourcemap ?? true,
      /** 代码分割：布尔值直接开关；对象时由 @dreamer/esbuild 解析（enabled/byRoute 等）。设为 false 可关闭 chunk 便于排查跨实例问题 */
      splitting: buildConfig?.splitting ?? true,
      /** 不含扩展名，esbuild 会按 outExtension 自动加 .js，避免产出 .js.js */
      chunkNames: buildConfig?.chunkNames ?? "[name]-[hash]",
    },
  };
}

/**
 * 开发模式 HMR 用：首次内存构建 + 创建 context，供后续 rebuild 增量编译（参考 dweb doDevBuild + createContext）
 * @param root 项目根目录
 * @param config 已加载的 view 配置
 * @returns 初始 devServeOutputs 与 rebuild 函数；rebuild 返回 outputFiles/chunkUrl/devServeOutputs，用于更新 serve 产出并广播 HMR
 */
export async function prepareDevBuild(
  root: string,
  config: ViewConfig,
): Promise<{
  devServeOutputs: DevServeOutput[];
  rebuild: (options?: { changedPath?: string }) => Promise<HmrRebuildResult>;
}> {
  // 仅用于首次构建与 createContext；热更新时 watcher 只把监听到的文件路径作为 changedPath 传进 rebuild() 做增量编译
  const entry = config.build?.entry ?? "src/main.tsx";
  const outDir = config.build?.outDir ?? "dist";
  const outFile = config.build?.outFile ?? "main.js";

  const clientConfig = toClientConfig(
    root,
    entry,
    outDir,
    outFile,
    config.build,
  );
  if (clientConfig.bundle) {
    clientConfig.bundle.minify = false;
    clientConfig.bundle.sourcemap = true;
    // dev 时用 dev 入口包装 createRoot，使 root 挂到 __VIEW_ROOT__，并注入 __HMR_REFRESH__
    clientConfig.bundle.alias = clientConfig.bundle.alias ?? {};
    const viewDevPath = resolve(root, "..", "src", "dev.ts");
    clientConfig.bundle.alias["@dreamer/view"] = existsSync(viewDevPath)
      ? viewDevPath
      : "jsr:@dreamer/view/dev";
  }

  const builder = new BuilderClient(clientConfig);
  const result = await builder.build({ mode: "dev", write: false });
  const outputContents = result.outputContents ?? [];

  const devServeOutputs: DevServeOutput[] = outputContents.map((o) => ({
    path: toRequestPath(root, o.path, { stripOutDir: outDir }),
    content: o.text ?? "",
  }));
  injectHmrBannerIntoEntry(devServeOutputs, outFile);

  await builder.createContext("dev", { write: false });
  cachedDevBuilder = builder;

  const rebuild = async (
    options?: { changedPath?: string },
  ): Promise<HmrRebuildResult> => {
    if (!cachedDevBuilder) {
      const full = await builder.build({ mode: "dev", write: false });
      const contents = full.outputContents ?? [];
      const outputs: DevServeOutput[] = contents.map((o) => ({
        path: toRequestPath(root, o.path, { stripOutDir: outDir }),
        content: o.text ?? "",
      }));
      injectHmrBannerIntoEntry(outputs, outFile);
      const outputFiles = contents.map((o) => ({
        path: toRequestPath(root, o.path, { stripOutDir: outDir }),
        contents:
          (o.contents ?? new TextEncoder().encode(o.text ?? "")) as Uint8Array,
      }));
      const requestPaths = outputs.map((o) => o.path);
      const chunkUrl = options?.changedPath
        ? getChunkRequestPathForChangedPath(options.changedPath, requestPaths)
        : requestPaths.find((p) => p.endsWith(".js") && !p.includes(".map"));
      const routePath = options?.changedPath
        ? getRoutePathForChangedPath(options.changedPath)
        : undefined;
      return { outputFiles, chunkUrl, routePath, devServeOutputs: outputs };
    }

    const rebuildResult = await cachedDevBuilder.rebuild();
    const contents = rebuildResult.outputContents ?? [];
    const devServeOutputsNext: DevServeOutput[] = contents.map((o) => ({
      path: toRequestPath(root, o.path, { stripOutDir: outDir }),
      content: o.text ?? "",
    }));
    injectHmrBannerIntoEntry(devServeOutputsNext, outFile);
    const outputFiles = contents.map((o) => ({
      path: toRequestPath(root, o.path, { stripOutDir: outDir }),
      contents:
        (o.contents ?? new TextEncoder().encode(o.text ?? "")) as Uint8Array,
    }));
    const requestPaths = devServeOutputsNext.map((o) => o.path);
    const chunkUrl = options?.changedPath
      ? getChunkRequestPathForChangedPath(options.changedPath, requestPaths)
      : requestPaths.find((p) => p.endsWith(".js") && !p.includes(".map"));
    const routePath = options?.changedPath
      ? getRoutePathForChangedPath(options.changedPath)
      : undefined;

    return {
      outputFiles,
      chunkUrl,
      routePath,
      devServeOutputs: devServeOutputsNext,
    };
  };

  return { devServeOutputs, rebuild };
}

/**
 * 执行构建，项目根目录取当前工作目录（cwd）
 * @returns 进程退出码，0 为成功
 */
export async function run(): Promise<number> {
  setEnv("DENO_ENV", "prod");
  const root = cwd();
  const config = await loadViewConfig(root);
  const entry = config.build?.entry ?? "src/main.tsx";
  const outDir = config.build?.outDir ?? "dist";
  const outFile = config.build?.outFile ?? "main.js";

  const clientConfig = toClientConfig(
    root,
    entry,
    outDir,
    outFile,
    config.build,
  );

  // 复制 index.html 到 outDir（若存在）；先确保 outDir 存在再写入
  const outputDir = resolve(root, outDir);
  await mkdir(outputDir, { recursive: true });
  const indexHtmlPath = join(root, "index.html");
  if (existsSync(indexHtmlPath)) {
    const indexHtmlContent = await readFile(indexHtmlPath);
    await writeFile(join(outputDir, "index.html"), indexHtmlContent);
  }

  const builder = new BuilderClient(clientConfig);
  console.log("[view] Building...");
  const result = await builder.build("prod");
  console.log(
    `[view] Build complete in ${result.duration}ms → ${outDir}`,
  );
  return 0;
}

/**
 * CLI 入口：由 @dreamer/console 的 action 调用
 */
export async function main(_args?: string[]): Promise<void> {
  const code = await run();
  if (code !== 0) exit(1);
}
