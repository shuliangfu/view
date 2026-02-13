/**
 * @module @dreamer/view/router
 * @description
 * 内置 SPA 路由：基于 History API 的客户端路由，不依赖 @dreamer/router/client。支持无刷新跳转、路由订阅、同源 <a> 点击拦截、前置/后置守卫、404 兜底、back/forward/go、路由 meta；仅 history 模式。
 *
 * **本模块导出：**
 * - `createRouter(options)`：创建路由器，返回 Router 实例；需调用 start() 后才会监听 popstate 与拦截链接
 * - 类型：`RouteGuardResult`、`RouteGuard`、`RouteGuardAfter`、`RouteConfig`、`RouteMatch`、`CreateRouterOptions`、`Router`
 *
 * **Router 方法：** getCurrentRoute、href、navigate、replace、back、forward、go、subscribe、start、stop
 *
 * @example
 * import { createRouter } from "jsr:@dreamer/view/router";
 * const router = createRouter({ routes: [{ path: "/", component: () => <Home /> }] });
 * router.start();
 * router.subscribe(() => setMatch(router.getCurrentRoute()));
 */

import type { VNode } from "./types.ts";
import { applyMetaToHead } from "./meta.ts";

/**
 * 前置守卫返回值：false 取消导航，string 重定向到该路径，true/void 放行；支持 Promise。
 */
export type RouteGuardResult =
  | boolean
  | string
  | void
  | Promise<boolean | string | void>;

/**
 * 前置守卫：导航前执行，(to, from) => 放行/取消/重定向。
 */
export type RouteGuard = (
  to: RouteMatch | null,
  from: RouteMatch | null,
) => RouteGuardResult;

/**
 * 后置守卫：导航完成后执行，用于埋点、改 title 等；支持异步。
 */
export type RouteGuardAfter = (
  to: RouteMatch | null,
  from: RouteMatch | null,
) => void | Promise<void>;

/** 是否处于浏览器环境（存在 location / history） */
function hasHistory(): boolean {
  try {
    const g = globalThis as unknown as {
      location?: unknown;
      history?: unknown;
    };
    return typeof g.location !== "undefined" &&
      typeof g.history !== "undefined";
  } catch {
    return false;
  }
}

/**
 * 单条路由配置：path 支持动态参数 :param，可选 meta 供守卫或布局使用
 * @example
 * { path: "/", component: () => <Home />, meta: { title: "首页" } }
 * { path: "/user/:id", component: (match) => <User id={match.params.id} /> }
 */
export interface RouteConfig {
  /** 路径模式，支持 :param（如 /user/:id） */
  path: string;
  /** 渲染该路由的组件，接收当前匹配结果 */
  component: (match: RouteMatch) => VNode;
  /** 路由元信息，如 title、requiresAuth，供守卫或布局读取 */
  meta?: Record<string, unknown>;
}

/**
 * 当前路由匹配结果，供 component 与守卫使用
 */
export interface RouteMatch {
  /** 匹配到的路由 path 模式（如 "/user/:id"） */
  path: string;
  /** 动态参数（如 { id: "123" }） */
  params: Record<string, string>;
  /** 查询参数（如 ?a=1 => { a: "1" }） */
  query: Record<string, string>;
  /** 当前完整路径（pathname） */
  fullPath: string;
  /** 渲染该路由的组件 */
  component: (match: RouteMatch) => VNode;
  /** 该路由的 meta（若配置了） */
  meta?: Record<string, unknown>;
}

export interface CreateRouterOptions {
  /** 路由表，按顺序匹配，第一个匹配成功即返回 */
  routes: RouteConfig[];
  /** 基础路径，默认为 ""；所有 path 会与此拼接后再匹配 */
  basePath?: string;
  /** 是否在 start() 时拦截同源 <a> 点击做客户端导航，默认 true */
  interceptLinks?: boolean;
  /** 无匹配时使用的兜底路由（404 页），path 建议设为 "*" */
  notFound?: RouteConfig;
  /** 前置守卫：导航前执行，返回 false 取消、string 重定向、true/void 放行；支持异步 */
  beforeRoute?: RouteGuard | RouteGuard[];
  /** 后置守卫：导航完成后执行；支持异步 */
  afterRoute?: RouteGuardAfter | RouteGuardAfter[];
  /** 文档标题后缀，设置后会在导航/start 时自动把路由 meta 同步到 head（title、meta 标签） */
  documentTitleSuffix?: string;
  /** 前置守卫最大重定向次数，防止死循环，默认 5 */
  maxRedirects?: number;
}

/**
 * 将路由 path 模式转为正则与参数名列表（不包含 basePath，因匹配时已对 strip base 后的路径）
 * "/user/:id" => { regex: /^\/user\/([^/]+)$/, paramNames: ["id"] }
 */
