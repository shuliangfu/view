/**
 * Router 示例：路由说明、编程式导航、动态参数、href、守卫
 *
 * - 使用 @dreamer/view/router，history 模式，链接写 href="/path" 即无刷新跳转
 * - navigate(path, replace?)、replace(path)、back()、forward()、go(delta)
 * - 动态路由：path 配置为 /user/:id 时，component(match) 可拿到 params、fullPath、query
 * - href(path) 生成完整 href；beforeRoute / afterRoute 在 main 中配置
 */

import type { VNode } from "@dreamer/view";
import type { RouteMatchWithRouter } from "../../router/router.ts";

/** 输入框 DOM 引用，非受控避免输入时整树重渲染失焦 */
let pathInputEl: HTMLInputElement | null = null;

const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

/** 由 App 通过 match.router 注入，不依赖 context，避免打包多实例导致「Router 未注入」 */
export function RouterDemo(match: RouteMatchWithRouter): VNode {
  const router = match.router;

  const current = router.getCurrentRoute();
  const currentPath = current?.fullPath ?? "";
  const currentHref = router.href("/signal");

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-teal-600 dark:text-teal-400">
        Router
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        navigate / replace / back / forward / href / 守卫
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-300 leading-relaxed">
        本示例使用{" "}
        <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
          @dreamer/view/router
        </code>，支持 history 模式、path 匹配、动态参数（如{" "}
        <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
          /user/:id
        </code>）、编程式导航与守卫。链接直接写{" "}
        <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
          href="/path"
        </code>{" "}
        即可无刷新跳转。
      </p>
      <div className="space-y-6">
        <div className={block}>
          <h3 className={subTitle}>当前路由</h3>
          <p className="font-mono text-sm text-slate-600 dark:text-slate-300">
            当前路径：<span className="font-semibold text-indigo-600 dark:text-indigo-400">
              {currentPath || "(空)"}
            </span>
          </p>
          <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-300">
            router.href("/signal") →{" "}
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              {currentHref}
            </span>
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>编程式导航</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            navigate(path)、replace(path)、back()、forward()、go(delta)
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => router.navigate("/signal")}
            >
              去 Signal
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => router.navigate("/store")}
            >
              去 Store
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => router.replace("/context")}
            >
              replace 到 Context
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => router.back()}>
              后退
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => router.forward()}
            >
              前进
            </button>
            <button type="button" className={btn} onClick={() => router.go(-2)}>
              go(-2)
            </button>
          </div>
        </div>
        <div className={block}>
          <h3 className={subTitle}>输入路径并 navigate</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              ref={(el: unknown) => {
                pathInputEl = el as HTMLInputElement | null;
              }}
              placeholder="/signal"
            />
            <button
              type="button"
              className={btn}
              onClick={() => router.navigate(pathInputEl?.value?.trim() || "/")}
            >
              导航
            </button>
          </div>
        </div>
        <div className={block}>
          <h3 className={subTitle}>动态路由</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            路由配置中若 path 带动态参数（如{" "}
            <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
              /user/:id
            </code>），匹配后{" "}
            <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
              component(match)
            </code>{" "}
            会收到{" "}
            <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
              match
            </code>{" "}
            对象，包含：
          </p>
          <ul className="mb-3 list-inside list-disc space-y-1 font-mono text-sm text-slate-600 dark:text-slate-300">
            <li>
              <code>path</code>：路由模式（如 /user/:id）
            </li>
            <li>
              <code>fullPath</code>：当前完整路径（如 /user/123）
            </li>
            <li>
              <code>params</code>：动态参数（如 {`{ id: "123" }`}）
            </li>
            <li>
              <code>query</code>：查询串解析结果（如 ?a=1 → {`{ a: "1" }`}）
            </li>
          </ul>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            示例：当用户访问{" "}
            <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
              /user/42?tab=profile
            </code>{" "}
            时，match 内容如下。
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-sm text-slate-600 dark:text-slate-300">
            <li>path（模式）：/user/:id</li>
            <li>fullPath：/user/42?tab=profile</li>
            <li>
              params.id：<span className="font-semibold text-indigo-600 dark:text-indigo-400">
                42
              </span>
            </li>
            <li>query：{`{ "tab": "profile" }`}</li>
          </ul>
        </div>
        <div className="rounded-lg border-l-4 border-teal-500/50 bg-teal-500/5 px-4 py-3 dark:bg-teal-500/10">
          <h3 className={subTitle}>守卫说明</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            beforeRoute：访问{" "}
            <a
              href="/router-redirect"
              className="font-mono text-xs text-teal-600 underline dark:text-teal-400"
            >
              /router-redirect
            </a>{" "}
            会被重定向到本页。 afterRoute：每次导航完成后会设置
            document.title（在 main 中配置）。
          </p>
        </div>
      </div>
    </section>
  );
}
export default RouterDemo;
