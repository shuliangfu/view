/**
 * @module integrations/router/match
 * @description Pure path / URL matching: {@link parseRouterUrl}, {@link matchRoute},
 * compile helpers. No history / Link / active Router instance.
 */

import type {
  CreateRouterOptions,
  RouteConfig,
  RouteMatch,
} from "./types.ts";

// ———————————————————————————————————————————————————————————————————————————
// 路径工具
// ———————————————————————————————————————————————————————————————————————————

/** 规范化 basePath：无前导双斜杠、无末尾斜杠（根除外） */
export function normalizeBasePath(base: string | undefined): string {
  if (!base || base === "/") return "";
  let b = base.startsWith("/") ? base : "/" + base;
  b = b.replace(/\/+$/, "");
  return b;
}

/** 应用内路径 + base → 浏览器 pathname */
export function joinBasePath(base: string, internalPath: string): string {
  const p = internalPath.startsWith("/") ? internalPath : "/" + internalPath;
  if (!base) return p || "/";
  return (base + p).replace(/\/{2,}/g, "/") || "/";
}

/** 从完整 pathname 得到用于匹配的应用内路径 */
export function stripBasePath(fullPathname: string, base: string): string {
  if (!base) return fullPathname || "/";
  if (fullPathname === base) return "/";
  if (fullPathname.startsWith(base + "/")) {
    const rest = "/" + fullPathname.slice(base.length + 1);
    return rest === "//" ? "/" : rest.replace(/\/{2,}/g, "/");
  }
  return fullPathname || "/";
}

/**
 * 去掉末尾斜杠（根路径保留）。
 * 必须保证以 `/` 开头，否则 `about:blank` 等环境下 pathname 为 `blank` 时会被误当成「无斜杠路径」并在分段时截断首字符。
 */
export function normalizeInternalPath(p: string): string {
  if (!p || p === "/") return "/";
  const prefixed = p.startsWith("/") ? p : "/" + p;
  return prefixed.replace(/\/+$/, "") || "/";
}

export function pathToParts(internalPath: string): string[] {
  const n = normalizeInternalPath(internalPath);
  if (n === "/") return [];
  // 原地压缩空段，避免 `.filter(Boolean)` 再分配新数组
  const parts = n.slice(1).split("/");
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.length > 0) parts[w++] = p;
  }
  parts.length = w;
  return parts;
}

/**
 * 解析路由 URL 为 pathname / search / hash（SSR 与测试共用）。
 * 支持绝对 URL、`/path?x=1#h`、无前导 `/` 的相对 path。
 */
export function parseRouterUrl(
  url: string,
): { pathname: string; search: string; hash: string } {
  const raw = (url ?? "/").trim() || "/";
  try {
    if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
      const abs = raw.startsWith("//") ? `http:${raw}` : raw;
      const u = new URL(abs);
      let pathname = u.pathname || "/";
      if (pathname && !pathname.startsWith("/")) pathname = "/" + pathname;
      return { pathname, search: u.search, hash: u.hash };
    }
    const pathOnly = raw.startsWith("/") ? raw : `/${raw}`;
    const u = new URL(pathOnly, "http://view.local");
    return {
      pathname: u.pathname || "/",
      search: u.search,
      hash: u.hash,
    };
  } catch {
    return { pathname: "/", search: "", hash: "" };
  }
}

/**
 * 纯函数路由匹配（无全局 Router 实例、无 history）。
 * 与 `createRouter(...).match()` 在相同 routes/url 下结果一致，便于 SSR 预取数据。
 *
 * @param routesOrOpts 路由表或含 `basePath` / `notFound` 的选项
 * @param url 请求路径（见 {@link parseRouterUrl}）
 * @returns 命中 {@link RouteMatch}，未命中且无 notFound 时为 `null`
 */
