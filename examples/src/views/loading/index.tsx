/**
 * Loading 示例：_loading.tsx 仅当前目录
 *
 * - 该目录下的 _loading.tsx 仅在当前目录生效，子目录不继承
 * - 页面懒加载时显示该目录的 loading 组件
 */

import type { VNode } from "@dreamer/view";

export const meta = {
  title: "Loading",
  description: "_loading.tsx 仅当前目录示例",
  keywords: "Loading, _loading, 加载态",
  group: "示例",
};

export default function LoadingExample(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Loading
      </p>
      <h1 className="mb-4 text-xl font-semibold text-slate-800 dark:text-slate-200">
        加载态示例
      </h1>
      <p className="text-slate-600 dark:text-slate-300">
        该目录下的 <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">_loading.tsx</code> 仅在当前目录生效，子目录不继承；页面懒加载时会显示该目录的 loading 组件。
      </p>
    </section>
  );
}
