/**
 * 首页视图：Hero + 功能模块卡片网格
 * 使用 ModuleIcons、HOME_MODULES 渲染入口卡片，链接由 router 拦截无刷新跳转。
 */

import type { VNode } from "@dreamer/view";

/** 首页模块图标：每个模块一个简洁 SVG，用 currentColor 继承文字色 */
const ModuleIcons: Record<string, () => VNode> = {
  core: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
      aria-hidden="true"
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
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  directive: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  ),
  reactive: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 7v10M7 4h10M7 20h10M20 7v10"
      />
    </svg>
  ),
  resource: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
  runtime: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  ),
  router: () => (
    <svg
      className="h-8 w-8 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  ),
};

/** 首页功能模块配置：标题、描述、链接、强调色、图标 key */
const HOME_MODULES: Array<{
  title: string;
  desc: string;
  href: string;
  iconKey: keyof typeof ModuleIcons;
  accent: string;
  accentText: string;
}> = [
  {
    title: "核心 333",
    desc: "createSignal、createEffect、createMemo、onCleanup",
    href: "/signal",
    iconKey: "core",
    accent: "border-l-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10",
    accentText: "text-indigo-600 dark:text-indigo-400",
  },
  {
    title: "Store",
    desc: "createStore（getters / actions / persist）",
    href: "/store",
    iconKey: "store",
    accent: "border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
    accentText: "text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "Boundary",
    desc: "ErrorBoundary、Suspense",
    href: "/boundary",
    iconKey: "boundary",
    accent: "border-l-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
    accentText: "text-amber-600 dark:text-amber-400",
  },
  {
    title: "指令",
    desc: "vIf、vElse、vElseIf、vFor、vShow、vOnce、vCloak、自定义（v-focus）",
    href: "/directive",
    iconKey: "directive",
    accent: "border-l-violet-500 bg-violet-500/5 dark:bg-violet-500/10",
    accentText: "text-violet-600 dark:text-violet-400",
  },
  {
    title: "Reactive",
    desc: "createReactive、表单与 effect 联动",
    href: "/reactive",
    iconKey: "reactive",
    accent: "border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
    accentText: "text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "Resource",
    desc: "createResource（无/有 source）",
    href: "/resource",
    iconKey: "resource",
    accent: "border-l-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/10",
    accentText: "text-cyan-600 dark:text-cyan-400",
  },
  {
    title: "Context",
    desc: "createContext、Provider、useContext",
    href: "/context",
    iconKey: "context",
    accent: "border-l-rose-500 bg-rose-500/5 dark:bg-rose-500/10",
    accentText: "text-rose-600 dark:text-rose-400",
  },
  {
    title: "Runtime",
    desc: "createRoot、render、renderToString、hydrate",
    href: "/runtime",
    iconKey: "runtime",
    accent: "border-l-sky-500 bg-sky-500/5 dark:bg-sky-500/10",
    accentText: "text-sky-600 dark:text-sky-400",
  },
  {
    title: "Router",
    desc: "navigate、replace、back/forward、href、守卫",
    href: "/router",
    iconKey: "router",
    accent: "border-l-teal-500 bg-teal-500/5 dark:bg-teal-500/10",
    accentText: "text-teal-600 dark:text-teal-400",
  },
];

/** 首页：Hero（渐变+层次）+ 功能模块卡片网格 */
export function Home(): VNode {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-br from-white via-indigo-50/30 to-slate-50 p-8 shadow-xl backdrop-blur dark:border-slate-600/80 dark:from-slate-800 dark:via-indigo-950/20 dark:to-slate-800/90 sm:p-12">
        <div className="relative z-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
            View 模板引擎 · 多页面示例
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-5xl">
            @dreamer/view
          </h1>
          <p className="max-w-xl text-slate-600 dark:text-slate-300 sm:text-lg leading-relaxed">
            本示例使用内置 router
            实现多页面无刷新切换，点击下方模块或顶部导航进入对应示例。
          </p>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_MODULES.map((mod) => {
          const Icon = ModuleIcons[mod.iconKey];
          return (
            <a
              key={mod.href}
              href={mod.href}
              className={"group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-slate-300/80 dark:border-slate-600/90 dark:bg-slate-800/95 dark:hover:border-slate-500/80 " +
                "border-l-4 " +
                mod.accent}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <span className="block text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  {mod.title}
                </span>
                <span className={mod.accentText}>
                  {Icon ? Icon() : null}
                </span>
              </div>
              <p className="flex-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-5">
                {mod.desc}
              </p>
              <span
                className={"inline-flex items-center gap-2 self-start rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 group-hover:gap-3 group-hover:shadow-lg " +
                  (mod.iconKey === "core"
                    ? "bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    : mod.iconKey === "store"
                    ? "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    : mod.iconKey === "boundary"
                    ? "bg-amber-600 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
                    : mod.iconKey === "directive"
                    ? "bg-violet-600 hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400"
                    : mod.iconKey === "reactive"
                    ? "bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    : mod.iconKey === "resource"
                    ? "bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400"
                    : mod.iconKey === "context"
                    ? "bg-rose-600 hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400"
                    : mod.iconKey === "router"
                    ? "bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400"
                    : "bg-sky-600 hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400")}
              >
                进入示例
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </a>
          );
        })}
      </section>
    </div>
  );
}
export default Home;
