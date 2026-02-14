/**
 * 路由懒加载时的占位（约定 _loading.tsx，路由扫描自动屏蔽）：显示加载中
 */
import type { VNode } from "@dreamer/view";

export function RouteLoading(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-16 flex flex-col items-center justify-center min-h-[280px]">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400 dark:border-t-transparent"
        aria-hidden="true"
      />
      <p className="mt-4 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
        加载中…
      </p>
    </section>
  );
}
