/**
 * 构建核心：CSR 构建、prepareDevBuild（HMR）、runBuildWithConfig。
 * 供 core/app 与 CLI 调用，cmd 不包含构建逻辑。
 *
 * @module @dreamer/view/server/core/build
 */

import {
  AssetsProcessor,
  BuilderClient,
  type ClientConfig,
  type PluginBuild,
} from "@dreamer/esbuild";
import { createLogger } from "@dreamer/logger";
import {
  basename,
  dirname,
  existsSync,
  fromFileUrl,
  join,
  mkdir,
  readFile,
  readTextFile,
  relative,
  resolve,
  setEnv,
  writeFile,
} from "@dreamer/runtime-adapter";
import { createOptimizePlugin } from "../../optimize.ts";
import {
  KEY_HMR_BUMP,
  KEY_HMR_CHUNK_FOR_PATH,
  KEY_HMR_CLEAR_ROUTE_CACHE,
  KEY_VIEW_ROOT,
} from "../../constants.ts";
import { compileSource } from "../../jsx-compiler/transform.ts";
import { $tr } from "../../i18n.ts";
import { logger } from "../utils/logger.ts";
import type { AppConfig } from "./config.ts";
import { getBuildConfigForMode } from "./config.ts";
import { generateRoutersFile } from "./routers.ts";

/**
 * 开发模式在 main.js 开头注入的 __HMR_REFRESH__（无感刷新）
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

function injectHmrBannerIntoEntry(
  outputs: DevServeOutput[],
  entryFileName: string,
): void {
  const entry = outputs.find((o) =>
    o.path.endsWith(entryFileName) && !o.path.endsWith(".map")
  );
  if (entry) {
    const banner = getHmrBanner({
      rootNotFound: $tr("cli.hmr.rootNotFound"),
      containerEmpty: $tr("cli.hmr.containerEmpty"),
      refreshFailed: $tr("cli.hmr.refreshFailed"),
    });
    entry.content = entry.content + "\n" + banner;
  }
}

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

function ensureMainJsServedWhenNoSplitting(
  outputs: DevServeOutput[],
  entryRequestPath: string,
  splitting: NonNullable<AppConfig["build"]>["splitting"],
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

/** 开发模式 HMR 重建结果 */
export interface HmrRebuildResult {
  outputFiles: Array<{ path: string; contents: Uint8Array }>;
  chunkUrl?: string;
  routePath?: string;
  devServeOutputs: DevServeOutput[];
}

let cachedDevBuilder: BuilderClient | null = null;

/**
 * 将构建产物的绝对路径转为浏览器请求路径
 */
export function toRequestPath(
  root: string,
  absolutePath: string,
  options?: { stripOutDir?: string },
): string {
  const normalizedRoot = root.replace(/\/+$/, "") || ".";
  let relativePath = absolutePath
    .slice(normalizedRoot.length)
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  const strip = options?.stripOutDir?.replace(/\/+$/, "");
  if (
    strip && (relativePath === strip || relativePath.startsWith(strip + "/"))
  ) {
    relativePath = relativePath.slice(
      relativePath.startsWith(strip + "/") ? strip.length + 1 : strip.length,
    );
  }
  return "/" + relativePath;
}

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
  for (const p of jsPaths) {
    const base = basename(p, ".js");
    const segment = base.split("-")[0];
    if (segment === parentName || base === parentName) {
      return p.startsWith("/") ? p : "/" + p;
    }
  }
  const isIndexFile = name === "index" || nameAlt === "index";
  if (isIndexFile) return undefined;
  for (const p of jsPaths) {
    if (match(p)) return p.startsWith("/") ? p : "/" + p;
  }
  return undefined;
}

/**
 * 从变更文件路径推断路由 path（供 HMR 与单测使用）
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
  if (segment.includes(".")) segment = segment.split(".")[0];
  if (segment === "home" || segment === "index") return "/";
  return "/" + segment;
}

/**
 * 对所有 .tsx 执行 JSX 编译（compileSource），将文件中所有 return <jsx> 替换为 return (parent) => { insert(parent, ...) }，
 * insert 从主包 @dreamer/view 拉取；编译后子组件返回 (parent) => void，由 insert 直接调用挂载，无需 expandVNode。
 * 同时处理 namespace "file"（相对路径解析出的 .tsx，如 ./views/_layout.tsx）。
 */