export function matchRoute(
  routesOrOpts:
    | RouteConfig[]
    | Pick<CreateRouterOptions, "routes" | "basePath" | "notFound">,
  url: string,
): RouteMatch | null {
  const opts = Array.isArray(routesOrOpts)
    ? { routes: routesOrOpts }
    : routesOrOpts;
  const basePath = normalizeBasePath(opts.basePath);
  const compiled = compileRouteList(opts.routes, opts.notFound);
  const loc = parseRouterUrl(url);
  const internal = normalizeInternalPath(
    stripBasePath(loc.pathname, basePath),
  );
  const parts = pathToParts(internal);
  const found = findCompiledMatch(compiled, parts);
  if (!found) return null;
  return {
    pathname: loc.pathname,
    path: internal,
    search: loc.search,
    hash: loc.hash,
    query: searchToRecord(loc.search),
    params: found.params,
    pattern: found.config.path,
    route: found.config,
  };
}

export function searchToRecord(search: string): Record<string, string> {
  // 空 query 快路径：避免每次导航都 new URLSearchParams
  if (!search || search === "?") return {};
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return {};
  const u = new URLSearchParams(q);
  const o: Record<string, string> = {};
  u.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

/**
 * 预编译路由：创建时切分 path 段，匹配时不再 `split` 模式串。
 * 支持 `:id`、末尾 `/*`（`*` 捕获）、整路径 `*` / `/*`。
 */
interface CompiledRoute {
  config: RouteConfig;
  /** 原始 path 模式（与 RouteConfig.path 一致，供 match 元数据） */
  pattern: string;
  /** 预切分段（不含末尾 splat `*`） */
  segments: string[];
  /** 末尾 `/*` 捕获剩余路径 */
  isSplat: boolean;
  /** 整路径通配 `*` / `/*` */
  isCatchAll: boolean;
}

function compileOneRoute(config: RouteConfig): CompiledRoute {
  const pat = config.path.trim();
  if (pat === "*" || pat === "/*") {
    return {
      config,
      pattern: config.path,
      segments: [],
      isSplat: false,
      isCatchAll: true,
    };
  }
  let segments = pat.split("/").filter(Boolean);
  let isSplat = false;
  if (segments.length > 0 && segments[segments.length - 1] === "*") {
    isSplat = true;
    segments = segments.slice(0, -1);
  }
  return {
    config,
    pattern: config.path,
    segments,
    isSplat,
    isCatchAll: false,
  };
}

function matchStaticAndParams(
  patParts: string[],
  pathParts: string[],
): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const p = patParts[i]!;
    const s = pathParts[i]!;
    if (p.startsWith(":")) {
      params[p.slice(1)] = s;
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

/**
 * 用预编译结构匹配路径分段。
 */
function matchCompiledRoute(
  c: CompiledRoute,
  pathParts: string[],
): Record<string, string> | null {
  if (c.isCatchAll) {
    return { "*": pathParts.length ? pathParts.join("/") : "" };
  }
  if (c.isSplat) {
    if (pathParts.length < c.segments.length) return null;
    const fixedPath = pathParts.slice(0, c.segments.length);
    const splat = pathParts.slice(c.segments.length).join("/");
    const sub = matchStaticAndParams(c.segments, fixedPath);
    if (sub === null) return null;
    sub["*"] = splat;
    return sub;
  }
  if (c.segments.length !== pathParts.length) return null;
  return matchStaticAndParams(c.segments, pathParts);
}

export function compileRouteList(
  routes: RouteConfig[],
  notFound?: RouteConfig,
): CompiledRoute[] {
  const list: CompiledRoute[] = routes.map(compileOneRoute);
  if (
    notFound &&
    !routes.some((r) => r.path === "*" || r.path === "/*")
  ) {
    list.push(compileOneRoute(notFound));
  }
  return list;
}

export function findCompiledMatch(
  compiled: CompiledRoute[],
  pathParts: string[],
): { config: RouteConfig; params: Record<string, string> } | null {
  for (let i = 0; i < compiled.length; i++) {
    const c = compiled[i]!;
    const params = matchCompiledRoute(c, pathParts);
    if (params !== null) return { config: c.config, params };
  }
  return null;
}

