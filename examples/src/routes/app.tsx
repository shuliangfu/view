/**
 * @dreamer/view 多页面示例 — 根组件
 *
 * 订阅 router 变化，根据当前路由渲染对应页面；Layout 提供顶部 Navbar。
 * 链接直接写 href="/path"，由 router 拦截实现无刷新跳转。
 * 当前页由 @dreamer/view/router 导出的 RoutePage 渲染（懒加载 + 按 path 缓存）。
 */

import type { VNode } from "@dreamer/view";
import { createEffect, createSignal } from "@dreamer/view";
import { RoutePage, type Router } from "@dreamer/view/router";
import { routes } from "../router/routers.tsx";
import { Layout } from "./layout.tsx";

interface AppProps {
  router: Router;
}

/** 根组件：订阅路由，渲染 Layout + 当前页 */
export function App(props: AppProps): VNode {
  const { router } = props;
  const [match, setMatch] = createSignal(router.getCurrentRoute());

  createEffect(() => {
    setMatch(router.getCurrentRoute());
    const unsub = router.subscribe(() => {
      setMatch(router.getCurrentRoute());
    });
    return unsub;
  });

  const current = match();
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

  const pageTitle = (current.meta?.title as string) ?? current.path;
  if (typeof document !== "undefined" && document.title !== pageTitle) {
    document.title = `${pageTitle} — @dreamer/view 示例`;
  }

  return (
    <Layout routes={routes} currentPath={current.path}>
      <RoutePage
        match={current}
        router={router}
        labels={{
          errorTitle: "加载页面失败",
          retryText: "重试",
          loadingText: "加载中…",
        }}
      />
    </Layout>
  );
}
