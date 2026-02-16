/**
 * 内置 SPA 路由模块：基于 History API 或 location.hash 的客户端路由，不依赖 @dreamer/router/client。
 *
 * @module @dreamer/view/router
 * @packageDocumentation
 *
 * 支持无刷新跳转、路由订阅、同源 <a> 点击拦截、前置/后置守卫、404 兜底、back/forward/go、路由 meta；
 * 支持 history 与 hash 两种模式。
 *
 * **链接拦截（interceptLinks）：** 仅左键、同源 http(s) 链接会拦截；不拦截：target≠_self、download、data-native、
 * 同页锚点（pathname+search 相同且仅 hash）、hash 模式下 #section（非 #/path）、修饰键/非左键、跨域或无效 href。
 *
 * **导出函数：** createRouter、buildPath
 *
 * **导出类型：** RouteGuardResult、RouteGuard、RouteGuardAfter、RouteConfig、RouteMatch、GetState、
 * RoutePageMatch、NavigateTo、CreateRouterOptions、Router、RouteMatchWithRouter、RouteComponentModule、LayoutComponentModule
 *
 * **Router 实例方法：** getCurrentRoute、getMatchForLocation、href、navigate、replace、back、forward、go、
 * getCurrentRouteSignal、subscribe、start、stop
 *
 * **scroll 选项：** options.scroll 为 `'top'` 时导航完成后 scrollTo(0,0)；为 `'restore'` 时恢复该路由上次滚动位置；`false` 不处理。
 *
 * @example
 * ```ts
 * import { createRouter } from "@dreamer/view/router";
 * const router = createRouter({ routes: [{ path: "/", component: () => <Home /> }] });
 * router.start();
 * // 根组件中：const current = router.getCurrentRouteSignal()(); 即可随路由变化重渲染
 * ```
 */

import type { VNode } from "./types.ts";
import { applyMetaToHead } from "./meta.ts";
import { createSignal } from "./signal.ts";

/**
 * 前置守卫（beforeRoute）的返回值。
 * - `false`：取消本次导航
 * - `string`：重定向到该路径（会再次经过前置守卫，受 maxRedirects 限制）
 * - `true` 或 `void`：放行
 * 支持返回 Promise。
 */
export type RouteGuardResult =
  | boolean
  | string
  | void
  | Promise<boolean | string | void>;

/**
 * 前置守卫：在每次导航前执行，可放行、取消或重定向。
 * @param to - 即将进入的路由匹配结果（目标）
 * @param from - 当前/离开的路由匹配结果
 * @returns RouteGuardResult：false 取消、string 重定向、true/void 放行；可为 Promise
 */
export type RouteGuard = (
  to: RouteMatch | null,
  from: RouteMatch | null,
) => RouteGuardResult;

/**
 * 后置守卫：在导航完成（history/hash 已更新、订阅已通知）后执行，用于埋点、改 title 等。
 * @param to - 当前进入的路由匹配结果
 * @param from - 离开的路由匹配结果
 * @returns void 或 Promise<void>；支持异步
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
 * 懒加载路由模块：动态 import 返回的模块形状。
 * RoutePage 会取 default 并传入 match 渲染；用于 route 配置中的 component: () => import("...")。
 */
export type RouteComponentModule = {
  /** 接收可选 RouteMatch，返回该页面的 VNode */
  default: (match?: RouteMatch) => VNode;
};

/**
 * 布局组件模块：用于嵌套布局，default 接收 { children } 包裹子内容。
 */
export type LayoutComponentModule = {
  /** 接收 children（当前路由渲染的 VNode），返回包裹后的 VNode */
  default: (props: { children: VNode | VNode[] }) => VNode;
};

/**
 * 单条路由配置：path 支持动态参数 :param，可选 metadata 供守卫或布局使用。
 * component 支持同步（返回 VNode）或懒加载（返回 Promise<{ default: (match?) => VNode }>）。
 *
 * @example
 * { path: "/", component: () => <Home />, metadata: { title: "首页" } }
 * { path: "/user/:id", component: (match) => <User id={match.params.id} /> }
 * { path: "/lazy", component: () => import("./LazyPage.tsx"), metadata: { title: "懒加载" } }
 */