function createRootCompilePlugin(): NonNullable<ClientConfig["plugins"]>[0] {
  const handleTsxLoad = async (args: { path: string }) => {
    // 兼容 esbuild 传入的 file:// URL（动态 import 的 chunk 可能为此形式）
    const pathToRead =
      typeof args.path === "string" && args.path.startsWith("file://")
        ? fromFileUrl(args.path)
        : args.path;
    let source = await readTextFile(pathToRead).catch(() => "");
    if (!source && pathToRead !== args.path) {
      source = await readTextFile(args.path).catch(() => "");
    }
    if (!source) {
      console.warn(
        "[view] compileSource 读取失败，该 .tsx 将走默认 JSX 可能产生 VNode: " +
          args.path,
      );
      return undefined;
    }
    const pathAbs = resolve(pathToRead);
    const out = compileSource(source, pathAbs, {
      insertImportPath: "@dreamer/view",
    });
    return {
      contents: out,
      loader: "tsx" as const,
      resolveDir: dirname(pathAbs),
    };
  };

  return {
    name: "view-root-compile",
    setup(build: PluginBuild) {
      // 默认 namespace（空）：入口等直接 file 路径
      build.onLoad({ filter: /\.tsx$/ }, handleTsxLoad);
      // namespace "file"：相对路径/别名解析出的 .tsx（如 ./views/_layout.tsx），否则走默认 file 加载器不会编译
      build.onLoad({ filter: /\.tsx$/, namespace: "file" }, handleTsxLoad);
    },
  };
}

function resolvePlugins(
  buildConfig: AppConfig["build"],
  forProduction: boolean,
): ClientConfig["plugins"] {
  const userPlugins = buildConfig?.plugins ?? [];
  const rootCompile = createRootCompilePlugin();
  if (!forProduction) return [rootCompile, ...userPlugins];
  const optimize = buildConfig?.optimize !== false;
  if (!optimize) return [rootCompile, ...userPlugins];
  return [rootCompile, createOptimizePlugin(/\.tsx$/), ...userPlugins];
}

/**
 * 根据 view 配置生成 BuilderClient 用的 ClientConfig
 */
export function toClientConfig(
  root: string,
  entry: string,
  outDir: string,
  _outFile: string,
  buildConfig: AppConfig["build"],
  options?: { forProduction?: boolean },
): ClientConfig {
  const entryPath = resolve(join(root, entry));
  const outputDir = resolve(join(root, outDir));
  const forProduction = options?.forProduction ?? false;
  return {
    entry: entryPath,
    output: outputDir,
    engine: "view",
    cssImport: buildConfig?.cssImport ?? { enabled: true, extract: false },
    plugins: resolvePlugins(buildConfig, forProduction),
    debug: buildConfig?.debug,
    bundle: {
      minify: buildConfig?.minify ?? true,
      sourcemap: typeof buildConfig?.sourcemap === "object"
        ? true
        : (buildConfig?.sourcemap ?? true),
      splitting: buildConfig?.splitting ?? true,
      chunkNames: buildConfig?.chunkNames ?? "[name]-[hash]",
    },
  };
}

/**
 * 开发模式 HMR：首次内存构建 + createContext，返回 devServeOutputs 与 rebuild
 */
export async function prepareDevBuild(
  root: string,
  config: AppConfig,
): Promise<{
  devServeOutputs: DevServeOutput[];
  rebuild: (options?: { changedPath?: string }) => Promise<HmrRebuildResult>;
}> {
  await generateRoutersFile(root, "src/views", "src/router/routers.tsx");
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
 * 使用指定 root 与 config 执行生产构建（供 app.build() 调用）
 */
export async function runBuildWithConfig(
  root: string,
  config: AppConfig,
): Promise<number> {
  setEnv("DENO_ENV", "prod");
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
  if (buildConfig.debug !== undefined) {
    clientConfig.debug = buildConfig.debug;
  }
  clientConfig.logger = createLogger({
    level: buildConfig.debug ? "debug" : "info",
    format: "text",
    output: { console: true },
  });

  const outputDir = resolve(root, outDir);
  await mkdir(outputDir, { recursive: true });
  const indexHtmlPath = join(root, "index.html");
  if (existsSync(indexHtmlPath)) {
    const indexHtmlContent = await readFile(indexHtmlPath);
    await writeFile(join(outputDir, "index.html"), indexHtmlContent);
  }

  const builder = new BuilderClient(clientConfig);
  logger.info($tr("cli.build.building"));
  const result = await builder.build("prod");
  if (result.outputFiles?.length) {
    const sorted = [...result.outputFiles].sort();
    for (const absPath of sorted) {
      const relPath = relative(root, absPath);
      const displayPath = relPath.startsWith("..")
        ? `${outDir}/${basename(absPath)}`
        : relPath;
      logger.info(
        displayPath.startsWith("./") ? displayPath : "./" + displayPath,
      );
    }
  }

  // 生产构建完成后执行资源处理：复制 publicDir、压缩/hash 图片、更新引用路径（与 dweb SSG 一致）
  const assetsConfig = buildConfig.assets;
  if (assetsConfig && typeof assetsConfig === "object") {
    const processor = new AssetsProcessor(
      assetsConfig as ConstructorParameters<typeof AssetsProcessor>[0],
      outputDir,
      [],
    );
    await processor.processAssets();
  }

  console.log("");
  logger.info(
    $tr("cli.build.complete", {
      duration: String(result.duration),
      outDir,
    }),
  );
  console.log("");
  return 0;
}
