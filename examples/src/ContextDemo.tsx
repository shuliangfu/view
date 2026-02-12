/**
 * Context：createContext、Provider、useContext
 *
 * 跨层注入数据，子组件通过 useContext() 读取。
 */

import { createSignal } from "@dreamer/view";
import { createContext } from "@dreamer/view/context";
import type { VNode } from "@dreamer/view";

type Theme = "light" | "dark";

const ThemeContext = createContext<Theme>("light");

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";

/** 子组件：通过 useContext 读取 theme */
function ThemedBox(): VNode {
  const theme = ThemeContext.useContext();
  return (
    <div
      className={theme === "dark"
        ? "rounded-xl border border-slate-600 bg-slate-800 px-5 py-4 text-slate-200 shadow-inner"
        : "rounded-xl border border-slate-200 bg-slate-100 px-5 py-4 text-slate-800 shadow-inner dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"}
    >
      当前主题：<span className="font-semibold text-indigo-600 dark:text-indigo-400">
        {theme}
      </span>
    </div>
  );
}

const [theme, setTheme] = createSignal<Theme>("light");

export function ContextDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
        Context
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createContext / Provider / useContext
      </h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            切换 Provider 值
          </p>
          <p className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => setTheme("light")}
            >
              light
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setTheme("dark")}
            >
              dark
            </button>
          </p>
          <ThemeContext.Provider value={theme()}>
            <ThemedBox />
          </ThemeContext.Provider>
        </div>
      </div>
    </section>
  );
}