export interface RouteConfig {
  /** 路径模式，支持 :param（如 /user/:id） */
  path: string;
  /**
   * 渲染该路由的组件：同步时返回 VNode，懒加载时返回 Promise<{ default: (match?) => VNode }>（如 () => import("./Page.tsx")）
   */
  component:
    | ((match: RouteMatch) => VNode)
    | ((match: RouteMatch) => Promise<RouteComponentModule>);
  /** 路由元信息，如 title、requiresAuth，供守卫或布局读取 */
  metadata?: Record<string, unknown>;
  /**
   * 是否继承父级 Layout；当前目录 _layout 中 export const inheritLayout = false 时不继承，支持不限层级的布局嵌套。
   * 仅由 view-cli 根据 src/views 目录扫描生成。
   */
  inheritLayout?: boolean;
  /**
   * 子布局链（不含根）：按从外到内顺序，每项为 () => import("...")，用于嵌套 _layout 继承。
   * 仅由 view-cli 根据 src/views 目录扫描生成。
   */
  layouts?: (() => Promise<LayoutComponentModule>)[];
  /**
   * 该路由所在目录下的 _loading.tsx 懒加载；作用域仅当前目录，子目录不继承。
   * 仅由 view-cli 根据 src/views 目录扫描生成。
   */
  loading?: () => Promise<RouteComponentModule>;
}

/**
 * 由 RoutePage 注入的、按 path+key 稳定的状态 getter。
 * 页面组件通过 match.getState(key, initial) 取得同 path 下稳定的 [getter, setter]。
 *
 * @typeParam T - 状态值的类型
 * @param key - 状态键，同一 path 下相同 key 复用同一状态
 * @param initial - 初始值
 * @returns 二元组 [getter, setter]；setter 可传值或 (prev) => newValue
 */
export type GetState = <T>(
  key: string,
  initial: T,
) => [() => T, (v: T | ((p: T) => T)) => void];

/**
 * 路由页组件首参类型。
 * RoutePage 渲染时会传入带 getState 的 match；非 RoutePage 场景（如单测、单独挂载）可为 undefined。
 */
export type RoutePageMatch = { getState?: GetState } | undefined;

/**
 * 当前路由匹配结果，供路由组件与 beforeRoute/afterRoute 使用。
 * 包含匹配到的 path 模式、params、query、fullPath、component、metadata 等；
 * component 与 RouteConfig 一致，可为同步或懒加载（RoutePage 内会统一处理）。
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
  /** 渲染该路由的组件（同步返回 VNode 或懒加载返回 Promise<RouteComponentModule>） */
  component:
    | ((match: RouteMatch) => VNode)
    | ((match: RouteMatch) => Promise<RouteComponentModule>);
  /** 该路由的 metadata（若配置了） */
  metadata?: Record<string, unknown>;
  /** 是否继承父级 Layout（见 RouteConfig.inheritLayout） */
  inheritLayout?: boolean;
  /** 子布局链（见 RouteConfig.layouts） */
  layouts?: (() => Promise<LayoutComponentModule>)[];
  /** 当前目录 _loading 组件（见 RouteConfig.loading），作用域仅当前目录 */
  loading?: () => Promise<RouteComponentModule>;
}

/**
 * 创建路由器时的配置项。
 * 用于 createRouter(options)，定义路由表、模式、守卫、滚动行为等。
 */
