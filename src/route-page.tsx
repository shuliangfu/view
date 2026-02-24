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
import {
  KEY_HMR_CHUNK_FOR_PATH,
  KEY_HMR_CLEAR_ROUTE_CACHE,
} from "./constants.ts";
import { createEffect, createScopeWithDisposers } from "./effect.ts";
import { getGlobal, setGlobal } from "./globals.ts";
import { getHmrVersionGetter } from "./hmr.ts";
import { jsx as runtimeJsx } from "./jsx-runtime.ts";
import { createResource } from "./resource.ts";
import type {
  LayoutComponentModule,
  RouteMatch,
  RouteMatchWithRouter,
  Router,
} from "./router.ts";
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

/** 懒加载模块可能为 default 或命名导出 RouteLoading */
type LoadingModule = {
  default?: (m?: unknown) => VNode;
  RouteLoading?: (m?: unknown) => VNode;
};

/** Resource getter 返回类型（与 createResource 一致） */
type ResourceGetter = () => {
  data: LoadingModule | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => void;
};

/** 按 path 缓存 resource getter，避免每次渲染新建 createResource 导致死循环 */
const resourceCache = new Map<string, ResourceGetter>();

/** 按 path 缓存 _loading 组件的 resource getter；作用域仅当前目录，子目录不继承 */
const loadingComponentCache = new Map<string, ResourceGetter>();

/**
 * 不再按 path 缓存页面 VNode：缓存会导致页面内 signal 更新时 effect 重跑仍用旧 VNode，
 * 不再执行页面组件，从而无法读到最新 signal（如 Boundary 页的 shouldThrow），点击无反应。
 * 每次 effect 都执行 data.default(match) 以保持页面内响应式与点击生效。
 */

/**
 * 按 path + key 缓存页面内 state（createSignal），供 match.getState(key, initial) 使用。
 * 页面组件内写 createSignal(initial) 会因每次重跑新建 signal 导致点击无反应；
 * 通过 match.getState(key, initial) 取得同 path 下稳定的 [getter, setter]，写组件体内也可生效。
 * path 变化时清空上一 path 的缓存，避免占用内存且不影响其他路由。
 */
const pathStateStore = new Map<
  string,
  Map<string, ReturnType<typeof createSignal>>
>();
let prevPathForState = "";

/** 上一路由 path，用于切换时移除该路由由 esbuild 注入的 dweb-css-* 样式 */
let prevPathForCssCleanup = "";
/** 当前路由切换时已存在的 dweb-css id 集合，用于区分「当前 chunk 新注入」与 main/全局样式，只给前者打 data-view-route-path */
const dwebCssIdsSnapshot = new Set<string>();

function getPageState<T>(
  path: string,
  key: string,
  initialValue: T,
): [() => T, (value: T | ((prev: T) => T)) => void] {
  let keyMap = pathStateStore.get(path);
  if (!keyMap) {
    keyMap = new Map();
    pathStateStore.set(path, keyMap);
  }
  let tuple = keyMap.get(key) as
    | [() => T, (value: T | ((prev: T) => T)) => void]
    | undefined;
  if (!tuple) {
    tuple = createSignal(initialValue) as [
      () => T,
      (value: T | ((prev: T) => T)) => void,
    ];
    keyMap.set(key, tuple);
  }
  return tuple;
}

/**
 * 按 path 的 effect 作用域：resource 内部 effect 登记到此 scope，不随根 effect 重跑被 dispose，
 * 否则 _loading 先加载触发根重跑时会 dispose 掉页面 resource 的 effect，index 加载完成时 generation 已 -1 导致不 setState。
 */
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

