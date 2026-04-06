/**
 * @module integrations/router
 * @description SPA 路由：History、`:` 动态段、末尾 `/*` 捕获、`basePath`、全局 `<a>` 冒泡委托、`beforeEach`、滚动策略、`subscribe`/`destroy`。
 *
 * **用法：**
 * - `createRouter(routes)` — 简写，等价于 `createRouter({ routes })`
 * - `createRouter({ routes, basePath?, notFound?, scroll?, interceptLinks?, beforeEach? })`
 *
 * **页面组件 props：** `{ params, query }`（`query` 为扁平对象，重复键后者覆盖）
 *
 * **导入：** `import { createRouter, Link, mountWithRouter, useRouter } from "@dreamer/view"`
 *
 * **`navigate` / `replace`：** 返回 `Promise<void>`，在 `beforeEach` 与 `pushState`/`replaceState` 提交完成后 resolve。
 *
 * **metadata：** 路由表中的 `metadata`（来自页面 `export const metadata` 与 codegen）在命中变化时由框架同步到 `document.title` 与对应 `<meta>`（与 v1.3.9 行为一致）。
 *
 * **仍未覆盖：** 与 SSR 同构、路由级动画、`popstate` 上的异步守卫、嵌套路由树配置。
 *
 * @usage
 * ```ts
 * const router = createRouter({
 *   basePath: "/app",
 *   routes: [
 *     { path: "/", component: Home },
 *     { path: "/user/:id", component: UserPage },
 *     { path: "/files/*", component: Files },
 *   ],
 *   notFound: { path: "*", component: NotFound },
 *   scroll: "top",
 *   beforeEach: (to) => to.params.id !== "0",
 * });
 * mountWithRouter("#root", router);
 * ```
 */

import { createSignal, untrack } from "../reactivity/signal.ts";
import { createMemo } from "../reactivity/memo.ts";
import { runWithOwner } from "../reactivity/owner.ts";
import { getInternal } from "../reactivity/master.ts";
import { invalidateViewLazyModules } from "../runtime/component.ts";
import { mount } from "../runtime/browser.ts";
import { jsx } from "../jsx-runtime.ts";
import type { VNode } from "../types.ts";
import { createResource } from "./resource.ts";
import { applyMetaToHead } from "./meta.ts";

// ———————————————————————————————————————————————————————————————————————————
// 类型
// ———————————————————————————————————————————————————————————————————————————

/** 单条路由配置 */
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
}

/** 物理单例路由状态 */
const routerCore = getInternal("router", () => ({
  active: null as Router | null,
}));

/**
 * 返回由 {@link createRouter} 注册到单例槽位的当前路由器。
 * @returns {@link Router}
 * @throws 尚未创建路由器时抛出
 */
export function useRouter(): Router {
  if (!routerCore.active) {
    throw new Error("[@dreamer/view] No router instance found.");
  }
  return routerCore.active;
}

const ROUTE_RESOURCE_CACHE = new WeakMap<RouteConfig, any>();

/** happy-dom 等环境仅有 `window.location`，无顶层 `globalThis.location` */
function getLocation(): Location | undefined {
  const g = globalThis as unknown as {
    location?: Location;
    window?: { location?: Location };
  };
  return g.location ?? g.window?.location;
}

/**
 * `popstate` 由浏览器 `window` 派发；Deno 单测里 `globalThis` 与 `window` 不是同一对象时，
 * 若在 `globalThis` 上监听而在 `window` 上派发，会永远收不到事件。
 */
function getPopStateEventTarget(): Pick<
  Window,
  "addEventListener" | "removeEventListener"
> {
  const g = globalThis as unknown as { window?: Window };
  const w = g.window;
  if (w && typeof w.addEventListener === "function") return w;
  return globalThis as unknown as Window;
}

// ———————————————————————————————————————————————————————————————————————————
// 路径工具
// ———————————————————————————————————————————————————————————————————————————

/** 规范化 basePath：无前导双斜杠、无末尾斜杠（根除外） */
function normalizeBasePath(base: string | undefined): string {
  if (!base || base === "/") return "";
  let b = base.startsWith("/") ? base : "/" + base;
  b = b.replace(/\/+$/, "");
  return b;
}

