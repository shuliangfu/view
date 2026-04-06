/**
 * 首页视图：Hero（渐变+层次）+ 功能模块卡片网格
 * 支持深色模式 (Dark Mode)。
 */

import { createEffect, Link } from "@dreamer/view";
import "../../assets/index.css";

export const metadata = {
  title: "首页",
  description: "Dreamer View 极致性能的响应式模板引擎示例",
};

/** 首页模块图标：每个模块一个简洁 SVG，用 currentColor 继承文字色 */
const ModuleIcons: Record<string, () => any> = {
  core: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  store: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  ),
  boundary: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  controlFlow: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
      />
    </svg>
  ),
  resource: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  ),
  context: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
  router: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  ),
  /** 表单 */
  form: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  /** Portal */
  portal: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12v9m0 0l-3-3m3 3l3-3M12 3h.01M8 3h.01M16 3h.01"
      />
    </svg>
  ),
  /** SSR / 运行时 */
  runtime: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  ),
  /** 过渡 / 异步切换 */
  transition: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  ),
  /** createSelector 等 */
  perf: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  gallery: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  /** 布局链（与 context 图标区分：层叠矩形） */
  layout: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 8l8-4 8 4-8 4-8-4zm0 8l8 4 8-4m-8-4v8"
      />
    </svg>
  ),
};

/**
 * 首页模块卡片配色：`lg:grid-cols-3` 下任意上下左右相邻卡片的强调色均不同（含按钮与左边框）。
 * 调整顺序或配色时请按网格坐标检查邻居。
 */
const HOME_MODULES = [
  {
    title: "核心响应式",
    desc: "createSignal, createEffect, createMemo, onCleanup",
    href: "/signal",
    iconKey: "core",
    accent: "border-l-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10",
    accentText: "text-indigo-600 dark:text-indigo-400",
    btnClass:
      "bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400",
  },
  {
    title: "状态库 Store",
    desc: "createStore 支持深层嵌套与代理，支持 persist 持久化",
    href: "/store",
    iconKey: "store",
    accent: "border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
    accentText: "text-emerald-600 dark:text-emerald-400",
    btnClass:
      "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400",
  },
  {
    title: "控制流组件",
    desc: "For, Index, Show, Switch, Match, Dynamic",
    href: "/control-flow",
    iconKey: "controlFlow",
    accent: "border-l-purple-500 bg-purple-500/5 dark:bg-purple-500/10",
    accentText: "text-purple-600 dark:text-purple-400",
    btnClass:
      "bg-purple-600 hover:bg-purple-500 dark:bg-purple-500 dark:hover:bg-purple-400",
  },
  {
    title: "Boundary",
    desc: "ErrorBoundary、Suspense 异步加载与错误捕获",
    href: "/boundary",
    iconKey: "boundary",
    accent: "border-l-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
    accentText: "text-amber-600 dark:text-amber-400",
    btnClass:
      "bg-amber-600 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400",
  },
  {
    title: "Resource",
    desc: "createResource 异步数据请求，结合 Suspense 体验",
    href: "/resource",
    iconKey: "resource",
    accent: "border-l-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/10",
    accentText: "text-cyan-600 dark:text-cyan-400",
    btnClass:
      "bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400",
  },
  {
    title: "路由系统",
    desc: "Link / navigate / 动态段、全局 beforeEach 与布局链",
    href: "/router",
    iconKey: "router",
    /** 与横向相邻的 Resource（cyan）区分，不用 teal/cyan 系 */
    accent: "border-l-blue-600 bg-blue-500/5 dark:bg-blue-500/10",
    accentText: "text-blue-600 dark:text-blue-400",
    btnClass:
      "bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400",
  },
  {
    title: "路由卫士",
    desc: "beforeEach 控制台快照、可开关拦截进入 /form",
    href: "/route-guard",
    iconKey: "router",
    /** 与上一行 Boundary（amber）纵向相邻，改用 violet */
    accent: "border-l-violet-500 bg-violet-500/5 dark:bg-violet-500/10",
    accentText: "text-violet-600 dark:text-violet-400",
    btnClass:
      "bg-violet-600 hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400",
  },
  {
    title: "Context",
    desc: "createContext、Provider、useContext 跨层传值",
    href: "/context",
    iconKey: "context",
    /** 与左侧 route-guard（violet）、上方 Resource（cyan）区分，用 rose */
    accent: "border-l-rose-500 bg-rose-500/5 dark:bg-rose-500/10",
    accentText: "text-rose-600 dark:text-rose-400",
    btnClass:
      "bg-rose-600 hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400",
  },
  {
    title: "表单",
    desc: "createForm 字段绑定、演示注册与重置",
    href: "/form",
    iconKey: "form",
    /** 与右侧 Portal 列、下方 transition 区分：fuchsia */
    accent: "border-l-fuchsia-500 bg-fuchsia-500/5 dark:bg-fuchsia-500/10",
    accentText: "text-fuchsia-600 dark:text-fuchsia-400",
    btnClass:
      "bg-fuchsia-600 hover:bg-fuchsia-500 dark:bg-fuchsia-500 dark:hover:bg-fuchsia-400",
  },
  {
    title: "Portal",
    desc: "Portal 将 UI 挂到 body 等宿主（如全局模态）",
    href: "/portal",
    iconKey: "portal",
    /** 与周围 rose / teal / lime 区分：slate */
    accent: "border-l-slate-500 bg-slate-500/5 dark:bg-slate-500/10",
    accentText: "text-slate-600 dark:text-slate-400",
    btnClass:
      "bg-slate-700 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500",
  },
  {
    title: "Runtime / SSR",
    desc: "renderToString、generateHydrationScript 与说明",
    href: "/runtime",
    iconKey: "runtime",
    /** 与 slate Portal、粉/紫系区分：lime */
    accent: "border-l-lime-600 bg-lime-500/5 dark:bg-lime-500/10",
    accentText: "text-lime-700 dark:text-lime-400",
    btnClass:
      "bg-lime-600 hover:bg-lime-500 dark:bg-lime-500 dark:hover:bg-lime-400",
  },
  {
    title: "过渡与异步",
    desc: "慢速/常规内容切换、Suspense 式加载态",
    href: "/transition",
    iconKey: "transition",
    /** 与上方 form（fuchsia）纵向相邻，改用 pink */
    accent: "border-l-pink-500 bg-pink-500/5 dark:bg-pink-500/10",
    accentText: "text-pink-600 dark:text-pink-400",
    btnClass:
      "bg-pink-600 hover:bg-pink-500 dark:bg-pink-500 dark:hover:bg-pink-400",
  },
  {
    title: "性能",
    desc: "createSelector O(1) 高亮、createForm 细粒度",
    href: "/performance",
    iconKey: "perf",
    /** 与左 slate、下 gallery 区分：orange */
    accent: "border-l-orange-500 bg-orange-500/5 dark:bg-orange-500/10",
    accentText: "text-orange-600 dark:text-orange-400",
    btnClass:
      "bg-orange-600 hover:bg-orange-500 dark:bg-orange-500 dark:hover:bg-orange-400",
  },
  {
    title: "交互画廊",
    desc: "缩略图、全屏预览与缩放关闭",
    href: "/gallery",
    iconKey: "gallery",
    /** 与上 lime、右 layout 区分：第二处 indigo（与首卡不同行不相邻） */
    accent: "border-l-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10",
    accentText: "text-indigo-600 dark:text-indigo-400",
    btnClass:
      "bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400",
  },
  {
    title: "布局嵌套",
    desc: "多 _layout 链、inheritLayout: false 独立壳",
    href: "/layout-nested/inner",
    iconKey: "layout",
    /** 与左 orange、上 pink、首列 indigo 均不相邻冲突：emerald */
    accent: "border-l-emerald-600 bg-emerald-500/5 dark:bg-emerald-500/10",
    accentText: "text-emerald-700 dark:text-emerald-400",
    btnClass:
      "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400",
  },
];

