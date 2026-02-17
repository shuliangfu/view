/**
 * build 命令：前端 CSR 构建，使用 @dreamer/esbuild BuilderClient 编译，写入 outDir
 * 读取 view.config 的 build（entry、outDir、outFile、minify、sourcemap 等）。
 * 与 dweb 一致，使用 BuilderClient + ClientConfig；engine 用 "view"；支持 HMR 的 prepareDevBuild（createContext + rebuild 内存编译）。
 */

import { BuilderClient, type ClientConfig } from "@dreamer/esbuild";
import { createLogger } from "@dreamer/logger";
import { createOptimizePlugin } from "../compiler.ts";
import {
  basename,
  cwd,
  dirname,
  existsSync,
  exit,
  join,
  mkdir,
  readFile,
  relative,
  resolve,
  setEnv,
  writeFile,
} from "@dreamer/runtime-adapter";
import {
  KEY_HMR_BUMP,
  KEY_HMR_CHUNK_FOR_PATH,
  KEY_HMR_CLEAR_ROUTE_CACHE,
  KEY_VIEW_ROOT,
} from "../constants.ts";
import { $t } from "../i18n.ts";
import type { ViewConfig } from "./config.ts";
import { getBuildConfigForMode, loadViewConfig } from "./config.ts";
import { generateRoutersFile } from "./generate.ts";

/**
 * 开发模式在 main.js 开头注入的 __HMR_REFRESH__（无感刷新）：
 * unmount 当前 root，再 import(mainUrl?t=ts) 拉取并执行新 main，由新 main 的 createRoot 重新渲染；
 * hmrOpts.chunkUrl 由服务端下发，可选先 import(chunkUrl) 预加载再拉 main；每次 rebuild 的 chunkUrl 已是新 hash，无需再拼 ?t=。
 * 若 import 失败或超时后 #root 仍为空则回退整页重载。
 * @param msgs 已翻译的 HMR 提示文案（构建时按环境语言注入）
 */
function getHmrBanner(msgs: {
  rootNotFound: string;
  containerEmpty: string;
  refreshFailed: string;
}): string {
  const msgRoot = JSON.stringify(msgs.rootNotFound);
  const msgContainer = JSON.stringify(msgs.containerEmpty);
  const msgRefresh = JSON.stringify(msgs.refreshFailed);
  return `
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
    var r = g["${KEY_VIEW_ROOT}"];
    var mainUrl = getMainUrl();
    mainUrl = mainUrl + (mainUrl.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
    var runMain = function(){
      g["${KEY_HMR_CLEAR_ROUTE_CACHE}"] = true;
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
              console.warn(${msgRoot});
              reload();
              return;
            }
            if (el.childNodes.length === 0){
              console.warn(${msgContainer});
              reload();
            }
          };
          var raf = typeof g.requestAnimationFrame !== "undefined" ? g.requestAnimationFrame : function(f){ setTimeout(f, 16); };
          raf(function(){ raf(check); });
          setTimeout(check, 500);
        })
        .catch(function(err){
          console.warn(${msgRefresh}, err?.message || err);
          reload();
        });
    };
    if (chunkUrl && typeof chunkUrl === "string" && g["${KEY_HMR_BUMP}"]) {
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
        if (!g["${KEY_HMR_CHUNK_FOR_PATH}"]) g["${KEY_HMR_CHUNK_FOR_PATH}"] = {};
        g["${KEY_HMR_CHUNK_FOR_PATH}"][routePath] = chunkUrl;
      }
      g["${KEY_HMR_CLEAR_ROUTE_CACHE}"] = true;
      import(/* @vite-ignore */ chunkUrl).then(function(){ g["${KEY_HMR_BUMP}"](); }).catch(runMain);
      return;
    }
    runMain();
  };
})();
`;
}

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
    const banner = getHmrBanner({
      rootNotFound: $t("cli.hmr.rootNotFound"),
      containerEmpty: $t("cli.hmr.containerEmpty"),
      refreshFailed: $t("cli.hmr.refreshFailed"),
    });
    entry.content = entry.content + "\n" + banner;
  }
}

/**
 * 从 chunk 中移除 esbuild 错误导出的 import_runtime（代码分割时内部 helper 被误加入 export 列表导致 SyntaxError）。
 * 仅处理 .js 且 content 中含 import_runtime 的产出。
 */
function stripImportRuntimeFromChunkOutputs(outputs: DevServeOutput[]): void {
  for (const o of outputs) {
    if (!o.path.endsWith(".js") || o.path.endsWith(".map")) continue;
    if (!o.content.includes("import_runtime")) continue;
    o.content = o.content
      .replace(/\bimport_runtime\s*,\s*/g, "")
      .replace(/,\s*import_runtime\s*}/g, " }")
      .replace(/,\s*import_runtime\s*,/g, ",");
  }
}

/**
 * 关闭代码分割时，esbuild 可能不写 outdir，产出路径会变成如 /src/main.js；
 * index 请求的是 /main.js，pathHandler 找不到会回退 SPA 返回 HTML，导致 MIME 错误。
 * 当 splitting 为 false 且仅有一个 JS 产出时，为 /main.js 增加一条映射，确保能命中内存产出。
 */
