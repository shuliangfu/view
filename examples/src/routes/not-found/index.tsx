/**
 * 404 视图：兜底页，居中提示 + 返回首页 CTA
 */

import type { VNode } from "@dreamer/view";

export const meta = {
  title: "404",
  description: "页面未找到",
};

export function NotFound(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg backdrop-blur text-center dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-16">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        错误 404
      </p>
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        页面未找到
      </h2>
      <p className="mb-6 max-w-md mx-auto text-slate-600 dark:text-slate-300">
        请检查地址或返回首页继续浏览示例。
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-indigo-400/50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        返回首页
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
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m0 0l-7 7-7-7m7 7V21"
          />
        </svg>
      </a>
    </section>
  );
}
export default NotFound;
