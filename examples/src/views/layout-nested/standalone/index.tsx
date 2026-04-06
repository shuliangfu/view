/**
 * @module views/layout-nested/standalone
 * @description 演示：子目录 _layout 设置 inheritLayout = false 后脱离根布局与上层 layout-nested/_layout
 */

import { Link } from "@dreamer/view";

/** 路由元信息：仍可在根 _layout 的导航源里出现（由 routes 扫描），但本页渲染时不套根 layout */
export const metadata = {
  title: "Layout 不继承",
  group: "示例",
};

/**
 * 说明页：对比「多层继承」与「本页仅 standalone/_layout」的差异
 */
export default function LayoutStandaloneDemoPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">
        Layout 不继承（inheritLayout = false）
      </h1>
      <div className="rounded-xl border border-violet-200 bg-white/80 p-5 text-sm leading-relaxed dark:border-violet-800/60 dark:bg-violet-950/30">
        <p className="mb-3 font-semibold text-violet-800 dark:text-violet-200">
          你现在看到的页面：
        </p>
        <ul className="list-inside list-disc space-y-2 text-slate-600 dark:text-slate-300">
          <li>
            <strong>没有</strong> 全站{" "}
            <code className="rounded bg-violet-100 px-1 dark:bg-violet-900/50">
              views/_layout.tsx
            </code>{" "}
            （顶部示例导航栏不会出现）。
          </li>
          <li>
            <strong>没有</strong>{" "}
            <code className="rounded bg-violet-100 px-1 dark:bg-violet-900/50">
              layout-nested/_layout.tsx
            </code>{" "}
            琥珀色虚线框。
          </li>
          <li>
            仅有本目录{" "}
            <code className="rounded bg-violet-100 px-1 dark:bg-violet-900/50">
              standalone/_layout.tsx
            </code>{" "}
            作为唯一布局壳（紫色主题条 + 主内容区）。
          </li>
        </ul>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          实现方式：在{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            standalone/_layout.tsx
          </code>{" "}
          中导出{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            export const inheritLayout = false
          </code>
          。扫描逻辑见{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            view/src/server/core/layout.ts
          </code>{" "}
          的{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            computeLayoutChain
          </code>
          。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/layout-nested/inner"
          className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          对比：多层继承 /layout-nested/inner
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-600 dark:text-violet-200 dark:hover:bg-violet-900/40"
        >
          回首页（进入带根布局的站点壳）
        </Link>
      </div>
    </div>
  );
}