/** HMR 无感刷新前由 __HMR_REFRESH__ 置为 true，本模块执行时清空缓存以便拉新 chunk */
if (getGlobal<boolean>(KEY_HMR_CLEAR_ROUTE_CACHE)) {
  for (const scope of pathScopes.values()) scope.runDisposers();
  pathScopes.clear();
  resourceCache.clear();
  loadingComponentCache.clear();
  setGlobal(KEY_HMR_CLEAR_ROUTE_CACHE, false);
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
 * @param props.match - 当前路由匹配结果（含 path、component、metadata 等）
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
  // path 变化时清理上一 path 的缓存与 scope，避免长时间 SPA 导航导致内存持续增长（见 ANALYSIS_REPORT 1.2）
  if (prevPathForState && prevPathForState !== path) {
    const prev = prevPathForState;
    pathStateStore.delete(prev);
    pathScopes.get(prev)?.runDisposers();
    pathScopes.delete(prev);
    resourceCache.delete(prev);
    loadingComponentCache.delete(prev);
  }
  prevPathForState = path;

  // 路由切换时：移除上一路由由 esbuild 内联注入的 style[data-view-route-path]，再快照当前 dweb-css id，避免误删 main 包全局样式
  if (path !== prevPathForCssCleanup) {
    const doc = (globalThis as { document?: Document }).document;
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
    /** 按 path+key 稳定的 state，页面内写 getState(key, initial) 即可在组件体内用「类 useState」且点击生效 */
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

  /** 若有 _loading 且已加载完成则返回其 VNode，否则返回 null（复用两处「未就绪 / minDelay 未到」分支） */
  const tryCustomLoading = (): VNode | null => {
    const loadingGetter = loadingComponentCache.get(path);
    if (!loadingGetter) return null;
    const loadingState = loadingGetter();
    if (loadingState.loading || !loadingState.data) return null;
    const Load = loadingState.data.default ?? loadingState.data.RouteLoading;
    return typeof Load === "function" ? (Load(matchWithRouter) as VNode) : null;
  };
  /** 根据 showLoading 返回默认 loading 区块或过渡占位（复用两处分支，减少重复 JSX） */
  const loadingOrPlaceholder = (show: boolean): VNode => {
    if (show) {
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
  };

  /** HMR 时 version 变化使本组件重跑；若有该 path 的 chunk 待更新则清掉缓存，让下面重新 createResource 并走 loader 里的 override，避免继续用旧 resource 显示旧内容（如「核心 333」） */
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
      const loadingLoader = props.match.loading;
      loadingGetter = createResource(
        () => path + ":loading",
        () => loadingLoader().then((mod) => mod),
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
          const pageMod = (await import(/* @vite-ignore */ overrideUrl)) as {
            default: (m?: unknown) => VNode;
          };
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
              for (let i = layoutMods.length - 1; i >= 0; i--) {
                inner = layoutMods[i].default({ children: inner });
              }
              return inner;
            },
          };
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
            // layouts 顺序为 [根, 子]，应从内到外包裹：先包子再包根，根在最外层
            let inner: VNode = pageMod.default(m ?? matchWithRouter);
            for (let i = layoutMods.length - 1; i >= 0; i--) {
              inner = layoutMods[i].default({ children: inner });
            }
            return inner;
          },
        };
      },
      { scope: pathScope },
    );
    resourceCache.set(path, resourceGetter);
  }

  /**
   * 在组件体内直接读取 resource，使当前渲染（根 effect 或父组件）建立对 resource 的订阅；
   * 这样 resource 更新时由同一作用域重跑，避免用「动态子 getter」导致 Boundary/Suspense 整页刷新或重载。
   */
  const { data, loading, error, refetch } = resourceGetter();
  const pageReady = !error && !loading && data != null;

  // 当前路由就绪后，把「新出现」的 esbuild 注入的 style[data-dweb-css-id] 标记为当前路由，切走时移除
  createEffect(() => {
    const currentPath = path;
    const ready = pageReady;
    const doc = (globalThis as { document?: Document }).document;
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

  /* 页面组件未就绪：若页面 export const loading = false 则不显示任何 loading；否则优先 _loading，再默认转圈。
   * 不包 key 的 wrapper，直接返回单一子节点，由上层 #root 处做整体替换，避免多次点击链接后 #root 下堆积多个 div。 */
  if (!pageReady) {
    if (props.match.skipLoading) {
      return null as unknown as VNode;
    }
    const custom = tryCustomLoading();
    if (custom) return custom;
    return loadingOrPlaceholder(props.showLoading === true);
  }

  /* 页面就绪：直接显示内容，不包 key，保证 #root 下始终只有一个子节点被替换 */
  const content = data.default(matchWithRouter);
  return (
    <div
      className={cls("transitionWrapper")}
      style={sty("transitionWrapper")}
    >
      {content}
    </div>
  ) as VNode;
}