export default function Home() {
  createEffect(() => {
    console.log("[View Home] Mounted (Theme Stable)");
  });

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-800/80 sm:p-12 transition-colors">
        {/* 背景渐变装饰 */}
        <div className="absolute inset-0 bg-linear-to-br from-white via-indigo-50/30 to-slate-50 dark:from-slate-800 dark:via-indigo-950/20 dark:to-slate-800/90 -z-10">
        </div>

        <div className="relative z-10">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
            DREAMER VIEW · 极致响应式框架
          </p>
          <h1 className="mb-4 text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-6xl">
            更小，更快，更现代。222
          </h1>
          <p className="max-w-xl text-slate-600 dark:text-slate-300 sm:text-lg leading-relaxed font-medium">
            基于 Signal 的微型响应式引擎，支持 SSR、Hydration 与模块热重载。
            点击下方模块进入功能演示。
          </p>
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_MODULES.map((mod) => {
          const Icon = ModuleIcons[mod.iconKey];
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={`group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-slate-600/90 dark:bg-slate-800/95 border-l-4 ${mod.accent}`}
            >
              <div className="mb-4 flex items-start justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {mod.title}
                </span>
                <span className={mod.accentText}>
                  {Icon ? Icon() : null}
                </span>
              </div>
              <p className="flex-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6 font-medium">
                {mod.desc}
              </p>
              <span
                className={`inline-flex items-center gap-2 self-start rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all duration-200 group-hover:gap-3 group-hover:shadow-lg ${mod.btnClass}`}
              >
                探索更多
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
