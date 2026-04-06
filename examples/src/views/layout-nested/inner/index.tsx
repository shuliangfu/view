/**
 * @module views/layout-nested/inner
 * @description 多层 _layout 嵌套演示页（根 layout → layout-nested → inner → 本页）
 */

import { Link, useRouter } from "@dreamer/view";

/** 路由元信息：归入「示例」导航分组 */
export const metadata = {
  title: "Layout 嵌套",
  group: "示例",
};

/**
 * 最内层页面：展示当前 path，并说明三层 layout 包裹关系
 */
export default function LayoutNestedDemoPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          多层 Layout 嵌套
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-2xl">
          本路由为{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
            /layout-nested/inner
          </code>
          。外层依次由{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
            views/_layout.tsx
          </code>
          、
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
            layout-nested/_layout.tsx
          </code>
          、
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
            layout-nested/inner/_layout.tsx
          </code>{" "}
          包裹；琥珀色与青色虚线框即各层边界。
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-600 dark:bg-slate-800/80">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
          当前 path（useRouter）
        </p>
        <p className="font-mono text-sm text-indigo-600 dark:text-indigo-400">
          {() => router.path()}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/layout-nested/standalone"
          className="inline-flex items-center rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-950/40"
        >
          对比：Layout 不继承（无根顶栏）
        </Link>
        <Link
          href="/gallery"
          className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50"
        >
          前往 Gallery（示例）
        </Link>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          回首页
        </Link>
      </div>
    </div>
  );
}
