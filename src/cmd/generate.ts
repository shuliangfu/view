/**
 * Route table codegen: recursively scan views dir (max 5 levels), emit routers file with dynamic import.
 * Called before prepareDevBuild in dev so each build uses latest routes; generated file is in .gitignore.
 */

import {
  basename,
  dirname,
  existsSync,
  join,
  mkdir,
  pathToFileUrl,
  readdir,
  readTextFile,
  resolve,
  writeTextFile,
} from "@dreamer/runtime-adapter";
import { $t } from "./i18n.ts";

/** 单条路由条目：相对路径、import 路径、URL path、是否 404、title、可选的从文件读取的 metadata、布局继承 */
export interface RouteEntry {
  /** 文件名（无扩展名），如 home、about、not-found */
  name: string;
  /** 相对 src/router 的 import 路径，统一用 /（生成源码用），如 "../views/home.tsx"、"../views/store/index.tsx" */
  importPath: string;
  /** 路由 path：/、/about、/store、* 等 */
  path: string;
  /** 是否作为 notFound 路由（path 为 *） */
  isNotFound: boolean;
  /** 用于 metadata.title 的展示名（文件名推断，当文件中无 export metadata 时使用） */
  title: string;
  /** 从路由文件 export metadata 中读取的元数据（title、description、keywords、author、og 等），会合并进生成的路由 metadata */
  metadata?: Record<string, unknown>;
  /** 是否继承父级 _layout；当前目录 _layout 中 export const inheritLayout = false 时为 false，支持不限层级嵌套 */
  inheritLayout?: boolean;
  /** 子布局 import 路径（不含根 _layout），从外到内，供生成 layouts: [ () => import(...), ... ] */
  layoutImportPaths?: string[];
  /** 仅当该路由所在目录存在 _loading.tsx 时存在；作用域仅当前目录，子目录不继承 */
  loadingImportPath?: string;
}

const ROUTE_EXT = [".tsx", ".ts"];
const SKIP_PREFIXES = ["_", "."];
const SKIP_NAMES = ["layout"];
const MAX_DEPTH = 5;

/**
 * 根据「相对 views 的路径」（已去扩展名、统一 /）推断 URL path 与是否 404
 * 约定：index、home、home/index -> /；子目录下的 index -> /父路径；not-found、404 等 -> *；其余 -> /{path}
 */
function pathFromRelative(
  relativeNoExt: string,
): { path: string; isNotFound: boolean } {
  const norm = relativeNoExt.replace(/\\/g, "/");
  const lower = norm.toLowerCase();
  if (lower === "index" || lower === "home" || lower === "home/index") {
    return { path: "/", isNotFound: false };
  }
  const isNotFoundRoute = /^(not-found|404)(\/index)?$/.test(lower) ||
    /\/(not-found|404)(\/index)?$/.test(lower);
  if (isNotFoundRoute) {
    return { path: "*", isNotFound: true };
  }
  // 子目录下的 index -> 对应目录路径，如 store/index -> /store
  const withoutIndex = norm.replace(/\/index$/i, "");
  const path = withoutIndex === norm
    ? "/" + norm
    : (withoutIndex ? "/" + withoutIndex : "/");
  return { path: path || "/", isNotFound: false };
}

/**
 * 将相对路径（无扩展名）或 name 转为 meta.title 展示名（首字母大写、横线转空格）
 */
function titleFromRelative(relativeNoExt: string, isNotFound: boolean): string {
  if (isNotFound) return "404";
  const norm = relativeNoExt.replace(/\\/g, "/");
  if (norm === "index" || norm === "home" || norm === "home/index") {
    return $t("init.template.homeNavTitle");
  }
  const parts = norm.split("/");
  // 子目录下的 index 用父目录名作 title，如 globals/index → Globals
  if (parts.length > 1 && parts[parts.length - 1] === "index") {
    const parent = parts.slice(0, -1).join("/");
    if (parent) {
      const name = parent.split("/").pop() ?? parent;
      return name
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join(" ");
    }
  }
  const last = parts.pop() ?? norm;
  return last
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
}

/**
 * 递归只保留可 JSON 序列化的值（null、boolean、number、string、纯对象、数组），便于写入生成文件
 */
function toSerializableMeta(value: unknown): unknown {
  if (
    value === null || typeof value === "boolean" || typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toSerializableMeta);
  }
  if (
    typeof value === "object" && value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const s = toSerializableMeta(v);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return undefined;
}

/**
 * 从 _layout 文件内容中读取是否 export const inheritLayout = false（不继承父级布局）
 * 仅匹配行首的 export 声明，避免注释中的相同文案被误判
 */
function readInheritLayoutFromLayoutFile(content: string): boolean {
  return !/^\s*export\s+const\s+inheritLayout\s*=\s*false\b/m.test(content);
}

