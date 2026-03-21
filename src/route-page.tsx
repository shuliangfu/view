/**
 * 懒加载路由页组件（编译态）：按 path 缓存 createResource，返回 (parent)=>void。
 * 支持 component 为 () => import(...) 动态导入，加载中/错误/内容三态 UI 内聚在此。
 * 支持页面过渡：静默等待时占位防白屏，内容用 transitionWrapper 包一层；浏览器环境下会自动注入淡入动画样式。
 *
 * @module @dreamer/view/route-page
 * 由 @dreamer/view/router 统一导出，使用方式：import { RoutePage } from "jsr:@dreamer/view/router"
 */

import {
  KEY_HMR_CHUNK_FOR_PATH,
  KEY_HMR_CLEAR_ROUTE_CACHE,
} from "./constants.ts";
import { createEffect, createScopeWithDisposers } from "./effect.ts";
import { getGlobal, setGlobal } from "./globals.ts";
import { getHmrVersionGetter } from "./hmr.ts";
import { createResource } from "./resource.ts";
import type {
  LayoutComponentModule,
  MountFn,
  RouteMatch,
  RouteMatchWithRouter,
  Router,
} from "./router.ts";
import { runDirectiveUnmountOnChildren } from "./dom/unmount.ts";
import { createSignal } from "./signal.ts";
import type { SignalRef } from "./signal.ts";

/** 懒加载模块：default 返回挂载函数，供 RoutePage 挂载到容器 */
type LoadingModule = {
  default?: (m?: unknown) => MountFn;
  RouteLoading?: (m?: unknown) => MountFn;
};

/** Resource getter 返回类型（与 createResource 一致） */
type ResourceGetter = () => {
  data: LoadingModule | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
};

const resourceCache = new Map<string, ResourceGetter>();
const loadingComponentCache = new Map<string, ResourceGetter>();

const pathStateStore = new Map<
  string,
  Map<string, import("./signal.ts").SignalRef<unknown>>
>();
let prevPathForState = "";

let prevPathForCssCleanup = "";
const dwebCssIdsSnapshot = new Set<string>();

function getPageState<T>(
  path: string,
  key: string,
  initialValue: T,
): SignalRef<T> {
  let keyMap = pathStateStore.get(path);
  if (!keyMap) {
    keyMap = new Map();
    pathStateStore.set(path, keyMap);
  }
  let box = keyMap.get(key) as SignalRef<T> | undefined;
  if (!box) {
    box = createSignal(initialValue);
    keyMap.set(key, box as SignalRef<unknown>);
  }
  return box;
}

const pathScopes = new Map<
  string,
  ReturnType<typeof createScopeWithDisposers>
>();

function getScopeForPath(
  path: string,
): ReturnType<typeof createScopeWithDisposers> {
  let scope = pathScopes.get(path);
  if (!scope) {
    scope = createScopeWithDisposers();
    pathScopes.set(path, scope);
  }
  return scope;
}

if (getGlobal<boolean>(KEY_HMR_CLEAR_ROUTE_CACHE)) {
  for (const scope of pathScopes.values()) scope.runDisposers();
  pathScopes.clear();
  resourceCache.clear();
  loadingComponentCache.clear();
  setGlobal(KEY_HMR_CLEAR_ROUTE_CACHE, false);
}

export type RoutePageStyle = Record<string, string>;

export interface RoutePageClasses {
  errorSection?: string;
  errorTitle?: string;
  errorMessage?: string;
  retryButton?: string;
  loadingSection?: string;
  loadingSpinner?: string;
  loadingText?: string;
  transitionPlaceholder?: string;
  transitionWrapper?: string;
}

export interface RoutePageStyles {
  errorSection?: RoutePageStyle;
  errorTitle?: RoutePageStyle;
  errorMessage?: RoutePageStyle;
  retryButton?: RoutePageStyle;
  loadingSection?: RoutePageStyle;
  loadingSpinner?: RoutePageStyle;
  loadingText?: RoutePageStyle;
  transitionPlaceholder?: RoutePageStyle;
  transitionWrapper?: RoutePageStyle;
}