/** 应用内路径 + base → 浏览器 pathname */
function joinBasePath(base: string, internalPath: string): string {
  const p = internalPath.startsWith("/") ? internalPath : "/" + internalPath;
  if (!base) return p || "/";
  return (base + p).replace(/\/{2,}/g, "/") || "/";
}

/** 从完整 pathname 得到用于匹配的应用内路径 */
function stripBasePath(fullPathname: string, base: string): string {
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
function normalizeInternalPath(p: string): string {
  if (!p || p === "/") return "/";
  const prefixed = p.startsWith("/") ? p : "/" + p;
  return prefixed.replace(/\/+$/, "") || "/";
}

function pathToParts(internalPath: string): string[] {
  const n = normalizeInternalPath(internalPath);
  if (n === "/") return [];
  return n.slice(1).split("/").filter(Boolean);
}

function searchToRecord(search: string): Record<string, string> {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const u = new URLSearchParams(q);
  const o: Record<string, string> = {};
  u.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

/**
 * 将 path 模式与路径分段匹配；支持 `:id`、末尾 `/*` 捕获剩余到 `*` 键。
 * 单独 `*` 或 `/*` 匹配任意路径。
 */
function matchPattern(
  pattern: string,
  pathParts: string[],
): Record<string, string> | null {
  const pat = pattern.trim();
  if (pat === "*" || pat === "/*") {
    return { "*": pathParts.length ? pathParts.join("/") : "" };
  }

  let patParts = pat.split("/").filter(Boolean);
  const params: Record<string, string> = {};

  if (patParts.length > 0 && patParts[patParts.length - 1] === "*") {
    patParts = patParts.slice(0, -1);
    if (pathParts.length < patParts.length) return null;
    const fixedPath = pathParts.slice(0, patParts.length);
    const splat = pathParts.slice(patParts.length).join("/");
    const sub = matchStaticAndParams(patParts, fixedPath);
    if (sub === null) return null;
    Object.assign(params, sub);
    params["*"] = splat;
    return params;
  }

  if (patParts.length !== pathParts.length) return null;
  return matchStaticAndParams(patParts, pathParts);
}

function matchStaticAndParams(
  patParts: string[],
  pathParts: string[],
): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const p = patParts[i];
    const s = pathParts[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = s;
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

interface CompiledRoute {
  config: RouteConfig;
  pattern: string;
}

function compileRouteList(
  routes: RouteConfig[],
  notFound?: RouteConfig,
): CompiledRoute[] {
  const list: CompiledRoute[] = routes.map((config) => ({
    config,
    pattern: config.path,
  }));
  if (
    notFound &&
    !routes.some((r) => r.path === "*" || r.path === "/*")
  ) {
    list.push({ config: notFound, pattern: notFound.path });
  }
  return list;
}

function findCompiledMatch(
  compiled: CompiledRoute[],
  pathParts: string[],
): { config: RouteConfig; params: Record<string, string> } | null {
  for (const c of compiled) {
    const params = matchPattern(c.pattern, pathParts);
    if (params !== null) return { config: c.config, params };
  }
  return null;
}

// ———————————————————————————————————————————————————————————————————————————
// 工厂
// ———————————————————————————————————————————————————————————————————————————

/**
 * 使用路由表创建路由器并注册为当前实例（简写形式）。
 * @param routes 路由配置数组
 * @returns {@link Router}
 */
export function createRouter(routes: RouteConfig[]): Router;

/**
 * 使用完整选项创建路由器：`basePath`、`beforeEach`、`notFound`、`interceptLinks` 等。
 * @param options 路由器选项
 * @returns {@link Router}
 */
export function createRouter(options: CreateRouterOptions): Router;

export function createRouter(
  routesOrOpts: RouteConfig[] | CreateRouterOptions,
): Router {
  const opts: CreateRouterOptions = Array.isArray(routesOrOpts)
    ? { routes: routesOrOpts }
    : routesOrOpts;

  const basePath = normalizeBasePath(opts.basePath);
  const scrollMode = opts.scroll === undefined ? false : opts.scroll;
  const interceptLinks = opts.interceptLinks !== false;
  const beforeEach = opts.beforeEach;
  /** 与 v1.3.9 一致：拼接到 metadata.title 之后 */
  const documentTitleSuffix = opts.documentTitleSuffix ?? "";
  const compiled = compileRouteList(opts.routes, opts.notFound);

  const scrollMemory = new Map<string, number>();
  const subscribers = new Set<() => void>();

  let lastMatchKey = "";
  let interceptOn = false;
  let popOn = false;
  /** popstate 防抖定时器，destroy 时必须 clear，避免泄漏到后续用例 */
  let popStateTimer: ReturnType<typeof setTimeout> | null = null;
  /** destroy 后置 true，防止已销毁实例的定时回调再写信号 */
  let routerDisposed = false;

  /** 销毁上一实例的监听，避免单测泄漏 */
  const prev = routerCore.active as (Router & { destroy?: () => void }) | null;
  prev?.destroy?.();

  const [locationSig, setLocationSig] = createSignal(
    readBrowserLocation(),
  );

  const strippedPath = createMemo(() => {
    const { pathname } = locationSig();
    return normalizeInternalPath(stripBasePath(pathname, basePath));
  });

  const activeMatch = createMemo((): RouteMatch | null => {
    const loc = locationSig();
    const internal = strippedPath();
    const parts = pathToParts(internal);
    const found = findCompiledMatch(compiled, parts);
    const query = searchToRecord(loc.search);
    if (!found) return null;
    return {
      pathname: loc.pathname,
      path: internal,
      search: loc.search,
      hash: loc.hash,
      query,
      params: found.params,
      pattern: found.config.path,
      route: found.config,
    };
  });

  function readBrowserLocation(): {
    pathname: string;
    search: string;
    hash: string;
  } {
    const loc = getLocation();
    let pathname = loc?.pathname || "/";
    /** 部分环境（happy-dom / about:）pathname 无前导 `/`，与 Web 规范及本路由分段逻辑对齐 */
    if (pathname && !pathname.startsWith("/")) {
      pathname = "/" + pathname;
    }
    /**
     * 空白文档默认 pathname 常为 `blank`，与 `history.replaceState(..., "/")` 后仍不同步时，
     * 将单段 `/blank` 视为应用根 `/`，避免无法匹配 `/` 路由、不出现首屏。
     */
    const href = loc?.href ?? "";
    if (
      (href === "about:blank" || href.startsWith("about:")) &&
      pathname === "/blank"
    ) {
      pathname = "/";
    }
    return {
      pathname,
      search: loc?.search || "",
      hash: loc?.hash || "",
    };
  }

  function scrollKey(loc: { pathname: string; search: string }): string {
    return loc.pathname + loc.search;
  }

  function applyScrollAfterNav(
    prevLoc: { pathname: string; search: string } | null,
  ) {
    if (scrollMode === false) return;
    const g = globalThis as unknown as {
      scrollTo?: (x: number, y: number) => void;
      scrollY?: number;
    };
    if (scrollMode === "top") {
      queueMicrotask(() => g.scrollTo?.(0, 0));
      return;
    }
    if (scrollMode === "restore" && prevLoc) {
      scrollMemory.set(scrollKey(prevLoc), g.scrollY ?? 0);
    }
    if (scrollMode === "restore") {
      const now = locationSig();
      const y = scrollMemory.get(scrollKey(now));
      queueMicrotask(() => {
        if (y != null) g.scrollTo?.(0, y);
      });
    }
  }

  function notifySubscribers() {
    const m = activeMatch();
    const loc = locationSig();
    const key = m
      ? `${m.pathname}${m.search}${m.hash}${m.pattern}:${
        JSON.stringify(m.params)
      }`
      : `${loc.pathname}-no-match`;
    if (key !== lastMatchKey) {
      lastMatchKey = key;
      /** 路由命中变化时同步 `<title>` 与 meta（页面 export 的 metadata 经 codegen 进入路由表） */
      if (typeof globalThis.document !== "undefined") {
        applyMetaToHead(
          m?.route.metadata as Record<string, unknown> | undefined,
          documentTitleSuffix,
          m?.path ?? "",
        );
      }
      subscribers.forEach((fn) => {
        try {
          fn();
        } catch { /* 忽略订阅方错误 */ }
      });
    }
  }

  /**
   * dev HMR：`__HMR_REFRESH__` 在 `import(chunk?t)` 成功后调用。
   * - jsx-runtime：路由 Resource 曾缓存首次 `import()` 的 namespace，必须用新 `mod` 覆盖，否则界面不更新。
   * - compiler：createHMRProxy 依赖 chunk 二次执行；合并 mod 后 insert 侧对 Resource 的订阅会重跑。
   * 无法根据 routePath 命中缓存时（如根 `_layout.tsx` → `/_layout`），清空缓存并整页刷新。
   */
  function applyViewHmrPayload(payload: {
    chunkUrl?: string;
    routePath?: string;
    mod: { default?: unknown };
  }): void {
    const { routePath, mod } = payload;
    invalidateViewLazyModules();

    const normalizeHmrPath = (p: string): string => {
      const x = p.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
      return x === "" ? "/" : x;
    };

    const internal = routePath ? normalizeHmrPath(routePath) : undefined;
    let target: RouteConfig | undefined;
    if (internal !== undefined) {
      for (const c of compiled) {
        const p = c.config.path;
        if (p === internal) {
          target = c.config;
          break;
        }
        if (p === "*" && (internal === "/_404" || internal === "/404")) {
          target = c.config;
          break;
        }
      }
    }

    if (target) {
      const res = ROUTE_RESOURCE_CACHE.get(target);
      const data = res?.() as
        | { layouts: unknown[]; component: unknown }
        | undefined;
      if (res && data && Array.isArray(data.layouts)) {
        res.mutate({ ...data, component: mod });
        lastMatchKey = "";
        notifySubscribers();
        return;
      }
    }

    for (const c of compiled) {
      ROUTE_RESOURCE_CACHE.delete(c.config);
    }
    lastMatchKey = "";
    notifySubscribers();
    if (typeof globalThis.location?.reload === "function") {
      globalThis.location.reload();
    }
  }

  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as {
      __VIEW_HMR_APPLY__?: typeof applyViewHmrPayload;
    }).__VIEW_HMR_APPLY__ = applyViewHmrPayload;
  }

  function toRouteLocation(m: RouteMatch | null): RouteLocation | null {
    if (!m) return null;
    return {
      pathname: m.pathname,
      path: m.path,
      search: m.search,
      hash: m.hash,
      query: m.query,
      params: m.params,
    };
  }

  async function runBeforeEach(
    nextFull: { pathname: string; search: string; hash: string },
  ): Promise<boolean> {
    if (!beforeEach) return true;
    const nextInternal = normalizeInternalPath(
      stripBasePath(nextFull.pathname, basePath),
    );
    const nextParts = pathToParts(nextInternal);
    const found = findCompiledMatch(compiled, nextParts);
    const query = searchToRecord(nextFull.search);
    const to: RouteLocation = {
      pathname: nextFull.pathname,
      path: nextInternal,
      search: nextFull.search,
      hash: nextFull.hash,
      query,
      params: found?.params ?? {},
    };
    const from = toRouteLocation(activeMatch());
    const ret = beforeEach(to, from);
    const ok = ret instanceof Promise ? await ret : ret;
    return ok !== false;
  }

  function syncFromBrowser() {
    setLocationSig(readBrowserLocation());
    notifySubscribers();
  }

  /**
   * 解析导航目标；外链返回 `null`（由 navigate/replace 走 `location.assign/replace`）。
   */
  function resolveFullNavigationTarget(to: string): {
    pathname: string;
    search: string;
    hash: string;
  } | null {
    const loc = getLocation();
    const current = loc?.href ?? "http://local/";

    let u: URL;
    try {
      u = new URL(to, current);
    } catch {
      /** `about:blank` 等基址会导致相对 URL 解析失败，退回固定主机避免误判为 `/` */
      try {
        u = new URL(to, "http://localhost/");
      } catch {
        return { pathname: "/", search: "", hash: "" };
      }
    }

    /**
     * 仅在双方均为 http(s) 时比较 origin；about:blank 等与相对路径组合时
     * `URL.origin` 与 `location.origin` 可能不一致，误判为外链会走 assign 而不更新路由。
     */
    if (
      loc &&
      (loc.protocol === "http:" || loc.protocol === "https:") &&
      (u.protocol === "http:" || u.protocol === "https:") &&
      u.origin !== loc.origin
    ) {
      return null;
    }

    const pathPart = u.pathname;
    if (basePath) {
      if (pathPart.startsWith(basePath)) {
        return {
          pathname: pathPart,
          search: u.search,
          hash: u.hash,
        };
      }
      return {
        pathname: joinBasePath(basePath, pathPart),
        search: u.search,
        hash: u.hash,
      };
    }
    return {
      pathname: pathPart || "/",
      search: u.search,
      hash: u.hash,
    };
  }

  async function commitNavigation(
    target: { pathname: string; search: string; hash: string } | null,
    replaceMode: boolean,
  ) {
    if (!target) return;

    /** 目标与当前信号一致时跳过（避免重复 scroll / subscribe / push） */
    const cur = locationSig();
    if (
      cur.pathname === target.pathname && cur.search === target.search &&
      cur.hash === target.hash
    ) {
      return;
    }

    const prevLoc = readBrowserLocation();
    const ok = await runBeforeEach(target);
    if (!ok) return;

    const hist = globalThis.history;
    const url = target.pathname + target.search + target.hash;
    if (hist && typeof hist.pushState === "function") {
      if (replaceMode) hist.replaceState({}, "", url);
      else hist.pushState({}, "", url);
    }
    /** 部分环境 pushState 不同步 `location`，以 target 为准驱动信号 */
    setLocationSig({
      pathname: target.pathname,
      search: target.search,
      hash: target.hash,
    });
    notifySubscribers();
    applyScrollAfterNav(prevLoc);
  }

  /** 编程式导航：pushState（异步完成，与 `beforeEach` 对齐） */
  function navigate(to: string): Promise<void> {
    const resolved = resolveFullNavigationTarget(to);
    const gloc = getLocation();
    if (resolved === null && gloc) {
      try {
        gloc.assign(
          new URL(to, gloc.href || "http://local/").href,
        );
      } catch { /* ignore */ }
      return Promise.resolve();
    }
    if (resolved === null) return Promise.resolve();
    return commitNavigation(resolved, false);
  }

  /** 编程式导航：replaceState（异步完成） */
  function replacePath(to: string): Promise<void> {
    const resolved = resolveFullNavigationTarget(to);
    const gloc = getLocation();
    if (resolved === null && gloc) {
      try {
        gloc.replace(
          new URL(to, gloc.href || "http://local/").href,
        );
      } catch { /* ignore */ }
      return Promise.resolve();
    }
    if (resolved === null) return Promise.resolve();
    return commitNavigation(resolved, true);
  }

  function back() {
    globalThis.history?.back?.();
  }

  function forward() {
    globalThis.history?.forward?.();
  }

  function go(delta: number) {
    globalThis.history?.go?.(delta);
  }

  /** `<a href>`：与 navigate 使用同一套解析规则 */
  function resolveHref(to: string): string {
    const r = resolveFullNavigationTarget(to);
    if (r === null) {
      try {
        return new URL(to, getLocation()?.href ?? "http://local/").href;
      } catch {
        return to;
      }
    }
    return r.pathname + r.search + r.hash;
  }

  function onPopState() {
    if (popStateTimer != null) {
      clearTimeout(popStateTimer);
      popStateTimer = null;
    }
    /**
     * happy-dom 等在 popstate 同步阶段读 `location` 往往仍是旧 URL；
     * `setTimeout(0)` 晚于浏览器更新 history/location，再同步信号。
     */
    const run = () => {
      if (routerDisposed) return;
      syncFromBrowser();
      if (scrollMode === "restore") {
        const now = readBrowserLocation();
        const y = scrollMemory.get(scrollKey(now));
        queueMicrotask(() => (globalThis as any).scrollTo?.(0, y ?? 0));
      }
    };
    if (typeof globalThis.setTimeout === "function") {
      popStateTimer = globalThis.setTimeout(() => {
        popStateTimer = null;
        run();
      }, 0);
    } else {
      queueMicrotask(run);
    }
  }

  function onDocumentClickCapture(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    /** 点击链接内文字时 target 可能是文本节点，需归一到元素再 closest */
    let node = e.target as Node | null;
    /** Node.TEXT_NODE === 3 */
    if (node && node.nodeType === 3) {
      node = (node as Text).parentElement;
    }
    const el = node as Element | null;
    if (!el?.closest) return;
    const a = el.closest("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    /** `Link` 组件自行 `navigate`，避免与委托重复触发 */
    if (a.hasAttribute("data-view-link")) return;
    if (a.hasAttribute("data-native")) return;
    if (a.target && a.target !== "" && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    const hrefAttr = a.getAttribute("href");
    if (
      !hrefAttr || hrefAttr.startsWith("mailto:") ||
      hrefAttr.startsWith("tel:")
    ) {
      return;
    }

    const loc = getLocation();
    if (!loc) return;
    /** 部分环境 `location.href` 为空，用 pathname 拼出解析基址 */
    const baseHref = loc.href && loc.href !== "about:blank"
      ? loc.href
      : `http://localhost${loc.pathname || "/"}${loc.search || ""}${
        loc.hash || ""
      }`;

    let url: URL;
    try {
      url = new URL(hrefAttr, baseHref);
    } catch {
      return;
    }

    let sameOrigin = false;
    try {
      sameOrigin =
        new URL(hrefAttr, baseHref).origin === new URL(baseHref).origin;
    } catch {
      return;
    }
    if (!sameOrigin) return;

    if (
      url.pathname === loc.pathname && url.search === loc.search &&
      url.hash && !hrefAttr.startsWith("/") &&
      !hrefAttr.includes("://")
    ) {
      return;
    }

    if (
      url.pathname === loc.pathname && url.search === loc.search && url.hash
    ) {
      const hashOnly = hrefAttr.trim().startsWith("#") &&
        !hrefAttr.includes("?") &&
        hrefAttr.split("#").length <= 2;
      if (hashOnly) return;
    }

    e.preventDefault();
    void commitNavigation(
      {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
      },
      false,
    ).catch(() => {/* 委托路径错误由调用方忽略 */});
  }

  function startIntercept() {
    if (interceptOn || typeof globalThis.document === "undefined") return;
    /**
     * 使用冒泡阶段：happy-dom 对 `click()` 合成事件的捕获路径支持不完整；
     * 真实浏览器在冒泡阶段仍可 `preventDefault` 阻止 `<a>` 默认导航。
     */
    globalThis.document.addEventListener(
      "click",
      onDocumentClickCapture,
      false,
    );
    interceptOn = true;
  }

  function stopIntercept() {
    if (!interceptOn) return;
    globalThis.document?.removeEventListener(
      "click",
      onDocumentClickCapture,
      false,
    );
    interceptOn = false;
  }

  function startPopState() {
    if (popOn) return;
    const t = getPopStateEventTarget();
    if (typeof t.addEventListener !== "function") return;
    t.addEventListener("popstate", onPopState);
    popOn = true;
  }

  function stopPopState() {
    if (!popOn) return;
    getPopStateEventTarget().removeEventListener("popstate", onPopState);
    popOn = false;
  }

  function destroy() {
    routerDisposed = true;
    if (popStateTimer != null) {
      clearTimeout(popStateTimer);
      popStateTimer = null;
    }
    stopIntercept();
    stopPopState();
    subscribers.clear();
    if (routerCore.active === router) routerCore.active = null;
  }

  function subscribe(fn: () => void) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  const router: Router = {
    path: () => locationSig().pathname,
    pathname: () => locationSig().pathname,
    search: () => locationSig().search,
    hash: () => locationSig().hash,
    match: () => activeMatch(),
    resolveHref,
    navigate,
    replace: replacePath,
    back,
    forward,
    go,
    start: () => {
      startPopState();
      if (interceptLinks) startIntercept();
    },
    stop: () => stopIntercept(),
    subscribe,
    destroy,
    render: () => {
      const m = activeMatch();
      if (!m) {
        return () => document.createTextNode("404 Not Found");
      }

      const route = m.route;
      const isFunction = typeof route.component === "function";
      const hasLayouts = route.layouts && route.layouts.length > 0;

      const pageProps = {
        params: m.params,
        query: m.query,
      };

      if (
        !hasLayouts && isFunction && (route.component as any).length === 0
      ) {
        try {
          const result = untrack(() => (route.component as any)());
          if (!(result instanceof Promise)) return result;
        } catch { /* 进入 Resource */ }
      }

      let res = ROUTE_RESOURCE_CACHE.get(route);
      if (!res) {
        res = untrack(() =>
          runWithOwner(null, () => {
            const fetcher = async () => {
              const layoutPromises = (route.layouts || []).map((fn) => fn());
              const componentPromise = isFunction
                ? (route.component as any).length === 0
                  ? (route.component as any)()
                  : Promise.resolve(route.component)
                : Promise.resolve(route.component);
              const [layouts, component] = await Promise.all([
                Promise.all(layoutPromises),
                componentPromise,
              ]);
              return { layouts, component };
            };
            const newRes = createResource(fetcher);
            ROUTE_RESOURCE_CACHE.set(route, newRes);
            return newRes;
          })
        );
      }

      const isLoading = res.loading();
      const data = res();

      if (isLoading && typeof route.loading === "function") {
        return route.loading();
      }
      if (!data) return () => document.createTextNode("");

      const { layouts, component } = data as { layouts: any[]; component: any };
      const getComp = (mod: any) => mod?.default || mod;
      const PageComponent = getComp(component);

      const renderNested = (index: number): any => {
        return untrack(() => {
          if (index >= layouts.length) {
            return typeof PageComponent === "function"
              ? jsx(PageComponent, pageProps)
              : PageComponent;
          }
          const LayoutComponent = getComp(layouts[index]);
          return typeof LayoutComponent === "function"
            ? jsx(LayoutComponent, {
              children: renderNested(index + 1),
              params: m.params,
              query: m.query,
            })
            : renderNested(index + 1);
        });
      };

      return renderNested(0);
    },
  };

  startPopState();
  if (interceptLinks) startIntercept();

  routerCore.active = router;
  lastMatchKey = "";
  notifySubscribers();

  return router;
}

// ———————————————————————————————————————————————————————————————————————————
// Link
// ———————————————————————————————————————————————————————————————————————————

/**
 * 客户端路由链接：`href` 经 `resolveHref` 解析，`click` 默认 `preventDefault` 并 `navigate`/`replace`。
 * @param props 与 `a` 类似，支持 `href`、`replace`、`class`/`className` 等
 * @returns {@link VNode}
 */
export function Link(props: any): VNode {
  const {
    href,
    children,
    class: className,
    className: className2,
    replace: useReplace,
    ...rest
  } = props;
  let fullHref = href;
  try {
    fullHref = href ? useRouter().resolveHref(href) : href;
  } catch {
    /* 无 router 时退回原始 href */
  }
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    if (href) {
      try {
        const r = useRouter();
        void (useReplace ? r.replace(href) : r.navigate(href));
      } catch {
        /* ignore */
      }
    }
  };
  return jsx("a", {
    href: fullHref,
    onClick: handleClick,
    className: className || className2,
    "data-view-link": true,
    ...rest,
    children: children,
  });
}

/**
 * 在 DOM Ready 后把 `router.render()` 挂到指定容器（CSS 选择器或元素）。
 * @param selector 容器选择器或元素节点
 * @param router 已创建的 {@link Router}
 * @returns `void`
 */
export function mountWithRouter(
  selector: string | HTMLElement,
  router: Router,
) {
  const performMount = () => {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;
    if (!container) return;

    mount(() => () => router.render(), container as HTMLElement);
  };

  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", performMount);
  } else {
    performMount();
  }
}
