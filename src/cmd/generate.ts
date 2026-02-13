/**
 * 路由表自动生成：递归扫描 routes 目录（最多 5 层），生成使用动态 import 的 routers 文件
 * dev 时在 prepareDevBuild 前调用，保证每次构建使用最新路由；生成文件加入 .gitignore 不提交
 */

import {
  basename,
  dirname,
  existsSync,
  join,
  mkdir,
  pathToFileUrl,
  readdir,
  resolve,
  writeTextFile,
} from "@dreamer/runtime-adapter";

/** 单条路由条目：相对路径、import 路径、URL path、是否 404、title、可选的从文件读取的 meta */
export interface RouteEntry {
  /** 文件名（无扩展名），如 home、about、not-found */
  name: string;
  /** 相对 src/router 的 import 路径，统一用 /（生成源码用），如 "../routes/home.tsx"、"../routes/store/index.tsx" */
  importPath: string;
  /** 路由 path：/、/about、/store、* 等 */
  path: string;
  /** 是否作为 notFound 路由（path 为 *） */
  isNotFound: boolean;
  /** 用于 meta.title 的展示名（文件名推断，当文件中无 export meta 时使用） */
  title: string;
  /** 从路由文件 export meta 中读取的元数据（title、description、keywords、author、og 等），会合并进生成的路由 meta */
  meta?: Record<string, unknown>;
}

const ROUTE_EXT = [".tsx", ".ts"];
const SKIP_PREFIXES = ["_", "."];
const SKIP_NAMES = ["layout"];
const MAX_DEPTH = 5;

/**
 * 根据「相对 routes 的路径」（已去扩展名、统一 /）推断 URL path 与是否 404
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
    return "首页";
  }
  const last = norm.split("/").pop() ?? norm;
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
 * 通过动态 import 加载路由文件并读取其 export 的 meta；不限制字段，仅过滤为可序列化值
 * @param fileAbs 路由文件绝对路径
 * @returns 解析出的 meta 对象（仅含可 JSON 序列化的结构），无或加载失败时返回 undefined
 */
async function extractMetaFromFile(
  fileAbs: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const url = pathToFileUrl(fileAbs);
    const mod = await import(url);
    const raw = mod.meta ??
      (mod.default as { meta?: unknown } | undefined)?.meta;
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
 * 递归扫描 routes 目录（最多 MAX_DEPTH 层），收集 .tsx/.ts 文件，排除 layout、_ 开头等
 * @param routesDirAbs 绝对路径，如 /project/src/routes
 * @returns 路由条目列表，notFound 单独一条在末尾
 */
export async function scanRouteEntries(
  routesDirAbs: string,
): Promise<RouteEntry[]> {
  if (!existsSync(routesDirAbs)) {
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
        if (SKIP_PREFIXES.some((p) => e.name.startsWith(p))) continue;
        if (SKIP_NAMES.includes(name.toLowerCase())) continue;

        const relativeNoExt = relPath.slice(0, -ext.length);
        const relativeNoExtSlash = relativeNoExt.replace(/\\/g, "/");
        const { path, isNotFound } = pathFromRelative(relativeNoExtSlash);

        const importPath = ["..", "routes", relPathSlash].join("/");
        const titleFallback = titleFromRelative(relativeNoExtSlash, isNotFound);
        const fileAbs = join(dirAbs, e.name);
        const metaFromFile = await extractMetaFromFile(fileAbs);
        const title = (metaFromFile?.title as string) ?? titleFallback;
        const entry: RouteEntry = {
          name,
          importPath,
          path,
          isNotFound,
          title,
          meta: metaFromFile,
        };
        if (isNotFound) {
          notFoundEntry = entry;
        } else {
          routeEntries.push(entry);
        }
      } else {
        if (SKIP_PREFIXES.some((p) => e.name.startsWith(p))) continue;
        if (SKIP_NAMES.includes(e.name.toLowerCase())) continue;
        const nextDir = join(dirAbs, e.name);
        await walk(nextDir, relPathSlash, depth + 1);
      }
    }
  }

  await walk(routesDirAbs, "", 1);

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
    " * 路由表（自动生成）：path → component，使用动态 import 实现按需加载",
    " * 请勿手动编辑；dev 时会根据 src/routes 目录自动重新生成",
    " */",
    "// @ts-nocheck 自动生成文件，component 为动态 import，与 RouteConfig 的同步类型兼容由运行时处理",
    'import type { RouteConfig } from "@dreamer/view/router";',
    "",
    "export const routes: RouteConfig[] = [",
  ];

  const metaToJson = (entry: RouteEntry): string => {
    const base = entry.meta
      ? { ...entry.meta, title: entry.title }
      : { title: entry.title };
    return JSON.stringify(base);
  };

  for (const e of routes) {
    lines.push(
      `  { path: "${e.path}", component: () => import("${e.importPath}"), meta: ${
        metaToJson(e)
      } },`,
    );
  }
  lines.push("];");
  lines.push("");

  if (notFound) {
    lines.push("export const notFoundRoute: RouteConfig = {");
    lines.push(
      `  path: "${notFound.path}", component: () => import("${notFound.importPath}"), meta: ${
        metaToJson(notFound)
      }`,
    );
    lines.push("};");
  } else {
    lines.push(
      'export const notFoundRoute: RouteConfig = { path: "*", component: () => Promise.resolve({ default: () => null as import("@dreamer/view").VNode }), meta: { title: "404" } };',
    );
  }

  return lines.join("\n");
}

/**
 * 扫描 routes 目录并写入 routers 文件；若目录为空则写入仅含 notFound 的占位
 * @param root 项目根目录（绝对路径）
 * @param routesDir 相对根的 routes 目录，默认 "src/routes"
 * @param outputPath 相对根的 routers 输出路径，默认 "src/router/routers.tsx"
 */
export async function generateRoutersFile(
  root: string,
  routesDir = "src/routes",
  outputPath = "src/router/routers.tsx",
): Promise<void> {
  const routesDirAbs = resolve(root, routesDir);
  const outputAbs = resolve(root, outputPath);

  const routeEntries = await scanRouteEntries(routesDirAbs);
  const content = generateRoutersContent(routeEntries);

  await mkdir(dirname(outputAbs), { recursive: true });
  await writeTextFile(outputAbs, content);
}