const DEFAULT_CLASSES: Required<RoutePageClasses> = {
  errorSection:
    "rounded-2xl border border-red-200/80 bg-red-50/90 p-12 shadow-lg backdrop-blur dark:border-red-800/80 dark:bg-red-950/90 sm:p-16 flex flex-col items-center justify-center min-h-[280px]",
  errorTitle: "text-sm font-medium text-red-700 dark:text-red-300",
  errorMessage:
    "mt-2 text-xs text-red-600 dark:text-red-400 font-mono break-all max-w-full",
  retryButton:
    "mt-4 px-4 py-2 rounded-lg bg-red-200/80 dark:bg-red-800/80 text-red-800 dark:text-red-200 text-sm font-medium hover:opacity-90",
  loadingSection:
    "rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-16 flex flex-col items-center justify-center min-h-[280px]",
  loadingSpinner:
    "h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400 dark:border-t-transparent",
  loadingText:
    "mt-4 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400",
  transitionPlaceholder: "min-h-[50vh] bg-inherit",
  transitionWrapper: "view-route-page-enter",
};

export interface RoutePageLabels {
  errorTitle?: string;
  retryText?: string;
  loadingText?: string;
}

const DEFAULT_ERROR_TITLE = "Failed to load page";
const DEFAULT_RETRY_TEXT = "Retry";
const DEFAULT_LOADING_TEXT = "Loading…";

function getDoc(): Document {
  return (globalThis as { document: Document }).document;
}

/** 挂载错误态 UI 到 parent */
function mountErrorSection(
  parent: Node,
  opts: {
    errorTitle: string;
    message: string;
    retryText: string;
    refetch: () => void;
    cls: (k: keyof RoutePageClasses) => string;
    sty: (k: keyof RoutePageStyles) => RoutePageStyle | undefined;
  },
): void {
  const doc = getDoc();
  const section = doc.createElement("section");
  section.className = opts.cls("errorSection");
  const s = opts.sty("errorSection");
  if (s) Object.assign(section.style, s);

  const pTitle = doc.createElement("p");
  pTitle.className = opts.cls("errorTitle");
  const st = opts.sty("errorTitle");
  if (st) Object.assign(pTitle.style, st);
  pTitle.textContent = opts.errorTitle;
  section.appendChild(pTitle);

  const pMsg = doc.createElement("p");
  pMsg.className = opts.cls("errorMessage");
  const sm = opts.sty("errorMessage");
  if (sm) Object.assign(pMsg.style, sm);
  pMsg.textContent = opts.message;
  section.appendChild(pMsg);

  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = opts.cls("retryButton");
  const sb = opts.sty("retryButton");
  if (sb) Object.assign(btn.style, sb);
  btn.textContent = opts.retryText;
  btn.addEventListener("click", () => opts.refetch());
  section.appendChild(btn);

  parent.appendChild(section);
}

/** 挂载加载态（转圈+文案）到 parent */
function mountLoadingSection(
  parent: Node,
  opts: {
    loadingText: string;
    cls: (k: keyof RoutePageClasses) => string;
    sty: (k: keyof RoutePageStyles) => RoutePageStyle | undefined;
  },
): void {
  const doc = getDoc();
  const section = doc.createElement("section");
  section.className = opts.cls("loadingSection");
  const s = opts.sty("loadingSection");
  if (s) Object.assign(section.style, s);

  const spinner = doc.createElement("div");
  spinner.className = opts.cls("loadingSpinner");
  spinner.setAttribute("aria-hidden", "true");
  const sp = opts.sty("loadingSpinner");
  if (sp) Object.assign(spinner.style, sp);
  section.appendChild(spinner);

  const p = doc.createElement("p");
  p.className = opts.cls("loadingText");
  const st = opts.sty("loadingText");
  if (st) Object.assign(p.style, st);
  p.textContent = opts.loadingText;
  section.appendChild(p);

  parent.appendChild(section);
}

/** 挂载过渡占位（静默等待）到 parent */
function mountTransitionPlaceholder(
  parent: Node,
  opts: {
    cls: (k: keyof RoutePageClasses) => string;
    sty: (k: keyof RoutePageStyles) => RoutePageStyle | undefined;
  },
): void {
  const doc = getDoc();
  const div = doc.createElement("div");
  div.className = opts.cls("transitionPlaceholder");
  div.setAttribute("aria-hidden", "true");
  const s = opts.sty("transitionPlaceholder");
  if (s) Object.assign(div.style, s);
  parent.appendChild(div);
}

/** 挂载过渡包装 + 内容到 parent；contentMount 为页面或 layout 链的挂载函数。
 * 先 appendChild(div) 再 contentMount(div)，保证 contentMount 内执行 ref(el) 时节点已在文档中（isConnected 为 true）。
 */
