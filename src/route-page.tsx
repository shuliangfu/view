// @ts-nocheck — 本文件使用 classic JSX，不依赖全局 JSX 类型；jsx.d.ts 已从发布排除，避免 JSR「modifying global types」报错。
/**
 * 懒加载路由页组件：按 path 缓存 createResource，避免每次渲染新建导致死循环；
 * 支持 component 为 () => import(...) 动态导入，加载中/错误/内容三态 UI 内聚在此。
 * 支持页面过渡：静默等待时占位防白屏，内容用 transitionWrapper 包一层；浏览器环境下会自动注入淡入动画样式。
 *
 * @module @dreamer/view/route-page
 * 由 @dreamer/view/router 统一导出，使用方式：import { RoutePage } from "jsr:@dreamer/view/router"
 *
 * 使用 classic JSX + 适配器，避免 JSR 发布时对 jsxImportSource/jsx-runtime 的错误解析（mod.ts/jsx-runtime 等）。
 */
/** @jsx jsx */
import { createEffect, untrack } from "./effect.ts";
import { getHmrVersionGetter } from "./hmr.ts";
import { jsx as runtimeJsx } from "./jsx-runtime.ts";
import { createResource } from "./resource.ts";
import type { LayoutComponentModule, RouteMatch, Router } from "./router.ts";
import { createSignal } from "./signal.ts";
import type { VNode } from "./types.ts";

/** classic 转换 (type, props, ...children) 适配为 view 运行时 jsx(type, propsWithChildren, key) */
function jsx(
  type: import("./types.ts").VNode["type"],
  props: Record<string, unknown> | null,
  ...children: unknown[]
): import("./types.ts").VNode {
  const merged = props && typeof props === "object" && !Array.isArray(props)
    ? { ...props, children }
    : { children: props != null ? [props, ...children] : children };
  return runtimeJsx(type, merged, null);
}

/** Resource getter 返回类型（与 createResource 一致） */
type ResourceGetter = () => {
  data: { default: (m?: unknown) => VNode } | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
};

/** 按 path 缓存 resource getter，避免每次渲染新建 createResource 导致死循环 */
const resourceCache = new Map<string, ResourceGetter>();

/** 按 path 缓存 _loading 组件的 resource getter；作用域仅当前目录，子目录不继承 */
const loadingComponentCache = new Map<string, ResourceGetter>();

/** 有 _loading 时的最短展示时间（毫秒）：页面未加载完继续显示 loading；页面很快加载完也至少展示此时长再进入内容 */
const MIN_LOADING_DELAY_MS = 10;

/** 已启动过「最短 MIN_LOADING_DELAY_MS」计时器的 path，避免重复启动导致一直 loading */
const minDelayTimerStartedPaths = new Set<string>();

/** 上一帧的 path，用于仅在 path 变化时重置 minDelayElapsed，避免根 effect 重跑时反复置 false */
let prevPathForMinDelay = "";

/** 按 path 缓存 minDelayElapsed 的 [getter, setter]，保证根 effect 重跑时仍用同一 signal，定时器回调更新的是当前渲染所读的 signal */
const minDelaySignalsByPath = new Map<
  string,
  [() => boolean, (value: boolean) => void]
>();

function getOrCreateMinDelaySignal(
  path: string,
): [() => boolean, (value: boolean) => void] {
  let tuple = minDelaySignalsByPath.get(path);
  if (!tuple) {
    const [get, set] = createSignal(false);
    tuple = [get, set];
    minDelaySignalsByPath.set(path, tuple);
  }
  return tuple;
}

/** HMR 无感刷新前由 __HMR_REFRESH__ 置为 true，本模块执行时清空缓存以便拉新 chunk */
if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as {
    __VIEW_HMR_CLEAR_ROUTE_CACHE__?: boolean;
  };
  if (g.__VIEW_HMR_CLEAR_ROUTE_CACHE__) {
    resourceCache.clear();
    loadingComponentCache.clear();
    g.__VIEW_HMR_CLEAR_ROUTE_CACHE__ = false;
  }
}

/** 是否已注入页面过渡样式（仅浏览器环境注入一次） */
let routePageTransitionStyleInjected = false;

/**
 * 在浏览器下注入页面淡入动画样式，时长约 0.35s，使切换有明显淡入感且减少闪白
 */
function ensureRoutePageTransitionStyle(): void {
  if (routePageTransitionStyleInjected) return;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.head) return;
  routePageTransitionStyleInjected = true;
  const style = doc.createElement("style");
  style.setAttribute("data-view-route-page", "");
  style.textContent = `
@keyframes view-route-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.view-route-page-enter {
  animation: view-route-fade-in 0.35s ease-out both;
}
`;
  doc.head.appendChild(style);
}

/** 内联样式类型（与 DOM style 一致） */
export type RoutePageStyle = Record<string, string>;