/**
 * 根据路由文件所在相对目录，从根到该目录收集 _layout.tsx 链，并解析 inheritLayout
 * @param viewsDirAbs views 目录绝对路径
 * @param relativeDir 路由文件所在目录相对 views 的路径，如 ""、"dashboard"、"dashboard/settings"
 * @returns inheritLayout（是否继承父级 Layout）、layoutImportPaths（从根到子的 import 路径，含根）
 */
async function computeLayoutChain(
  viewsDirAbs: string,
  relativeDir: string,
): Promise<{ inheritLayout: boolean; layoutImportPaths: string[] }> {
  const parts = relativeDir ? relativeDir.replace(/\\/g, "/").split("/") : [];
  const ancestors: string[] = [""];
  for (let i = 0; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i + 1).join("/"));
  }
  let inheritLayout = true;
  const layoutImportPaths: string[] = [];
  for (const dir of ancestors) {
    const layoutPath = join(viewsDirAbs, dir, "_layout.tsx");
    if (!existsSync(layoutPath)) continue;
    const importPath = [
      "..",
      "views",
      dir ? dir + "/_layout.tsx" : "_layout.tsx",
    ]
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/");
    try {
      const content = await readTextFile(layoutPath);
      const inherit = readInheritLayoutFromLayoutFile(content);
      if (!inherit) {
        layoutImportPaths.length = 0;
        layoutImportPaths.push(importPath);
        inheritLayout = false;
      } else {
        layoutImportPaths.push(importPath);
      }
    } catch {
      layoutImportPaths.push(importPath);
    }
  }
  return { inheritLayout, layoutImportPaths };
}

/**
 * 通过动态 import 加载路由文件并读取其 export 的 metadata；不限制字段，仅过滤为可序列化值
 * @param fileAbs 路由文件绝对路径
 * @returns 解析出的 metadata 对象（仅含可 JSON 序列化的结构），无或加载失败时返回 undefined
 */
async function extractMetaFromFile(
  fileAbs: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const url = pathToFileUrl(fileAbs);
    const mod = await import(url);
    const raw = (mod as { metadata?: unknown }).metadata ??
      (mod.default as { metadata?: unknown } | undefined)?.metadata;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const serialized = toSerializableMeta(raw);
    if (
      serialized == null || typeof serialized !== "object" ||
      Array.isArray(serialized)
    ) return undefined;
    const meta = serialized as Record<string, unknown>;
    return Object.keys(meta).length > 0 ? meta : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 递归扫描 views 目录（最多 MAX_DEPTH 层），收集 .tsx/.ts 文件，排除 layout、_ 开头等
 * @param viewsDirAbs 绝对路径，如 /project/src/views
 * @returns 路由条目列表，notFound 单独一条在末尾
 */
export async function scanRouteEntries(
  viewsDirAbs: string,
): Promise<RouteEntry[]> {
  if (!existsSync(viewsDirAbs)) {
    return [];
  }

  const routeEntries: RouteEntry[] = [];
  let notFoundEntry: RouteEntry | null = null;

  async function walk(
    dirAbs: string,
    relativeDir: string,
    depth: number,
  ): Promise<void> {
    if (depth > MAX_DEPTH) return;
    const entries = await readdir(dirAbs);
    for (const e of entries) {
      const relPath = relativeDir ? join(relativeDir, e.name) : e.name;
      const relPathSlash = relPath.replace(/\\/g, "/");

      if (e.isFile) {
        const ext = ROUTE_EXT.find((x) => e.name.endsWith(x));
        if (!ext) continue;
        const name = basename(e.name, ext);
        if (!name) continue;
        // 约定：以 _ 开头的为特殊文件（_app、_layout、_loading、_404、_error 等），不参与普通路由；仅 _404 作为 notFound 路由
        if (SKIP_PREFIXES.some((p) => e.name.startsWith(p))) {
          if (name === "_404") {
            const importPath = ["..", "views", relPathSlash].join("/");
            const fileAbs = join(dirAbs, e.name);
            const metaFromFile = await extractMetaFromFile(fileAbs);
            notFoundEntry = {
              name: "_404",
              importPath,
              path: "*",
              isNotFound: true,
              title: "404",
              metadata: metaFromFile,
            };
          }
          continue;
        }
        if (SKIP_NAMES.includes(name.toLowerCase())) continue;

        const relativeNoExt = relPath.slice(0, -ext.length);
        const relativeNoExtSlash = relativeNoExt.replace(/\\/g, "/");
        const { path, isNotFound } = pathFromRelative(relativeNoExtSlash);

        const importPath = ["..", "views", relPathSlash].join("/");
        const titleFallback = titleFromRelative(relativeNoExtSlash, isNotFound);
        const fileAbs = join(dirAbs, e.name);
        const metaFromFile = await extractMetaFromFile(fileAbs);
        const title = (metaFromFile?.title as string) ?? titleFallback;
        const { inheritLayout, layoutImportPaths } = await computeLayoutChain(
          viewsDirAbs,
          relativeDir,
        );
        const loadingPath = join(viewsDirAbs, relativeDir, "_loading.tsx");
        const loadingImportPath = existsSync(loadingPath)
          ? [
            "..",
            "views",
            relativeDir ? relativeDir + "/_loading.tsx" : "_loading.tsx",
          ]
            .filter(Boolean)
            .join("/")
            .replace(/\/+/g, "/")
          : undefined;
        const entry: RouteEntry = {
          name,
          importPath,
          path,
          isNotFound,
          title,
          metadata: metaFromFile,
          inheritLayout,
          layoutImportPaths: layoutImportPaths.length > 0
            ? layoutImportPaths
            : undefined,
          loadingImportPath,
        };
        if (isNotFound) {
          if (!notFoundEntry) notFoundEntry = entry;
        } else {
          routeEntries.push(entry);
        }
      } else {
        if (SKIP_PREFIXES.some((p) => e.name.startsWith(p))) continue;
        const nextDir = join(dirAbs, e.name);
        await walk(nextDir, relPathSlash, depth + 1);
      }
    }
  }

  await walk(viewsDirAbs, "", 1);

  routeEntries.sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });
  if (notFoundEntry) {
    routeEntries.push(notFoundEntry);
  }
  return routeEntries;
}

