/**
 * loading 目录下的 _loading.tsx：用于测试「仅当前目录」的加载态
 *
 * 访问 /loading 时，页面懒加载过程中会显示本组件；
 * 作用域仅当前目录，子目录不继承。
 */

import type { VNode } from "@dreamer/view";

/** 本目录加载态：转圈 + 文案，便于确认 _loading 是否生效 */
export default function Loading(): VNode {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 dark:border-slate-600/80 dark:bg-slate-800/90">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400 dark:border-t-transparent"
        aria-hidden="true"
      />
      <p className="text-sm text-slate-500 dark:text-slate-400">
        loading 目录 _loading 中…
      </p>
    </div>
  );
}