function mountTransitionWrapper(
  parent: Node,
  contentMount: MountFn,
  opts: {
    cls: (k: keyof RoutePageClasses) => string;
    sty: (k: keyof RoutePageStyles) => RoutePageStyle | undefined;
  },
): void {
  const doc = getDoc();
  const div = doc.createElement("div");
  div.className = opts.cls("transitionWrapper");
  const s = opts.sty("transitionWrapper");
  if (s) Object.assign(div.style, s);
  parent.appendChild(div);
  contentMount(div);
}

/**
 * 编译态 RoutePage：返回 (parent)=>void，在 effect 中根据 resource 状态挂载 error/loading/content。
 */
export function RoutePage(props: {
  match: RouteMatch;
  router: Router;
  showLoading?: boolean;
  labels?: RoutePageLabels;
  classes?: RoutePageClasses;
  styles?: RoutePageStyles;
}): MountFn {
  const path = props.match.path;

  if (prevPathForState && prevPathForState !== path) {
    const prev = prevPathForState;
    pathStateStore.delete(prev);
    pathScopes.get(prev)?.runDisposers();
    pathScopes.delete(prev);
    resourceCache.delete(prev);
    loadingComponentCache.delete(prev);
  }
  prevPathForState = path;

  if (path !== prevPathForCssCleanup) {
    const doc = getDoc();
    if (doc?.head) {
      doc
        .querySelectorAll(
          `style[data-view-route-path="${prevPathForCssCleanup}"]`,
        )
        .forEach((el) => el.remove());
      dwebCssIdsSnapshot.clear();
      doc.querySelectorAll("style[data-dweb-css-id]").forEach((el) => {
        const id = (el as HTMLStyleElement).id ||
          el.getAttribute("data-dweb-css-id") ||
          "";
        if (id) dwebCssIdsSnapshot.add(id);
      });
    }
    prevPathForCssCleanup = path;
  }

  const matchWithRouter: RouteMatchWithRouter = {
    ...props.match,
    router: props.router,
    getState: <T,>(key: string, initialValue: T) =>
      getPageState(path, key, initialValue),
  };

  const labels = props.labels ?? {};
  const errorTitle = labels.errorTitle ?? DEFAULT_ERROR_TITLE;
  const retryText = labels.retryText ?? DEFAULT_RETRY_TEXT;
  const loadingText = labels.loadingText ?? DEFAULT_LOADING_TEXT;
  const classes = props.classes ?? {};
  const styles = props.styles ?? {};
  const cls = (key: keyof RoutePageClasses) =>
    classes[key] ?? DEFAULT_CLASSES[key];
  const sty = (key: keyof RoutePageStyles) => styles[key];

  /** 若有 _loading 且已加载完成则返回其 MountFn，否则返回 null */
  const tryCustomLoading = (): MountFn | null => {
    const loadingGetter = loadingComponentCache.get(path);
    if (!loadingGetter) return null;
    const loadingState = loadingGetter();
    if (loadingState.loading || !loadingState.data) return null;
    const Load = loadingState.data.default ?? loadingState.data.RouteLoading;
    return typeof Load === "function"
      ? (Load(matchWithRouter) as MountFn)
      : null;
  };

  getHmrVersionGetter()();
  const chunkMap = getGlobal<Record<string, string>>(KEY_HMR_CHUNK_FOR_PATH);
  if (chunkMap?.[path]) {
    pathScopes.get(path)?.runDisposers();
    pathScopes.delete(path);
    resourceCache.delete(path);
    loadingComponentCache.delete(path);
  }

  const pathScope = getScopeForPath(path);

  if (props.match.loading) {
    let loadingGetter = loadingComponentCache.get(path);
    if (!loadingGetter) {
      const loadingLoader = props.match.loading!;
      loadingGetter = createResource(
        () => path + ":loading",
        () => loadingLoader().then((mod) => mod as LoadingModule),
        { scope: pathScope },
      );
      loadingComponentCache.set(path, loadingGetter);
    }
  }

  let resourceGetter = resourceCache.get(path);
  if (!resourceGetter) {
    const match = props.match;
    resourceGetter = createResource(
      () => path,
      async (_path) => {
        const chunkMap = getGlobal<Record<string, string>>(
          KEY_HMR_CHUNK_FOR_PATH,
        );
        const overrideUrl = chunkMap?.[path];
        if (overrideUrl && chunkMap) {
          delete chunkMap[path];
          const pageMod = (await import(
            /* @vite-ignore */ overrideUrl
          )) as { default: (m?: unknown) => MountFn };
          if (!match.layouts?.length) {
            return {
              default: (m?: unknown) => pageMod.default(m ?? matchWithRouter),
            };
          }
          const layoutMods = await Promise.all(
            match.layouts.map((loader) => loader()),
          ) as LayoutComponentModule[];
          let innerMount: MountFn = (p) => pageMod.default(matchWithRouter)(p);
          for (let i = layoutMods.length - 1; i >= 0; i--) {
            const layout = layoutMods[i];
            const prev = innerMount;
            innerMount = (p) => layout.default({ children: prev })(p);
          }
          return { default: () => innerMount };
        }
        const result = match.component(matchWithRouter) as unknown;
        const pageMod =
          result && typeof (result as Promise<unknown>).then === "function"
            ? (await result as { default: (m?: unknown) => MountFn })
            : {
              default: () => (result as MountFn),
            };
        const pageMountFn = typeof pageMod.default === "function"
          ? pageMod.default(matchWithRouter)
          : null;
        if (typeof pageMountFn !== "function") {
          throw new Error(
            `[RoutePage] page module default export did not return a mount function after call (expected (parent)=>void), path: ${path}. Ensure this .tsx was compiled with compileSource.`,
          );
        }
        if (!match.layouts?.length) {
          return { default: () => pageMountFn };
        }
        const layoutMods = await Promise.all(
          match.layouts.map((loader) => loader()),
        ) as LayoutComponentModule[];
        let innerMount: MountFn = (p) => pageMountFn(p);
        for (let i = layoutMods.length - 1; i >= 0; i--) {
          const layout = layoutMods[i];
          const prev = innerMount;
          innerMount = (p) => layout.default({ children: prev })(p);
        }
        return { default: () => innerMount };
      },
      { scope: pathScope },
    );
    resourceCache.set(path, resourceGetter);
  }

  const { data, loading, error, refetch } = resourceGetter();
  const pageReady = !error && !loading && data != null;

  createEffect(() => {
    const currentPath = path;
    const ready = pageReady;
    const doc = getDoc();
    if (!doc?.head || !ready) return;
    doc.querySelectorAll("style[data-dweb-css-id]").forEach((el) => {
      const id = (el as HTMLStyleElement).id ||
        el.getAttribute("data-dweb-css-id") ||
        "";
      if (id && !dwebCssIdsSnapshot.has(id)) {
        dwebCssIdsSnapshot.add(id);
        el.setAttribute("data-view-route-path", currentPath);
      }
    });
  });

  /** 返回挂载函数：挂到 parent 后，在 effect 里根据状态替换为 error/loading/content */
  const mount = (parent: Node): void => {
    const doc = getDoc();
    const container = doc.createElement("div");
    parent.appendChild(container);

    createEffect(() => {
      const { data: d, loading: ld, error: err } = resourceGetter();
      runDirectiveUnmountOnChildren(container);
      if (container.replaceChildren) container.replaceChildren();

      if (err) {
        const message = err instanceof Error ? err.message : String(err);
        mountErrorSection(container, {
          errorTitle,
          message,
          retryText,
          refetch,
          cls,
          sty,
        });
        return;
      }

      if (!d || ld) {
        if (props.match.skipLoading) return;
        const custom = tryCustomLoading();
        if (custom) {
          custom(container);
          return;
        }
        if (props.showLoading === true) {
          mountLoadingSection(container, { loadingText, cls, sty });
        } else {
          mountTransitionPlaceholder(container, { cls, sty });
        }
        return;
      }

      const defaultMount = d.default;
      if (!defaultMount || typeof defaultMount !== "function") return;
      const contentMount = defaultMount(matchWithRouter);
      if (typeof contentMount !== "function") {
        const msg =
          "[RoutePage] page default(match) did not return a mount function; it may not have been compiled with compileSource.";
        mountErrorSection(container, {
          errorTitle,
          message: msg,
          retryText,
          refetch,
          cls,
          sty,
        });
        return;
      }
      mountTransitionWrapper(container, contentMount, { cls, sty });
    });
  };

  return mount;
}
