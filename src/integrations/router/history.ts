/**
 * @module integrations/router/history
 * @description History-backed {@link createRouter}: popstate, link intercept,
 * navigate/replace, render, SSR (`url` / `ssr: true`) without browser listeners.
 */

import { createSignal, untrack } from "../../reactivity/signal.ts";
import { createMemo } from "../../reactivity/memo.ts";
import { runWithOwner } from "../../reactivity/owner.ts";
import { getInternal } from "../../reactivity/master.ts";
import { invalidateViewLazyModules } from "../../runtime/component.ts";
import { isSsrDomScopeActive } from "../../runtime/ssr-scope.ts";
import { jsx } from "../../jsx-runtime.ts";
import { createResource } from "../resource.ts";
import { applyMetaToHead } from "../meta.ts";
import type {
  CreateRouterOptions,
  RouteConfig,
  RouteLocation,
  RouteMatch,
  Router,
} from "./types.ts";
import {
  compileRouteList,
  findCompiledMatch,
  joinBasePath,
  normalizeBasePath,
  normalizeInternalPath,
  parseRouterUrl,
  pathToParts,
  searchToRecord,
  stripBasePath,
} from "./match.ts";

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
  const beforeEach = opts.beforeEach;
  /** 与 v1.3.9 一致：拼接到 metadata.title 之后 */
  const documentTitleSuffix = opts.documentTitleSuffix ?? "";
  const compiled = compileRouteList(opts.routes, opts.notFound);

  /**
   * SSR / 无浏览器绑定：不注册 popstate 与 a 委托。
   * - 显式 `ssr: true`
   * - 处于 `renderToString` 的 SSR DOM 作用域
   * - 或 `VIEW_SSR === true`
   */
  const ssrMode = opts.ssr === true ||
    isSsrDomScopeActive() ||
    (globalThis as { VIEW_SSR?: boolean }).VIEW_SSR === true;
  const interceptLinks = !ssrMode && opts.interceptLinks !== false;

  const scrollMemory = new Map<string, number>();
  const subscribers = new Set<() => void>();
  /** 当前路由世代 AbortController；成功切页时 abort 并换新（Resource 外层 signal） */
  let routeAbortController = new AbortController();
  const rotateRouteAbort = () => {
    try {
      routeAbortController.abort();
    } catch { /* ignore */ }
    routeAbortController = new AbortController();
  };

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

  const initialLocation = opts.url != null
    ? parseRouterUrl(opts.url)
    : readBrowserLocation();

  const [locationSig, setLocationSig] = createSignal(initialLocation);

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
    const next = readBrowserLocation();
    const cur = locationSig();
    const changed = cur.pathname !== next.pathname ||
      cur.search !== next.search ||
      cur.hash !== next.hash;
    if (changed) rotateRouteAbort();
    setLocationSig(next);
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

    // 离开当前页：abort 上一世代 in-flight Resource（持有旧 signal 的 createResource）
    rotateRouteAbort();

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
    try {
      routeAbortController.abort();
    } catch { /* ignore */ }
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
    routeAbortSignal: () => routeAbortController.signal,
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

      /**
       * 同步页面（含需要 params 的组件）：直接调用并传入 pageProps。
       * 旧逻辑仅对 `length === 0` 同步调用，导致 `User(props)` 在 SSR 落到 Resource
       * 异步路径、首屏 HTML 为空。layout / lazy 仍走下方 createResource。
       */
      if (!hasLayouts && isFunction) {
        try {
          const result = untrack(() =>
            (route.component as (...args: any[]) => any)(pageProps)
          );
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

  // SSR：不挂浏览器监听；客户端 `router.start()` 可在 hydrate 后显式开启
  if (!ssrMode) {
    startPopState();
    if (interceptLinks) startIntercept();
  }

  routerCore.active = router;
  lastMatchKey = "";
  notifySubscribers();

  return router;
}
