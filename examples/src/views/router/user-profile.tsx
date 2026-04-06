/**
 * @module views/router/user-profile
 * @description 动态路由段演示：`/router/user/:userId` 由 `params.userId` 注入。
 */
import { Link, useRouter } from "@dreamer/view";

/**
 * 覆盖扫描器由文件名推断的 path，使示例中 `Link href="/router/user/alice"` 等与路由表一致
 * （见 `view/src/server/core/routers.ts` → `extractRoutePathFromFile`）。
 */
export const routePath = "/router/user/:userId";

export default function RouterUserProfile(props: {
  params: Record<string, string>;
  query: Record<string, string>;
}) {
  const router = useRouter();
  const userId = props.params?.userId ?? "—";
  const fromQuery = props.query?.from ?? "";

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
          动态路由段
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          当前模式：<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-slate-800">
            /router/user/:userId
          </code>
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            params.userId
          </span>
          {" = "}
          <code className="font-mono text-indigo-600 dark:text-indigo-400">
            {userId}
          </code>
        </p>
        {fromQuery
          ? (
            <p className="text-xs text-slate-500">
              query.from = <code>{fromQuery}</code>
            </p>
          )
          : null}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/router/user/alice"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            /router/user/alice
          </Link>
          <Link
            href="/router/user/bob?from=demo"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            /router/user/bob?from=demo
          </Link>
          <button
            type="button"
            onClick={() => void router.navigate("/router/user/charlie")}
            className="rounded-lg border border-dashed border-indigo-400 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300"
          >
            navigate(&quot;/router/user/charlie&quot;)
          </button>
        </div>
        <Link
          href="/router"
          className="inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← 返回路由总览
        </Link>
      </div>
    </section>
  );
}
