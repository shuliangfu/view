/**
 * @dreamer/view 多页面示例 — 根组件
 *
 * 订阅 router 变化，根据当前路由渲染对应页面；Layout 提供顶部 Navbar。
 * 链接直接写 href="/path"，由 router 拦截实现无刷新跳转。
 */

import { createEffect, createSignal } from "@dreamer/view";
import type { VNode } from "@dreamer/view";
import type { RouteMatch, Router } from "@dreamer/view/router";
import { Layout } from "./Layout.tsx";
import { RouterProvider } from "./router-context.tsx";
import { navItems } from "./routes.tsx";

interface AppProps {
  router: Router;
}

/** 在 RouterProvider 内部渲染当前匹配页，保证 useRouter() 能读到 context */
function RoutePage(props: { match: RouteMatch }): VNode {
  return props.match.component(props.match);
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
      <Layout navItems={navItems} currentPath="">
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
    <Layout navItems={navItems} currentPath={current.path}>
      <RouterProvider router={router}>
        <RoutePage match={current} />
      </RouterProvider>
    </Layout>
  );
}
