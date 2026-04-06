/**
 * @module views/router
 * @description 展示 @dreamer/view 路由：Link、navigate/replace、动态段、query、全局 beforeEach 与 /route-guard 演示入口。
 */
import { Link, useRouter } from "@dreamer/view";

export default function RouterDemo() {
  const router = useRouter();

  /** 当前完整路径（响应式） */
  const currentPath = router.path;

  return (
    <section className="space-y-10">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          响应式路由 (Reactive Router)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium max-w-3xl">
          基于 History API；<code className="font-mono text-sm">Link</code>{" "}
          与同源 <code className="font-mono text-sm">&lt;a href&gt;</code>{" "}
          委托拦截（默认开启）。导航前执行全局{" "}
          <code className="font-mono text-sm">beforeEach</code>，详见{" "}
          <Link
            href="/route-guard"
            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            路由卫士演示
          </Link>
          ；打开 DevTools Console 可看到每次放行的{" "}
          <code className="font-mono text-sm">to / from</code> 快照。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm space-y-6 transition-colors">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-slate-700/50 pb-4">
            声明式导航（Link）
          </h3>
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="group flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold hover:translate-x-1 transition-transform"
            >
              <span className="text-lg">←</span> 返回首页
            </Link>
            <Link
              href="/performance"
              className="group flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold hover:translate-x-1 transition-transform"
            >
              性能演示 <span className="text-lg">→</span>
            </Link>
            <Link
              href="/store?from=router-demo"
              className="group flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold hover:translate-x-1 transition-transform"
            >
              Store + query（?from=router-demo）→
            </Link>
          </div>
        </div>

        <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm space-y-6 transition-colors">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-slate-700/50 pb-4">
            编程式导航（navigate / replace）
          </h3>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void router.navigate("/store")}
              className="text-left text-indigo-600 dark:text-indigo-400 font-bold hover:translate-x-1 transition-transform"
            >
              navigate(&quot;/store&quot;) →
            </button>
            <button
              type="button"
              onClick={() => void router.replace("/resource?replaced=1")}
              className="text-left text-amber-700 dark:text-amber-300 font-bold hover:translate-x-1 transition-transform"
            >
              replace(&quot;/resource?replaced=1&quot;)（无历史堆积）
            </button>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-600"
              >
                back()
              </button>
              <button
                type="button"
                onClick={() => router.forward()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-600"
              >
                forward()
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-slate-50 dark:bg-slate-900/50 space-y-6 transition-colors">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-4">
          动态段（:userId）与路由卫士
        </h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/router/user/alice"
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-500"
          >
            /router/user/alice
          </Link>
          <Link
            href="/route-guard"
            className="rounded-xl border-2 border-amber-500 px-4 py-2 text-sm font-bold text-amber-800 dark:text-amber-300"
          >
            路由卫士 + 拦截 /form 演示 →
          </Link>
        </div>
      </div>

      <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-slate-50 dark:bg-slate-900/50 space-y-6 transition-colors">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-4">
          路由状态（实时）
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
            当前 path
          </span>
          <code className="px-4 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-indigo-600 dark:text-indigo-400 font-black shadow-inner">
            {currentPath()}
          </code>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          提示：<code className="font-mono">Link</code> 使用{" "}
          <code className="font-mono">data-view-link</code>；全页{" "}
          <code className="font-mono">scroll: &quot;top&quot;</code>{" "}
          在 main 中配置，导航后滚回顶部。
        </p>
      </div>
    </section>
  );
}
