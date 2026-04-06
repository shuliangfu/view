/**
 * @module views/route-guard
 * @description 路由卫士演示：开关拦截 `/form`，控制台可观察 beforeEach 打印。
 */
import { createSignal, Link, useRouter } from "@dreamer/view";
import { GUARD_BLOCK_FORM_KEY } from "../../router/router.ts";

export default function RouteGuardDemo() {
  const router = useRouter();

  /** 是否与 sessionStorage 同步「拦截 Form」开关 */
  const [blockForm, setBlockForm] = createSignal(
    (() => {
      try {
        return globalThis.sessionStorage?.getItem(GUARD_BLOCK_FORM_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );

  /**
   * 切换演示开关并写入 sessionStorage
   */
  function toggleBlockForm() {
    const next = !blockForm();
    setBlockForm(next);
    try {
      if (next) {
        globalThis.sessionStorage?.setItem(GUARD_BLOCK_FORM_KEY, "1");
      } else {
        globalThis.sessionStorage?.removeItem(GUARD_BLOCK_FORM_KEY);
      }
    } catch {
      /* 忽略 */
    }
    console.log("[route-guard] 演示开关 blockForm =", next);
  }

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          路由卫士（beforeEach）
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          全局守卫在{" "}
          <code className="rounded bg-slate-100 px-1 font-mono text-sm dark:bg-slate-800">
            main.tsx → createRouter(&#123; beforeEach &#125;)
          </code>{" "}
          注册。打开开发者工具 Console，导航时可见{" "}
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            [路由放行]
          </span>{" "}
          或{" "}
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            [路由拦截]
          </span>{" "}
          及完整 <code className="font-mono text-sm">to / from</code> 快照。
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            拦截演示
          </h3>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={blockForm()}
              onChange={() => toggleBlockForm()}
              aria-label="开启后拦截进入 /form"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              开启后拦截进入 <code className="font-mono">/form</code>
            </span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            开启时点击下面链接应停留在当前页，Console 出现{" "}
            <code className="font-mono">blocked: true</code>。
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/form"
              className="inline-flex w-fit rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-400"
            >
              Link → /form（测拦截）
            </Link>
            <button
              type="button"
              onClick={() => void router.navigate("/form")}
              className="inline-flex w-fit rounded-lg border border-amber-500 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40"
            >
              navigate(&quot;/form&quot;)
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            其它导航（对比）
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            关闭开关后，上述链接应正常进入表单页；以下链接不受该演示规则影响。
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/router"
              className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              → 路由总览
            </Link>
            <Link
              href="/store"
              className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              → Store 演示
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