/** 错误态 / 加载态 / 过渡各元素的 class，未传时使用默认 Tailwind 类 */
export interface RoutePageClasses {
  /** 错误态容器 */
  errorSection?: string;
  /** 错误态标题 */
  errorTitle?: string;
  /** 错误态错误信息 */
  errorMessage?: string;
  /** 重试按钮 */
  retryButton?: string;
  /** 加载态容器 */
  loadingSection?: string;
  /** 加载态转圈图标 */
  loadingSpinner?: string;
  /** 加载态提示文字 */
  loadingText?: string;
  /** 静默等待时的占位容器（避免白屏），需继承背景如 bg-inherit */
  transitionPlaceholder?: string;
  /** 页面内容外层过渡容器，配合 CSS 动画实现淡入，见模块注释 */
  transitionWrapper?: string;
}

/** 错误态 / 加载态 / 过渡各元素的内联 style，传入则使用，不传则不应用内联样式 */
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

/** 默认 class（Tailwind），使用方未传 classes 时使用 */
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

/** RoutePage 可选文案，未传时使用英文默认值 */
export interface RoutePageLabels {
  /** 加载失败时标题，默认 "Failed to load page" */
  errorTitle?: string;
  /** 重试按钮文案，默认 "Retry" */
  retryText?: string;
  /** 加载中提示文案，默认 "Loading…" */
  loadingText?: string;
}

const DEFAULT_ERROR_TITLE = "Failed to load page";
const DEFAULT_RETRY_TEXT = "Retry";
const DEFAULT_LOADING_TEXT = "Loading…";

/**
 * 根据当前 match 渲染懒加载路由页：component 为 Promise（动态 import）时用 createResource 加载并取 default 渲染。
 * 同一 path 复用缓存的 resource；加载中显示转圈，失败显示错误+重试，成功渲染 data.default(matchWithRouter)。
 * 文案可通过 labels 传入自定义，默认英文。
 *
 * @param props.match - 当前路由匹配结果（含 path、component、meta 等）
 * @param props.router - 路由器实例，与 match 一并传入子页面
 * @param props.showLoading - 可选，为 true 时加载中显示转圈/文案，为 false 时静默等待不渲染 loading UI，默认 true
 * @param props.labels - 可选，errorTitle / retryText / loadingText 自定义文案
 * @param props.classes - 可选，各元素 class，未传时使用默认 Tailwind 类
 * @param props.styles - 可选，各元素内联 style，传入则应用
 * @returns 加载中/错误/页面内容的 VNode
 */
