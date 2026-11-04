/**
 * @module integrations/router/types
 * @description Router public types (RouteConfig / CreateRouterOptions / Router, …).
 */

export interface RouteConfig {
  path: string;
  component: any;
  metadata?: Record<string, any>;
  layouts?: (() => Promise<any>)[];
  loading?: () => any;
  inheritLayout?: boolean;
}

/** 守卫与订阅使用的位置快照 */
export interface RouteLocation {
  /** 浏览器完整 pathname（含 basePath） */
  pathname: string;
  /** 去掉 basePath 后用于匹配的路径（以 / 开头） */
  path: string;
  search: string;
  hash: string;
  query: Record<string, string>;
  params: Record<string, string>;
}

/** 当前命中的路由信息（供 render / 外部读取） */
export interface RouteMatch extends RouteLocation {
  /** 路由表里的 path 模式，如 `/user/:id` */
  pattern: string;
  route: RouteConfig;
}

/** createRouter 完整选项 */
export interface CreateRouterOptions {
  routes: RouteConfig[];
  /** 应用挂载前缀，如 `/app`；navigate("/x") 实际变更 `/app/x` */
  basePath?: string;
  /** 追加到表尾作为兜底，等价于 `{ path: "*", ... }` */
  notFound?: RouteConfig;
  /** 导航后滚动：`top` 置顶，`restore` 按 path+search 记忆位置，`false` 不处理 */
  scroll?: false | "top" | "restore";
  /**
   * 是否在 document 上委托点击（冒泡阶段），拦截同源 `<a>`（默认 `true`）。
   * `Link` 带 `data-view-link` 会跳过委托；设为 `false` 时仅 `Link` / `navigate` 生效。
   * SSR 模式下强制不启用。
   */
  interceptLinks?: boolean;
  /**
   * 导航前守卫；返回 `false` 或 `Promise<false>` 则取消本次导航（浏览器 `popstate` 无法撤销，仅尽力同步 path）。
   */
  beforeEach?: (
    to: RouteLocation,
    from: RouteLocation | null,
  ) => boolean | void | Promise<boolean | void>;
  /**
   * 追加在 `document.title` 末尾的后缀（如 ` | 站点名`），与 v1.3.9 `documentTitleSuffix` 一致。
   */
  documentTitleSuffix?: string;
  /**
   * **SSR / 测试**：初始 URL（路径、可含 `?query` `#hash`，或绝对 `http(s)://…`）。
   * 不传则读浏览器 `location`。
   */
  url?: string;
  /**
   * **SSR 模式**：不注册 `popstate` / 链接委托（默认可由 `renderToString` 作用域或 `VIEW_SSR` 自动开启）。
   * 客户端 hydration 后请用 `ssr: false`（默认）再 `createRouter`，或 `router.start()`。
   */
  ssr?: boolean;
}

/** 路由实例 */
export interface Router {
  /** 当前完整 pathname（与 `location.pathname` 一致） */
  path: () => string;
  pathname: () => string;
  search: () => string;
  hash: () => string;
  match: () => RouteMatch | null;
  /** 将「应用内路径」转为带 base 的 href，供 `<a href>` 使用 */
  resolveHref: (to: string) => string;
  /** 返回在导航提交完成（含 `beforeEach`）后 resolve 的 Promise，便于测试与串联异步 */
  navigate: (to: string) => Promise<void>;
  replace: (to: string) => Promise<void>;
  back: () => void;
  forward: () => void;
  /** 等价 `history.go(delta)`，如 `go(-2)` */
  go: (delta: number) => void;
  render: () => any;
  /** 注册全局链接委托（createRouter 默认已调用一次，除非 `interceptLinks: false`） */
  start: () => void;
  /** 移除链接拦截（不移除 popstate） */
  stop: () => void;
  /** 路径或命中变化时回调；返回取消订阅函数 */
  subscribe: (fn: () => void) => () => void;
  /** 移除 popstate、链接拦截、订阅，并清空 active 槽位（单测或卸载用） */
  destroy: () => void;
  /**
   * 当前「路由世代」的 AbortSignal：每次成功切页（commitNavigation）会 abort
   * 上一世代并换新。交给 `createResource(..., { signal: router.routeAbortSignal() })`
   * 即可在离页时取消 in-flight（P1-view-route-resource-abort）。
   */
  routeAbortSignal: () => AbortSignal;
}