/**
 * 根据路由条目生成 routers 文件内容（动态 import，无静态 import）
 */
export function generateRoutersContent(routeEntries: RouteEntry[]): string {
  const notFound = routeEntries.find((e) => e.isNotFound);
  const routes = routeEntries.filter((e) => !e.isNotFound);

  const lines: string[] = [
    "/**",
    " * " + $t("init.template.routersComment1"),
    " * " + $t("init.template.routersComment2"),
    " */",
    "// @ts-nocheck " + $t("generate.tsNocheckComment"),
    'import type { RouteConfig } from "@dreamer/view/router";',
    "",
    "export const routes: RouteConfig[] = [",
  ];

  const metaToJson = (entry: RouteEntry): string => {
    const base = entry.metadata
      ? { ...entry.metadata, title: entry.title }
      : { title: entry.title };
    return JSON.stringify(base);
  };

  for (const e of routes) {
    const metaJson = metaToJson(e);
    const inheritProp = e.inheritLayout === false
      ? ", inheritLayout: false"
      : "";
    const layoutPaths = e.layoutImportPaths && e.layoutImportPaths.length > 0
      ? e.inheritLayout === false
        ? e.layoutImportPaths
        : e.layoutImportPaths.slice(1)
      : [];
    const layoutsArr = layoutPaths
      .map((p) => `() => import("${p}")`)
      .join(", ");
    const layoutsProp = layoutsArr ? `, layouts: [ ${layoutsArr} ]` : "";
    const loadingProp = e.loadingImportPath
      ? `, loading: () => import("${e.loadingImportPath}")`
      : "";
    lines.push(
      `  { path: "${e.path}", component: () => import("${e.importPath}"), metadata: ${metaJson}${inheritProp}${layoutsProp}${loadingProp} },`,
    );
  }
  lines.push("];");
  lines.push("");

  if (notFound) {
    lines.push("export const notFoundRoute: RouteConfig = {");
    lines.push(
      `  path: "${notFound.path}", component: () => import("${notFound.importPath}"), metadata: ${
        metaToJson(notFound)
      }`,
    );
    lines.push("};");
  } else {
    lines.push(
      'export const notFoundRoute: RouteConfig = { path: "*", component: () => Promise.resolve({ default: () => null as import("@dreamer/view").VNode }), metadata: { title: "404" } };',
    );
  }

  return lines.join("\n");
}

/**
 * 扫描 views 目录并写入 routers 文件；若目录为空则写入仅含 notFound 的占位
 * @param root 项目根目录（绝对路径）
 * @param viewsDir 相对根的 views 目录，默认 "src/views"
 * @param outputPath 相对根的 routers 输出路径，默认 "src/router/routers.tsx"
 */
export async function generateRoutersFile(
  root: string,
  viewsDir = "src/views",
  outputPath = "src/router/routers.tsx",
): Promise<void> {
  const viewsDirAbs = resolve(root, viewsDir);
  const outputAbs = resolve(root, outputPath);

  const routeEntries = await scanRouteEntries(viewsDirAbs);
  const content = generateRoutersContent(routeEntries);

  await mkdir(dirname(outputAbs), { recursive: true });
  await writeTextFile(outputAbs, content);
}
