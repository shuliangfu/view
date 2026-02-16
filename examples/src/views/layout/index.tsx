/**
 * Layout 示例：嵌套 _layout、inheritLayout
 *
 * - 子目录可放 _layout.tsx，自动继承父级布局
 * - _layout 中 export const inheritLayout = false 时不继承父级，支持不限层级嵌套
 */

import type { VNode } from "@dreamer/view";

export const metadata = {
  title: "Layout",
  description: "嵌套 _layout、inheritLayout 示例",
  keywords: "Layout, _layout, inheritLayout, 布局",
  group: "示例",
};

export default function LayoutExample(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Layout
      </p>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-200">
        布局示例
      </h1>
      <p className="text-slate-600 dark:text-slate-300">
        子目录可放 <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">_layout.tsx</code>，自动继承父级布局；在 _layout 中 <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">export const inheritLayout = false</code> 时不继承父级，支持不限层级嵌套。
      </p>
    </section>
  );
}