function pathToRegex(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const segments = pattern.split("/").filter(Boolean);
  const parts = segments.map((seg) => {
    if (seg.startsWith(":")) {
      paramNames.push(seg.slice(1));
      return "([^/]+)";
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  const source = "^/" + (parts.length ? parts.join("/") : "") + "$";
  return { regex: new RegExp(source), paramNames };
}

/** 解析查询字符串为对象 */
function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!search || search === "?") return out;
  const q = search.startsWith("?") ? search.slice(1) : search;
  for (const part of q.split("&")) {
    const [k, v] = part.split("=").map(decodeURIComponent);
    if (k) out[k] = v ?? "";
  }
  return out;
}

/** 从当前 location 获取要匹配的路径与查询串（基于 pathname，history 模式） */
function getCurrentPathAndQuery(options: { basePath: string }): {
  path: string;
  search: string;
} {
  const g = globalThis as unknown as {
    location?: { pathname: string; search: string };
  };
  if (!g.location) return { path: "", search: "" };
  let path = g.location.pathname || "/";
  const search = g.location.search || "";
  const base = options.basePath.replace(/\/$/, "");
  if (base && path.startsWith(base)) {
    path = path.slice(base.length) || "/";
  }
  return { path, search };
}

/**
 * 路由器实例：由 createRouter 返回，提供导航、订阅、启动/停止等能力。
 */
export interface Router {
  /** 获取当前路由匹配结果，无匹配且未配置 notFound 时返回 null */
  getCurrentRoute(): RouteMatch | null;
  /** 将 path 转为完整 href（basePath + path），用于 <a href> */
  href(path: string): string;
  /** 导航到 path（默认 pushState），会执行前置/后置守卫，返回 Promise */
  navigate(path: string, replace?: boolean): Promise<void>;
  /** 替换当前历史记录并导航（等价于 navigate(path, true)） */
  replace(path: string): Promise<void>;
  /** 浏览器后退 */
  back(): void;
  /** 浏览器前进 */
  forward(): void;
  /** 浏览器前进/后退步数 */
  go(delta: number): void;
  /** 订阅路由变化（navigate / 浏览器前进后退），返回取消订阅函数 */
  subscribe(callback: () => void): () => void;
  /** 启动：监听 popstate，可选拦截同源 <a> 点击 */
  start(): void;
  /** 停止：移除所有监听与链接拦截 */
  stop(): void;
}

/**
 * 创建 SPA 路由器实例（基于 History API，不依赖 @dreamer/router/client）。
 *
 * @param options - 路由表、basePath、守卫、notFound、拦截链接等配置
 * @returns Router 实例，需调用 start() 后才会监听 popstate 与拦截 <a> 点击
 *
 * @example
 * const router = createRouter({
 *   routes: [
 *     { path: "/", component: () => <Home /> },
 *     { path: "/user/:id", component: (m) => <User id={m.params.id} /> },
 *   ],
 * });
 * router.start();
 * // 在 createRoot 中：const [match, setMatch] = createSignal(router.getCurrentRoute());
 * // router.subscribe(() => setMatch(router.getCurrentRoute()));
 * // 根组件根据 match() 渲染 match()?.component(match()!)
 */
export function createRouter(options: CreateRouterOptions): Router {
  const {
    routes,
    basePath = "",
    interceptLinks = true,
    notFound: notFoundOption,
    beforeRoute: beforeRouteOption,
    afterRoute: afterRouteOption,
    documentTitleSuffix = "",
    maxRedirects = 5,
  } = options;

  const notFoundConfig = notFoundOption ?? null;
  const beforeGuards = beforeRouteOption == null
    ? []
    : Array.isArray(beforeRouteOption)
    ? beforeRouteOption
    : [beforeRouteOption];
  const afterGuards = afterRouteOption == null
    ? []
    : Array.isArray(afterRouteOption)
    ? afterRouteOption
    : [afterRouteOption];

  const compiled = routes.map((r) => ({
    ...r,
    ...pathToRegex(r.path),
  }));

  const subscribers: Array<() => void> = [];
  let clickHandler: ((e: Event) => void) | null = null;
  let popstateHandler: (() => void) | null = null;

  function getPathAndQuery(): { path: string; search: string } {
    return getCurrentPathAndQuery({ basePath });
  }

  function matchPath(pathname: string, search: string): RouteMatch | null {
    const path = pathname.replace(/\?.*$/, "").replace(/#.*$/, "") || "/";
    const query = parseQuery(search);

    for (const r of compiled) {
      const m = path.match(r.regex);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => {
        params[name] = m[i + 1] ?? "";
      });
      return {
        path: r.path,
        params,
        query,
        fullPath: path + (search ? search : ""),
        component: r.component,
        meta: r.meta,
      };
    }
    if (notFoundConfig) {
      return {
        path: notFoundConfig.path,
        params: {},
        query,
        fullPath: path + (search ? search : ""),
        component: notFoundConfig.component,
        meta: notFoundConfig.meta,
      };
    }
    return null;
  }

  function getCurrentRoute(): RouteMatch | null {
    const { path, search } = getPathAndQuery();
    return matchPath(path, search);
  }

  function notify(): void {
    subscribers.forEach((cb) => cb());
  }

  /** 根据 path 与 search 计算即将进入的 RouteMatch（用于守卫的 to） */
  function resolveMatch(path: string, search: string): RouteMatch | null {
    const p = path.replace(/\?.*$/, "").replace(/#.*$/, "") || "/";
    return matchPath(p, search);
  }

  async function navigate(
    path: string,
    replace = false,
    redirectDepth = 0,
  ): Promise<void> {
    if (!hasHistory()) return;
    if (redirectDepth > maxRedirects) return;

    const from = getCurrentRoute();
    const pathNorm = path.startsWith("/") ? path : "/" + path;
    const to = resolveMatch(pathNorm, "");

    for (const guard of beforeGuards) {
      const result = await Promise.resolve(guard(to, from));
      if (result === false) return;
      if (typeof result === "string") {
        await navigate(result, replace, redirectDepth + 1);
        return;
      }
    }

    const g = globalThis as unknown as {
      history?: {
        pushState: (a: unknown, b: string, c: string) => void;
        replaceState: (a: unknown, b: string, c: string) => void;
      };
      location?: { pathname: string; origin: string; search: string };
    };
    const base = basePath.replace(/\/$/, "") || "";
    const url = `${g.location?.origin ?? ""}${base}${pathNorm}`;

    try {
      if (replace) {
        g.history?.replaceState(null, "", url);
      } else {
        g.history?.pushState(null, "", url);
      }
      notify();

      const toAfter = getCurrentRoute();
      for (const guard of afterGuards) {
        await Promise.resolve(guard(toAfter, from));
      }
      if (typeof globalThis.document !== "undefined" && toAfter) {
        applyMetaToHead(
          toAfter.meta,
          documentTitleSuffix,
          toAfter.path,
        );
      }
    } catch {
      // 跨域或安全限制时可能抛错，忽略
    }
  }

  /** 将 path 转为完整 href（basePath + path） */
  function href(path: string): string {
    const pathNorm = path.startsWith("/") ? path : "/" + path;
    const base = basePath.replace(/\/$/, "") || "";
    return `${base}${pathNorm}`;
  }

  function replace(path: string): Promise<void> {
    return navigate(path, true);
  }

  function back(): void {
    const g = globalThis as unknown as { history?: { back: () => void } };
    g.history?.back();
  }

  function forward(): void {
    const g = globalThis as unknown as { history?: { forward: () => void } };
    g.history?.forward();
  }

  function go(delta: number): void {
    const g = globalThis as unknown as {
      history?: { go: (n: number) => void };
    };
    g.history?.go(delta);
  }

  function subscribe(callback: () => void): () => void {
    subscribers.push(callback);
    return () => {
      const i = subscribers.indexOf(callback);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }

  function start(): void {
    if (!hasHistory()) return;
    if (typeof globalThis.document !== "undefined") {
      const current = getCurrentRoute();
      if (current) {
        applyMetaToHead(current.meta, documentTitleSuffix, current.path);
      }
    }

    const g = globalThis as unknown as {
      addEventListener?: (type: string, fn: () => void) => void;
      removeEventListener?: (type: string, fn: () => void) => void;
      document?: {
        addEventListener: (type: string, fn: (e: Event) => void) => void;
        removeEventListener: (type: string, fn: (e: Event) => void) => void;
      };
    };

    popstateHandler = () => notify();
    g.addEventListener?.("popstate", popstateHandler);

    if (interceptLinks && g.document) {
      clickHandler = (e: Event) => {
        const target = (e as MouseEvent).target as HTMLElement | null;
        const a = target?.closest?.("a");
        if (
          !a || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey ||
          (e as MouseEvent).shiftKey || (e as MouseEvent).button !== 0
        ) return;
        const href = a.getAttribute("href");
        if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
          return;
        }
        if (href.startsWith("#")) return; // 锚点不拦截
        try {
          const url = new URL(href, globalThis.location?.href);
          if (url.origin !== globalThis.location?.origin) return;
          e.preventDefault();
          const path = url.pathname + url.search;
          navigate(path.startsWith("/") ? path : "/" + path);
        } catch {
          // 无效 URL 不拦截
        }
      };
      g.document.addEventListener("click", clickHandler);
    }
  }

  function stop(): void {
    const g = globalThis as unknown as {
      removeEventListener?: (type: string, fn: () => void) => void;
      document?: {
        removeEventListener: (type: string, fn: (e: Event) => void) => void;
      };
    };
    if (popstateHandler) {
      g.removeEventListener?.("popstate", popstateHandler);
      popstateHandler = null;
    }
    if (clickHandler && g.document) {
      g.document.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
  }

  return {
    getCurrentRoute,
    href,
    navigate,
    replace,
    back,
    forward,
    go,
    subscribe,
    start,
    stop,
  };
}

/** 懒加载路由页组件（按 path 缓存 resource，支持动态 import）及可选文案/样式类型；从本模块直接导出使用 */
export {
  RoutePage,
  type RoutePageClasses,
  type RoutePageLabels,
  type RoutePageStyle,
  type RoutePageStyles,
} from "./route-page.tsx";
