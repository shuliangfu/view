/**
 * @dreamer/view 多页面示例 — 根组件（约定 _app.tsx，路由扫描自动屏蔽）
 *
 * 使用 router.getCurrentRouteSignal() 响应当前路由，Layout 提供顶部 Navbar。
 * 链接直接写 href="/path"，由 router 拦截实现无刷新跳转。
 * 当前页由 RoutePage 渲染（懒加载 + 按 path 缓存）。
 */

import type { VNode } from "@dreamer/view";
import { RoutePage, type Router } from "@dreamer/view/router";
import { routes } from "../router/routers.tsx";
import { Layout } from "./_layout.tsx";

interface AppProps {
  router: Router;
}

/** 根组件：根据当前路由渲染 Layout + 当前页 */
export function App(props: AppProps): VNode {
  const { router } = props;
  const current = router.getCurrentRouteSignal()();
  
  if (!current) {
    return (
      <Layout routes={routes} currentPath="">
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-12 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-16 flex flex-col items-center justify-center min-h-[280px]">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent dark:border-indigo-400 dark:border-t-transparent"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            加载中…
          </p>
        </section>
      </Layout>
    );
  }

  const routePage = (
    <RoutePage
      match={current}
      router={router}
      labels={{
        errorTitle: "加载页面失败",
        retryText: "重试",
        loadingText: "加载中…",
      }}
    />
  );
  if (current.inheritLayout === false) {
    return routePage;
  }
  return (
    <Layout routes={routes} currentPath={current.path}>
      {routePage}
    </Layout>
  );
}
