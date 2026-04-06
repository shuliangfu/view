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
} from "@dreamer/esbuild";
import { createLogger } from "@dreamer/logger";
import {
  basename,
  dirname,
  existsSync,
  join,
  mkdir,
  readFile,
  relative,
  resolve,
  setEnv,
  writeFile,
} from "@dreamer/runtime-adapter";
import { createOptimizePlugin } from "../../optimize.ts";
import { $tr } from "../../i18n.ts";
import { logger } from "../utils/logger.ts";
import type { AppConfig } from "./config.ts";
import { getBuildConfigForMode } from "./config.ts";
import { generateRoutersFile } from "./routers.ts";

/**
 * 开发模式在入口 JS 最前面注入：`VIEW_DEV`、`__HMR_REFRESH__`（拉取 `chunk?t=` 后调用 `__VIEW_HMR_APPLY__`）。
 * compiler / jsx-runtime 在 dev 下共用该契约：路由侧合并新模块，lazy 缓存由 {@link invalidateViewLazyModules} 清空。
 */
function getHmrBanner(_msgs: {
  rootNotFound: string;
  containerEmpty: string;
  refreshFailed: string;
}): string {
  return `
(function(){
  var g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : {}));
  g.VIEW_DEV = true;
  g.__HMR_REFRESH__ = function(hmrOpts){
    var chunkUrl = hmrOpts && hmrOpts.chunkUrl;
    var routePath = hmrOpts && hmrOpts.routePath;
    if (chunkUrl && typeof chunkUrl === "string") {
      // 带 ?t= 绕过浏览器对同一 URL 的 ESM 实例缓存；成功后交给 __VIEW_HMR_APPLY__
      // 写回路由 Resource（jsx-runtime）或与 createHMRProxy（compiler）协同。
      import(/* @vite-ignore */ chunkUrl + "?t=" + Date.now()).then(function(mod) {
        var apply = g.__VIEW_HMR_APPLY__;
        if (typeof apply === "function") {
          try {
            apply({ chunkUrl: chunkUrl, routePath: routePath, mod: mod });
          } catch (e) {
            console.warn("[HMR] apply failed:", e);
            if (typeof g.location !== "undefined") g.location.reload();
          }
        }
      }).catch(function(err) {
        console.warn("[HMR] Refresh failed:", err);
        if (typeof g.location !== "undefined") g.location.reload();
      });
    }
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
    // 前置注入，保证 VIEW_DEV 在同 chunk 内任意 createHMRProxy 执行前已为 true
    entry.content = banner + "\n" + entry.content;
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
 * 解析 esbuild 插件列表。
 */
function resolvePlugins(
  buildConfig: AppConfig["build"],
  forProduction: boolean,
): ClientConfig["plugins"] {
  const userPlugins = buildConfig?.plugins ?? [];
  if (!forProduction) return [...userPlugins];
  const optimize = buildConfig?.optimize !== false;
  if (!optimize) return [...userPlugins];
  return [createOptimizePlugin(/\.tsx$/), ...userPlugins];
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
  /** 与 view.config 一致；BuilderClient 优先读顶层 `ClientConfig.sourcemap`（支持对象），bundle 内仅放 boolean */
  const sm = buildConfig?.sourcemap;
  const bundle: NonNullable<ClientConfig["bundle"]> = {
    minify: buildConfig?.minify ?? true,
    splitting: buildConfig?.splitting ?? true,
    chunkNames: buildConfig?.chunkNames ?? "[name]-[hash]",
  };
  if (typeof sm === "boolean") {
    bundle.sourcemap = sm;
  } else if (sm === undefined) {
    /** 未配置时与历史行为一致：默认生成 sourcemap（多为 external .map，几乎不增大 .js） */
    bundle.sourcemap = true;
  }
  /** `sm` 为对象时不在 bundle 上写 sourcemap，交给 BuilderClient 顶层分支解析 */

  return {
    entry: entryPath,
    output: outputDir,
    engine: "view",
    cssImport: buildConfig?.cssImport ?? { enabled: true, extract: false },
    plugins: resolvePlugins(buildConfig, forProduction),
    debug: buildConfig?.debug,
    sourcemap: sm === undefined ? undefined : sm,
    bundle,
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
    /** dev 固定开 sourcemap（栈映射 / HMR）；与 `build.prod.sourcemap` 无关 */
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
  // 优先根目录 index.html；无则回退到 src/assets/index.html（与 init 模板、examples 一致）
  const rootIndex = join(root, "index.html");
  const assetsIndex = join(root, "src", "assets", "index.html");
  const indexHtmlPath = existsSync(rootIndex)
    ? rootIndex
    : existsSync(assetsIndex)
    ? assetsIndex
    : rootIndex;
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
