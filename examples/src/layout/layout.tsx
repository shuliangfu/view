/**
 * 多页面示例 — 布局：顶部 Navbar + 主内容区
 *
 * 链接直接写 path（如 href="/signal"），由 router 拦截实现无刷新跳转。
 * 导航项由 routes 在内部派生（过滤 *、取 path + meta.title），可传 currentPath 高亮当前页。
 * 支持 light/dark 主题切换。
 */

import type { VNode } from "@dreamer/view";
import type { RouteConfig } from "@dreamer/view/router";
import { theme, toggleTheme } from "../stores/theme.ts";

/** 导航项：path 即 href，供 Navbar 渲染 */
export interface NavItem {
  path: string;
  label: string;
}

/**
 * 从路由表派生导航项：排除通配 *，取 path 与 meta.title 作为 label
 */
function navItemsFromRoutes(routes: RouteConfig[]): NavItem[] {
  return routes
    .filter((r) => r.path !== "*")
    .map((r) => ({
      path: r.path,
      label: (r.meta?.title as string) ?? r.path,
    }));
}

interface LayoutProps {
  /** 路由表，用于在布局内派生导航项（不依赖 routers 导出 navItems，便于 routers 自动生成） */
  routes: RouteConfig[];
  /** 当前路径，用于高亮 Navbar 激活项 */
  currentPath?: string;
  /** 主内容区（JSX 子节点会注入到此） */
  children?: VNode | VNode[];
}

/** GitHub 图标（24x24），用于 Navbar 外链 */
const GitHubIcon = () => (
  <svg
    className="h-6 w-6 text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      clipRule="evenodd"
    />
  </svg>
);

/** 太阳图标（light 模式时显示，点击切到 dark） */
const SunIcon = () => (
  <svg
    className="h-5 w-5"
    fill="currentColor"
    viewBox="0 0 20 20"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
      clipRule="evenodd"
    />
  </svg>
);

/** 月亮图标（dark 模式时显示，点击切到 light） */
const MoonIcon = () => (
  <svg
    className="h-5 w-5"
    fill="currentColor"
    viewBox="0 0 20 20"
    aria-hidden="true"
  >
    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
  </svg>
);

/** 布局：顶部固定 Navbar + 主内容区；含主题切换、GitHub 链接；支持 dark 模式 */
export function Layout(props: LayoutProps): VNode {
  const { routes, currentPath = "", children } = props;
  const navItems = navItemsFromRoutes(routes);
  const isDark = theme() === "dark";
  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-slate-100/80 dark:from-slate-900 dark:to-slate-800/80">
      {/* 顶部导航栏：毛玻璃、细边框、高端感 */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-800/80">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-800 hover:text-indigo-600 transition-colors dark:text-slate-200 dark:hover:text-indigo-400"
          >
            @dreamer/view
            <span className="rounded-md border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
              示例
            </span>
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
              {navItems.map((item) => {
                const isActive = currentPath === item.path;
                return (
                  <li key={item.path}>
                    <a
                      href={item.path}
                      className={isActive
                        ? "rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 shadow-sm dark:text-indigo-300 dark:bg-indigo-900/50"
                        : "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => toggleTheme()}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title={isDark ? "切换到浅色" : "切换到深色"}
              aria-label={isDark ? "切换到浅色" : "切换到深色"}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <a
              href="https://github.com/shuliangfu/view"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="view 模板引擎 — GitHub"
            >
              <GitHubIcon />
            </a>
          </div>
        </nav>
      </header>
      {/* 主内容区：居中、留白、最大宽度 */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