export function RoutePage(props: {
  match: RouteMatch;
  router: Router;
  /** 为 true 时加载中显示 loading UI，为 false 时静默等待（不显示转圈），默认 true */
  showLoading?: boolean;
  labels?: RoutePageLabels;
  classes?: RoutePageClasses;
  styles?: RoutePageStyles;
}): VNode {
  const path = props.match.path;
  const pathRef = { current: path };
  pathRef.current = path;
  const matchWithRouter = { ...props.match, router: props.router };
  const labels = props.labels ?? {};
  const [minDelayElapsed, setMinDelayElapsed] = getOrCreateMinDelaySignal(path);
  createEffect(() => {
    path;
    if (prevPathForMinDelay !== path) {
      minDelayTimerStartedPaths.delete(prevPathForMinDelay);
      prevPathForMinDelay = path;
      setMinDelayElapsed(false);
    }
  });
  createEffect(() => {
    const hasLoading = untrack(() => props.match.loading);
    const p = untrack(() => path);
    if (!hasLoading || minDelayTimerStartedPaths.has(p)) return;
    minDelayTimerStartedPaths.add(p);
    const pathWhenStarted = p;
    const setElapsed = getOrCreateMinDelaySignal(pathWhenStarted)[1];
    const t = setTimeout(() => {
      if (pathRef.current === pathWhenStarted) setElapsed(true);
    }, MIN_LOADING_DELAY_MS);
    return () => {
      clearTimeout(t);
      minDelayTimerStartedPaths.delete(pathWhenStarted);
    };
  });
  const errorTitle = labels.errorTitle ?? DEFAULT_ERROR_TITLE;
  const retryText = labels.retryText ?? DEFAULT_RETRY_TEXT;
  const loadingText = labels.loadingText ?? DEFAULT_LOADING_TEXT;
  const classes = props.classes ?? {};
  const styles = props.styles ?? {};
  const cls = (key: keyof RoutePageClasses) =>
    classes[key] ?? DEFAULT_CLASSES[key];
  const sty = (key: keyof RoutePageStyles) => styles[key];

  /** HMR 时 version 变化使本组件重跑；若有该 path 的 chunk 待更新则清掉缓存，让下面重新 createResource 并走 loader 里的 override，避免继续用旧 resource 显示旧内容（如「核心 333」） */
  getHmrVersionGetter()();
  if (typeof globalThis !== "undefined") {
    const g = globalThis as unknown as {
      __VIEW_HMR_CHUNK_FOR_PATH__?: Record<string, string>;
    };
    if (g.__VIEW_HMR_CHUNK_FOR_PATH__?.[path]) {
      resourceCache.delete(path);
      loadingComponentCache.delete(path);
    }
  }

  if (props.match.loading) {
    let loadingGetter = loadingComponentCache.get(path);
    if (!loadingGetter) {
      const loadingLoader = props.match.loading;
      loadingGetter = createResource(
        () => path + ":loading",
        () => loadingLoader().then((mod) => mod),
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
        const g = typeof globalThis !== "undefined"
          ? globalThis as unknown as {
            __VIEW_HMR_CHUNK_FOR_PATH__?: Record<string, string>;
          }
          : null;
        const overrideUrl = g?.__VIEW_HMR_CHUNK_FOR_PATH__?.[path];
        if (overrideUrl) {
          delete g.__VIEW_HMR_CHUNK_FOR_PATH__![path];
          return import(/* @vite-ignore */ overrideUrl) as Promise<
            { default: (m?: unknown) => VNode }
          >;
        }
        const result = match.component(matchWithRouter) as unknown;
        const pageMod =
          result && typeof (result as Promise<unknown>).then === "function"
            ? (await result as { default: (m?: unknown) => VNode })
            : { default: () => result as VNode };
        if (!match.layouts?.length) {
          return {
            default: (m?: unknown) => pageMod.default(m ?? matchWithRouter),
          };
        }
        const layoutMods = await Promise.all(
          match.layouts.map((loader) => loader()),
        ) as LayoutComponentModule[];
        return {
          default: (m?: unknown) => {
            let inner: VNode = pageMod.default(m ?? matchWithRouter);
            for (const mod of layoutMods) {
              inner = mod.default({ children: inner });
            }
            return inner;
          },
        };
      },
    );
    resourceCache.set(path, resourceGetter);
  }

  const { data, loading, error, refetch } = resourceGetter();

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <section className={cls("errorSection")} style={sty("errorSection")}>
        <p className={cls("errorTitle")} style={sty("errorTitle")}>
          {errorTitle}
        </p>
        <p className={cls("errorMessage")} style={sty("errorMessage")}>
          {message}
        </p>
        <button
          type="button"
          className={cls("retryButton")}
          style={sty("retryButton")}
          onClick={() => refetch()}
        >
          {retryText}
        </button>
      </section>
    );
  }

  if (loading || !data) {
    const loadingLoader = props.match.loading;
    if (loadingLoader) {
      let loadingGetter = loadingComponentCache.get(path);
      if (!loadingGetter) {
        loadingGetter = createResource(
          () => path + ":loading",
          () => loadingLoader().then((mod) => mod),
        );
        loadingComponentCache.set(path, loadingGetter);
      }
      const loadingState = loadingGetter();
      if (!loadingState.loading && loadingState.data) {
        const LoadingComponent = loadingState.data.default;
        return LoadingComponent(matchWithRouter) as VNode;
      }
    }
    if (props.showLoading === true) {
      return (
        <section
          className={cls("loadingSection")}
          style={sty("loadingSection")}
        >
          <div
            className={cls("loadingSpinner")}
            style={sty("loadingSpinner")}
            aria-hidden="true"
          />
          <p className={cls("loadingText")} style={sty("loadingText")}>
            {loadingText}
          </p>
        </section>
      );
    }
    ensureRoutePageTransitionStyle();
    return (
      <div
        className={cls("transitionPlaceholder")}
        style={sty("transitionPlaceholder")}
        aria-hidden="true"
      />
    ) as VNode;
  }

  if (data && props.match.loading && !minDelayElapsed()) {
    const loadingGetter = loadingComponentCache.get(path);
    if (loadingGetter) {
      const loadingState = loadingGetter();
      if (!loadingState.loading && loadingState.data) {
        const LoadingComponent = loadingState.data.default;
        return LoadingComponent(matchWithRouter) as VNode;
      }
    }
    if (props.showLoading === true) {
      return (
        <section
          className={cls("loadingSection")}
          style={sty("loadingSection")}
        >
          <div
            className={cls("loadingSpinner")}
            style={sty("loadingSpinner")}
            aria-hidden="true"
          />
          <p className={cls("loadingText")} style={sty("loadingText")}>
            {loadingText}
          </p>
        </section>
      );
    }
    return (
      <div
        className={cls("transitionPlaceholder")}
        style={sty("transitionPlaceholder")}
        aria-hidden="true"
      />
    ) as VNode;
  }

  ensureRoutePageTransitionStyle();
  const content = data.default(matchWithRouter);
  return (
    <div className={cls("transitionWrapper")} style={sty("transitionWrapper")}>
      {content}
    </div>
  ) as VNode;
}