function ensureMainJsServedWhenNoSplitting(
  outputs: DevServeOutput[],
  entryRequestPath: string,
  splitting: NonNullable<ViewConfig["build"]>["splitting"],
): void {
  if (splitting !== false) return;
  const jsOnly = outputs.filter(
    (o) => o.path.endsWith(".js") && !o.path.endsWith(".map"),
  );
  if (jsOnly.length !== 1) return;
  const single = jsOnly[0];
  if (single.path === entryRequestPath) return;
  outputs.push({ path: entryRequestPath, content: single.content });
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
    relative = relative.slice(
      relative.startsWith(strip + "/") ? strip.length + 1 : strip.length,
    );
  }
  return "/" + relative;
}

/**
 * 根据变更文件路径从输出文件名中匹配对应 chunk（esbuild chunkNames: [name]-[hash]）
 * 路由 chunk 可能以目录名或文件名命名（home/index.tsx -> home-XXX 或 index-XXX）；router/index.tsx 也会产生 index-XXX，
 * 若先按 name===index 匹配会错误命中 router 的 chunk。故先按目录名 parentName 匹配，再按文件名 name 匹配。
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
  const match = (p: string): boolean => {
    const base = basename(p, ".js");
    const segment = base.split("-")[0];
    return (
      segment === parentName ||
      base === parentName ||
      segment === name ||
      segment === nameAlt ||
      base === name ||
      base === nameAlt
    );
  };
  // 先找目录名匹配（如 home），避免 home/index.tsx 命中 router 的 index-xxx.js
  for (const p of jsPaths) {
    const base = basename(p, ".js");
    const segment = base.split("-")[0];
    if (segment === parentName || base === parentName) {
      return p.startsWith("/") ? p : "/" + p;
    }
  }
  // 文件名为 index 时不再按 index 匹配，否则会命中 router/index 的 index-xxx，导致第 N 次 HMR 错页
  const isIndexFile = name === "index" || nameAlt === "index";
  if (isIndexFile) return undefined;
  for (const p of jsPaths) {
    if (match(p)) return p.startsWith("/") ? p : "/" + p;
  }
  return undefined;
}

/**
 * Infer route path from changed file path (convention: views/home|index -> "/", others -> "/{segment}").
 * Used by HMR to send routePath; client uses chunkUrl to update only that route.
 * @internal Used by prepareDevBuild and unit tests
 */
export function getRoutePathForChangedPath(
  changedPath: string,
): string | undefined {
  const normalized = changedPath.replace(/\\/g, "/");
  const viewsIdx = normalized.indexOf("/views/");
  if (viewsIdx < 0) return undefined;
  const afterViews = normalized.slice(viewsIdx + "/views/".length);
  let segment = afterViews.split("/")[0];
  if (!segment) return undefined;
  // Strip extension so route path is segment only (e.g. about.tsx -> about)
  if (segment.includes(".")) segment = segment.split(".")[0];
  if (segment === "home" || segment === "index") return "/";
  return "/" + segment;
}

/**
 * 生产构建时若未关闭 optimize，在 plugins 前插入 createOptimizePlugin，使 .tsx 常量折叠与静态提升生效。
 */
function resolvePlugins(
  buildConfig: ViewConfig["build"],
  forProduction: boolean,
): ClientConfig["plugins"] {
  const userPlugins = buildConfig?.plugins ?? [];
  if (!forProduction) return userPlugins;
  const optimize = buildConfig?.optimize !== false;
  if (!optimize) return userPlugins;
  return [createOptimizePlugin(/\.tsx$/), ...userPlugins];
}

/**
 * 根据 view 配置生成 BuilderClient 用的 ClientConfig
 * engine 固定为 "view"，供 @dreamer/esbuild 识别并配置 JSX 与依赖解析为 @dreamer/view
 */