export interface CreateRouterOptions {
  /** 路由表，按顺序匹配，第一个匹配成功即返回；path 支持 :param 动态段 */
  routes: RouteConfig[];
  /** 基础路径，默认为 ""；所有 path 会与此拼接后再匹配，匹配时先 strip 掉 basePath */
  basePath?: string;
  /**
   * 路由模式：'history' 使用 pathname+search（History API），'hash' 使用 location.hash（如 #/about），默认 'history'
   */
  mode?: "history" | "hash";
  /** 是否在 start() 时拦截同源 <a> 点击做客户端导航，默认 true */
  interceptLinks?: boolean;
  /** 无匹配时使用的兜底路由（404 页），path 建议设为 "*" */
  notFound?: RouteConfig;
  /** 前置守卫：导航前执行，返回 false 取消、string 重定向、true/void 放行；支持异步 */
  beforeRoute?: RouteGuard | RouteGuard[];
  /** 后置守卫：导航完成后执行；支持异步 */
  afterRoute?: RouteGuardAfter | RouteGuardAfter[];
  /**
   * 路由切换完成后的滚动行为：'top' 滚动到顶部，'restore' 恢复该路由上次的滚动位置，false 不处理
   * 与 afterRoute 配合：先执行 afterRoute，再根据 scroll 执行滚动
   */
  scroll?: "top" | "restore" | false;
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

/**
 * 带 params、query 的导航目标，用于 navigate、href、replace 的对象形式入参。
 * path 为路由模式（如 "/user/:id"），params 填入路径占位符，query 序列化为查询串。
 *
 * @example
 * { path: "/user/:id", params: { id: "123" }, query: { tab: "profile" } }
 * // => 路径 "/user/123?tab=profile"
 */
export interface NavigateTo {
  /** 路由 path 模式，支持 :param（如 /user/:id、/post/:id/comment/:cid） */
  path: string;
  /** 路径参数，key 对应 path 中的 :param 名，值会经 encodeURIComponent 后填入 */
  params?: Record<string, string>;
  /** 查询参数，会序列化为 ?key=value&...，键与值均会 encodeURIComponent */
  query?: Record<string, string>;
}

/**
 * 根据路由 path 模式、params 与 query 构建完整路径（pathname + search）。
 * 用于 navigate、href、replace 等需要带参数跳转的场景。
 *
 * @param pattern - 路由模式，如 "/user/:id"、"/post/:id/comment/:cid"
 * @param params - 路径参数，:id 取 params.id，值会做 encodeURIComponent
 * @param query - 查询参数，会序列化为 ?a=1&b=2
 * @returns 完整路径，如 "/user/123?tab=profile"
 *
 * @example
 * buildPath("/user/:id", { id: "123" }, { tab: "profile" }) // => "/user/123?tab=profile"
 * buildPath("/user/:id", { id: "123" }) // => "/user/123"
 * buildPath("/search", undefined, { q: "hello" }) // => "/search?q=hello"
 */
export function buildPath(
  pattern: string,
  params?: Record<string, string>,
  query?: Record<string, string>,
): string {
  const segments = (pattern.startsWith("/") ? pattern : "/" + pattern).split(
    "/",
  );
  const pathSegs = segments.map((seg) => {
    if (seg.startsWith(":")) {
      const name = seg.slice(1);
      const value = params?.[name] ?? "";
      return encodeURIComponent(value);
    }
    return seg;
  });
  const pathOnly = pathSegs.join("/") || "/";
  if (!query || Object.keys(query).length === 0) {
    return pathOnly;
  }
  const search = "?" +
    Object.entries(query)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`,
      )
      .join("&");
  return pathOnly + search;
}

/** 将 string | NavigateTo 解析为完整 path 字符串，供 navigate/href/replace 内部使用 */
function resolvePathOrTo(pathOrTo: string | NavigateTo): string {
  if (typeof pathOrTo === "string") {
    return pathOrTo;
  }
  return buildPath(pathOrTo.path, pathOrTo.params, pathOrTo.query);
}

/** 根据路由配置与 path/query/search/params 构建 RouteMatch，避免 matchPath 内两处重复结构 */
function buildMatch(
  r: Pick<
    RouteConfig,
    "path" | "component" | "metadata" | "inheritLayout" | "layouts" | "loading"
  >,
  path: string,
  query: Record<string, string>,
  search: string,
  params: Record<string, string>,
): RouteMatch {
  return {
    path: r.path,
    params,
    query,
    fullPath: path + (search ? search : ""),
    component: r.component,
    metadata: r.metadata,
    inheritLayout: r.inheritLayout,
    layouts: r.layouts,
    loading: r.loading,
  };
}

/**
 * 从当前 location 获取要匹配的路径与查询串。
 * history 模式：基于 pathname + search；hash 模式：从 location.hash 解析（#/path 或 #/path?query）。
 */
function getCurrentPathAndQuery(options: {
  basePath: string;
  mode?: "history" | "hash";
}): { path: string; search: string } {
  const g = globalThis as unknown as {
    location?: { pathname: string; search: string; hash: string };
  };
  if (!g.location) return { path: "", search: "" };
  const mode = options.mode ?? "history";
  const base = options.basePath.replace(/\/$/, "");

  if (mode === "hash") {
    const raw = (g.location.hash || "").slice(1);
    const [pathPart, ...searchParts] = raw.split("?");
    const pathOnly = pathPart || "/";
    const search = searchParts.length ? "?" + searchParts.join("?") : "";
    let path = pathOnly;
    if (base && path.startsWith(base)) {
      path = path.slice(base.length) || "/";
    }
    return { path, search };
  }

  let path = g.location.pathname || "/";
  const search = g.location.search || "";
  if (base && path.startsWith(base)) {
    path = path.slice(base.length) || "/";
  }
  return { path, search };
}

/**
 * 路由器实例：由 createRouter 返回，提供导航、订阅、启动/停止等能力。
 * 所有方法均可在浏览器外调用（无 location/history 时部分方法为 no-op）。
 */
export interface Router {
  /**
   * 获取当前路由匹配结果。
   * 根据当前 location（history 模式用 pathname+search，hash 模式用 location.hash）与路由表匹配，
   * 无匹配且未配置 notFound 时返回 null。
   * @returns 当前匹配的 RouteMatch，或 null
   */
  getCurrentRoute(): RouteMatch | null;

  /**
   * 根据给定的 pathname 与可选 search 解析出 RouteMatch。
   * 不依赖当前全局 location，适用于 HMR 或服务端用已知 pathname/search 解析 match。
   * 会应用 basePath 剥离后再匹配路由表。
   * @param pathname - 路径名，如 "/user/123" 或 "/about"
   * @param search - 可选查询串，如 "?tab=profile" 或 "tab=profile"
   * @returns 匹配到的 RouteMatch，或 null
   */
  getMatchForLocation(pathname: string, search?: string): RouteMatch | null;

  /**
   * 将路径或带 params/query 的目标转为完整 href，用于 <a href={router.href(...)}>。
   * 传字符串时返回 basePath + 路径（hash 模式会加 "#" 前缀）；传 NavigateTo 时内部调用 buildPath 再拼接。
   * @param pathOrTo - 完整路径字符串（如 "/user/123?tab=profile"）或 NavigateTo 对象（path + params + query）
   * @returns history 模式为 basePath+path，hash 模式为 "#"+basePath+path
   * @example
   * router.href("/about")           // => "/about" 或 "#/about"（hash）
   * router.href({ path: "/user/:id", params: { id: "1" }, query: { tab: "info" } })  // => "/user/1?tab=info"
   */
  href(pathOrTo: string | NavigateTo): string;

  /**
   * 导航到指定路径或带 params/query 的目标。
   * 会依次执行：前置守卫（beforeRoute）→ 更新 history/hash → 通知订阅 → 后置守卫（afterRoute）→ 可选滚动与 meta。
   * 前置守卫返回 false 则取消导航，返回 string 则重定向到该路径（受 maxRedirects 限制）。
   * @param pathOrTo - 完整路径字符串（可含 query），或 NavigateTo 对象（path、params、query）
   * @param replace - 为 true 时使用 replaceState 替换当前历史记录，不新增一条
   * @returns Promise，在导航流程结束后 resolve；若无 location/history 或守卫取消则提前结束
   * @example
   * await router.navigate("/about");
   * await router.navigate({ path: "/user/:id", params: { id: "1" }, query: { tab: "posts" } });
   * await router.navigate("/home", true);  // 替换当前记录
   */
  navigate(pathOrTo: string | NavigateTo, replace?: boolean): Promise<void>;

  /**
   * 替换当前历史记录并导航到指定路径或目标。
   * 等价于 navigate(pathOrTo, true)。
   * @param pathOrTo - 完整路径字符串或 NavigateTo 对象
   * @returns Promise，在导航流程结束后 resolve
   */
  replace(pathOrTo: string | NavigateTo): Promise<void>;

  /**
   * 浏览器后退一页。
   * 依赖 history.back()；无 history 环境为 no-op。
   */
  back(): void;

  /**
   * 浏览器前进一页。
   * 依赖 history.forward()；无 history 环境为 no-op。
   */
  forward(): void;

  /**
   * 在历史栈中前进或后退指定步数。
   * 正数前进，负数后退；依赖 history.go(delta)。
   * @param delta - 步数，正数前进、负数后退
   */
  go(delta: number): void;

  /**
   * 返回当前路由的响应式 getter。
   * 在组件中调用 getCurrentRouteSignal()() 即可在路由变化时得到最新 RouteMatch，便于触发重渲染；
   * 无需手动 subscribe。
   * @returns 无参函数，每次调用返回当前 RouteMatch 或 null
   */
  getCurrentRouteSignal(): () => RouteMatch | null;

  /**
   * 订阅路由变化（navigate、replace、浏览器前进/后退导致的地址变化）。
   * 每次路由更新后会调用 callback；start() 后 hash 模式监听 hashchange，history 模式监听 popstate。
   * @param callback - 路由变化时调用的无参函数
   * @returns 取消订阅函数，调用后不再触发该 callback
   */
  subscribe(callback: () => void): () => void;

  /**
   * 启动路由器：根据 mode 监听 popstate 或 hashchange，并可选拦截同源 <a> 点击做客户端导航。
   * 若存在 document，会对当前路由应用一次 meta（title 等）。需在应用挂载前或挂载时调用。
   */
  start(): void;

  /**
   * 停止路由器：移除 popstate/hashchange 监听与 document 上的点击拦截。
   * 调用后前进/后退与链接点击不再触发路由更新与订阅回调。
   */
  stop(): void;
}

/**
 * 当前路由匹配结果与 router、getState 的组合类型，即 RoutePage 传入页面组件的 match 对象。
 * 在 RouteMatch 基础上增加 router 与 getState，便于在页面内导航与维护局部状态。
 */
export type RouteMatchWithRouter = RouteMatch & {
  /** 路由器实例，用于 navigate、href、replace 等 */
  router: Router;
  /** 按 path+key 稳定的状态 getter，见 GetState */
  getState: GetState;
};

/**
 * 创建 SPA 路由器实例（基于 History API 或 hash，不依赖 @dreamer/router/client）。
 * 返回的 Router 需调用 start() 后才会监听 popstate/hashchange 与（可选）拦截同源 <a> 点击。
 *
 * @param options - 路由表、basePath、mode、守卫、notFound、拦截链接、滚动等配置，见 CreateRouterOptions
 * @returns Router 实例，提供 getCurrentRoute、navigate、href、replace、back、forward、go、subscribe、start、stop 等方法
 *
 * @example
 * const router = createRouter({
 *   routes: [
 *     { path: "/", component: () => <Home /> },
 *     { path: "/user/:id", component: (m) => <User id={m.params.id} /> },
 *   ],
 * });
 * router.start();
 * // 根组件：const current = router.getCurrentRouteSignal()(); 根据 current 渲染 RoutePage 或 Layout
 */
export function createRouter(options: CreateRouterOptions): Router {
  const {
    routes,
    basePath = "",
    mode = "history",
    interceptLinks = true,
    notFound: notFoundOption,
    beforeRoute: beforeRouteOption,
    afterRoute: afterRouteOption,
    scroll: scrollOption = false,
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
  let hashchangeHandler: (() => void) | null = null;
  /** 按路径保存的滚动位置，供 scroll: 'restore' 使用 */
  const scrollRestoreMap = new Map<string, { x: number; y: number }>();

  function getPathAndQuery(): { path: string; search: string } {
    return getCurrentPathAndQuery({ basePath, mode });
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
      return buildMatch(r, path, query, search, params);
    }
    if (notFoundConfig) {
      return buildMatch(notFoundConfig, path, query, search, {});
    }
    return null;
  }

  function getCurrentRoute(): RouteMatch | null {
    const { path, search } = getPathAndQuery();
    return matchPath(path, search);
  }

  const [currentRoute, setCurrentRoute] = createSignal<RouteMatch | null>(
    getCurrentRoute(),
  );

  /** 根据传入的 pathname/search 解析 match（与 getCurrentRoute 逻辑一致，但用传入值而非读 location） */
  function getMatchForLocation(
    pathname: string,
    search = "",
  ): RouteMatch | null {
    let path = (pathname || "/").replace(/\?.*$/, "").replace(/#.*$/, "") ||
      "/";
    const base = basePath.replace(/\/$/, "");
    if (base && path.startsWith(base)) {
      path = path.slice(base.length) || "/";
    }
    const searchNorm = (search || "").replace(/^\?/, "");
    return matchPath(path, searchNorm ? "?" + searchNorm : "");
  }

  function notify(): void {
    setCurrentRoute(getCurrentRoute());
    subscribers.forEach((cb) => cb());
  }

  /** 根据 path 与 search 计算即将进入的 RouteMatch（用于守卫的 to） */
  function resolveMatch(path: string, search: string): RouteMatch | null {
    const p = path.replace(/\?.*$/, "").replace(/#.*$/, "") || "/";
    return matchPath(p, search);
  }

  async function navigate(
    pathOrTo: string | NavigateTo,
    replace = false,
    redirectDepth = 0,
  ): Promise<void> {
    if (!hasHistory()) return;
    if (redirectDepth > maxRedirects) return;

    const path = resolvePathOrTo(pathOrTo);
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
      location?: {
        pathname: string;
        origin: string;
        search: string;
        hash: string;
      };
      scrollX?: number;
      scrollY?: number;
      scrollTo?: (x: number, y: number) => void;
    };
    const base = basePath.replace(/\/$/, "") || "";

    if (scrollOption === "restore" && from?.fullPath != null) {
      scrollRestoreMap.set(from.fullPath, {
        x: typeof g.scrollX === "number" ? g.scrollX : 0,
        y: typeof g.scrollY === "number" ? g.scrollY : 0,
      });
    }

    try {
      if (mode === "hash") {
        const hashValue = base ? `${base}${pathNorm}` : pathNorm;
        const hashWithSharp = hashValue.startsWith("#")
          ? hashValue
          : "#" + hashValue;
        if (replace && g.location != null) {
          g.history?.replaceState(
            null,
            "",
            (g.location.pathname ?? "") + (g.location.search ?? "") +
              hashWithSharp,
          );
        } else {
          const loc = g.location as { hash?: string };
          if (loc) loc.hash = hashWithSharp;
        }
      } else {
        const url = `${g.location?.origin ?? ""}${base}${pathNorm}`;
        if (replace) {
          g.history?.replaceState(null, "", url);
        } else {
          g.history?.pushState(null, "", url);
        }
      }
      notify();

      const toAfter = getCurrentRoute();
      for (const guard of afterGuards) {
        await Promise.resolve(guard(toAfter, from));
      }
      if (typeof globalThis.document !== "undefined" && toAfter) {
        applyMetaToHead(
          toAfter.metadata,
          documentTitleSuffix,
          toAfter.path,
        );
      }
      if (scrollOption === "top" && typeof g.scrollTo === "function") {
        g.scrollTo(0, 0);
      } else if (
        scrollOption === "restore" &&
        toAfter?.fullPath != null &&
        typeof g.scrollTo === "function"
      ) {
        const saved = scrollRestoreMap.get(toAfter.fullPath);
        if (saved != null) {
          g.scrollTo(saved.x, saved.y);
        } else {
          g.scrollTo(0, 0);
        }
      }
    } catch {
      // 跨域或安全限制时可能抛错，忽略
    }
  }

  /** 将 path 或 NavigateTo 转为完整 href（history 为 basePath+path，hash 为 #+basePath+path） */
  function href(pathOrTo: string | NavigateTo): string {
    const path = resolvePathOrTo(pathOrTo);
    const pathNorm = path.startsWith("/") ? path : "/" + path;
    const base = basePath.replace(/\/$/, "") || "";
    const full = `${base}${pathNorm}`;
    if (mode === "hash") {
      return full.startsWith("#") ? full : "#" + full;
    }
    return full;
  }

  function replace(pathOrTo: string | NavigateTo): Promise<void> {
    return navigate(pathOrTo, true);
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
        applyMetaToHead(current.metadata, documentTitleSuffix, current.path);
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

    if (mode === "hash") {
      hashchangeHandler = () => notify();
      g.addEventListener?.("hashchange", hashchangeHandler);
    } else {
      popstateHandler = () => notify();
      g.addEventListener?.("popstate", popstateHandler);
    }

    if (interceptLinks && g.document) {
      clickHandler = (e: Event) => {
        const target = (e as MouseEvent).target as HTMLElement | null;
        const a = target?.closest?.("a");
        if (
          !a || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey ||
          (e as MouseEvent).shiftKey || (e as MouseEvent).button !== 0
        ) return;
        const href = a.getAttribute("href");
        if (!href || href.trim() === "") return;
        const targetAttr = a.getAttribute("target");
        if (targetAttr && targetAttr !== "_self") return;
        if (a.hasAttribute?.("download")) return;
        if (a.hasAttribute?.("data-native")) return;
        const hrefTrim = href.trim();
        // hash 模式：#/path 为路由链接需拦截，#section 为锚点不拦截
        if (hrefTrim.startsWith("#")) {
          if (mode === "hash" && hrefTrim.startsWith("#/")) {
            e.preventDefault();
            navigate(
              hrefTrim.slice(1).startsWith("/")
                ? hrefTrim.slice(1)
                : "/" + hrefTrim.slice(1),
            );
          }
          return;
        }
        try {
          const url = new URL(href, globalThis.location?.href);
          if (url.protocol !== "http:" && url.protocol !== "https:") return;
          if (url.origin !== globalThis.location?.origin) return;
          // 同页锚点（pathname+search 相同且链接带 hash）不拦截，交给浏览器滚动
          const loc = globalThis.location;
          if (
            url.pathname === loc?.pathname &&
            url.search === loc?.search &&
            url.hash
          ) return;
          e.preventDefault();
          const path = url.pathname + url.search + url.hash;
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
    if (hashchangeHandler) {
      g.removeEventListener?.("hashchange", hashchangeHandler);
      hashchangeHandler = null;
    }
    if (clickHandler && g.document) {
      g.document.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
  }

  return {
    getCurrentRoute,
    getCurrentRouteSignal: () => currentRoute,
    getMatchForLocation,
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

/**
 * 懒加载路由页组件与配套类型，从 route-page 统一导出便于从 router 入口使用。
 *
 * - **RoutePage**：接收 match、router、showLoading、labels、classes、styles，渲染加载中/错误/页面内容三态
 * - **RoutePageClasses**：错误态、加载态、过渡容器等 class 名
 * - **RoutePageStyles**：对应内联 style
 * - **RoutePageLabels**：错误标题、重试按钮、加载中文案
 * - **RoutePageStyle**：内联样式对象类型
 *
 * 完整实现与参数说明见 `src/route-page.tsx`。
 */
export {
  RoutePage,
  type RoutePageClasses,
  type RoutePageLabels,
  type RoutePageStyle,
  type RoutePageStyles,
} from "./route-page.tsx";