export function toClientConfig(
  root: string,
  entry: string,
  outDir: string,
  _outFile: string,
  buildConfig: ViewConfig["build"],
  options?: { forProduction?: boolean },
): ClientConfig {
  const entryPath = resolve(join(root, entry));
  const outputDir = resolve(join(root, outDir));
  const forProduction = options?.forProduction ?? false;
  return {
    entry: entryPath,
    output: outputDir,
    engine: "view",
    /** 默认内联模式：CSS 打包进 JS，运行时自动注入 <style>；extract: true 时产出 .css 并由 serve 注入 index.html */
    cssImport: buildConfig?.cssImport ?? { enabled: true, extract: false },
    plugins: resolvePlugins(buildConfig, forProduction),
    debug: buildConfig?.debug,
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
  // dev 时先根据 src/views 自动生成 src/router/routers.tsx（动态 import），再构建
  await generateRoutersFile(root, "src/views", "src/router/routers.tsx");

  // 仅用于首次构建与 createContext；热更新时 watcher 只把监听到的文件路径作为 changedPath 传进 rebuild() 做增量编译；使用 build.dev 覆盖
  const buildConfig = getBuildConfigForMode(config, "dev");
  const entry = buildConfig.entry ?? "src/main.tsx";
  const outDir = buildConfig.outDir ?? "dist";
  const outFile = buildConfig.outFile ?? "main.js";

  const clientConfig = toClientConfig(
    root,
    entry,
    outDir,
    outFile,
    buildConfig,
  );
  if (clientConfig.bundle) {
    clientConfig.bundle.minify = false;
    clientConfig.bundle.sourcemap = true;
  }
  // 显式传入 debug 与 logger：debug 为 true 时使用 level "debug" 的 logger，resolver 的 log.debug() 才会输出
  if (buildConfig.debug !== undefined) {
    clientConfig.debug = buildConfig.debug;
  }
  clientConfig.logger = createLogger({
    level: buildConfig.debug ? "debug" : "info",
    format: "text",
    output: { console: true },
  });

  const builder = new BuilderClient(clientConfig);
  const result = await builder.build({ mode: "dev", write: false });
  const outputContents = result.outputContents ?? [];

  const devServeOutputs: DevServeOutput[] = outputContents.map((o) => ({
    path: toRequestPath(root, o.path, { stripOutDir: outDir }),
    content: o.text ?? "",
  }));
  injectHmrBannerIntoEntry(devServeOutputs, outFile);
  stripImportRuntimeFromChunkOutputs(devServeOutputs);
  ensureMainJsServedWhenNoSplitting(
    devServeOutputs,
    "/" + outFile,
    buildConfig.splitting,
  );

  await builder.createContext("dev", { write: false });
  cachedDevBuilder = builder;

  const rebuild = async (
    options?: { changedPath?: string },
  ): Promise<HmrRebuildResult> => {
    // 若变更文件在 views 目录下，先重新生成 routers.tsx 再构建
    const p = options?.changedPath ?? "";
    if (p.replace(/\\/g, "/").includes("/views/")) {
      await generateRoutersFile(root, "src/views", "src/router/routers.tsx");
    }
    if (!cachedDevBuilder) {
      const full = await builder.build({ mode: "dev", write: false });
      const contents = full.outputContents ?? [];
      const outputs: DevServeOutput[] = contents.map((o) => ({
        path: toRequestPath(root, o.path, { stripOutDir: outDir }),
        content: o.text ?? "",
      }));
      injectHmrBannerIntoEntry(outputs, outFile);
      stripImportRuntimeFromChunkOutputs(outputs);
      ensureMainJsServedWhenNoSplitting(
        outputs,
        "/" + outFile,
        buildConfig.splitting,
      );
      const outputFiles = outputs.map((o) => ({
        path: o.path,
        contents: new TextEncoder().encode(o.content),
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
    stripImportRuntimeFromChunkOutputs(devServeOutputsNext);
    ensureMainJsServedWhenNoSplitting(
      devServeOutputsNext,
      "/" + outFile,
      buildConfig.splitting,
    );
    const outputFiles = devServeOutputsNext.map((o) => ({
      path: o.path,
      contents: new TextEncoder().encode(o.content),
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
  // 构建前根据 src/views 自动生成 src/router/routers.tsx，与 dev 行为一致
  await generateRoutersFile(root, "src/views", "src/router/routers.tsx");
  const buildConfig = getBuildConfigForMode(config, "prod");
  const entry = buildConfig.entry ?? "src/main.tsx";
  const outDir = buildConfig.outDir ?? "dist";
  const outFile = buildConfig.outFile ?? "main.js";

  const clientConfig = toClientConfig(
    root,
    entry,
    outDir,
    outFile,
    buildConfig,
    { forProduction: true },
  );
  // 显式传入 debug 与 logger：debug 为 true 时使用 level "debug" 的 logger，resolver 的 log.debug() 才会输出
  if (buildConfig.debug !== undefined) {
    clientConfig.debug = buildConfig.debug;
  }
  clientConfig.logger = createLogger({
    level: buildConfig.debug ? "debug" : "info",
    format: "text",
    output: { console: true },
  });

  // 复制 index.html 到 outDir（若存在）；先确保 outDir 存在再写入
  const outputDir = resolve(root, outDir);
  await mkdir(outputDir, { recursive: true });
  const indexHtmlPath = join(root, "index.html");
  if (existsSync(indexHtmlPath)) {
    const indexHtmlContent = await readFile(indexHtmlPath);
    await writeFile(join(outputDir, "index.html"), indexHtmlContent);
  }

  const builder = new BuilderClient(clientConfig);
  console.log($t("cli.build.building"));
  const result = await builder.build("prod");
  if (result.outputFiles?.length) {
    const sorted = [...result.outputFiles].sort();
    for (const absPath of sorted) {
      const relPath = relative(root, absPath);
      const displayPath = relPath.startsWith("..")
        ? `${outDir}/${basename(absPath)}`
        : relPath;
      console.log(displayPath);
    }
  }
  console.log(
    $t("cli.build.complete", {
      duration: String(result.duration),
      outDir,
    }),
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
