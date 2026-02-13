/**
 * 路由实例与上下文：创建带拦截/守卫的应用路由，并提供 RouterProvider、useRouter
 * 路由拦截（beforeRoute、afterRoute）、标题同步等在此统一配置，便于后续扩展。
 */

import { createContext } from "@dreamer/view/context";
import {
  createRouter as createViewRouter,
  type RouteConfig,
  type RouteMatch,
  type Router,
} from "@dreamer/view/router";
import type { VNode } from "@dreamer/view";

/** 带 router 的 match，由 App 注入，避免 context 打包多实例导致「Router 未注入」 */
export type RouteMatchWithRouter = RouteMatch & { router: Router };

// ---------------------------------------------------------------------------
// 路由上下文：子组件通过 useRouter() 获取 router 实例
// 导出 RouterContext 供根组件直接使用 Provider，避免打包后别名组件引用不一致导致「Router 未注入」
// ---------------------------------------------------------------------------

/** 路由上下文，根组件使用 RouterContext.Provider value={router} 注入，子组件用 useRouter() 读取 */
export const RouterContext = createContext<Router | null>(null, "Router");

/** 在根组件包裹，注入 router，子组件可用 useRouter() 获取（兼容用法，推荐直接用 RouterContext.Provider） */
export function RouterProvider(props: {
  router: Router;
  children: VNode | VNode[];
}): VNode | VNode[] | null {
  return RouterContext.Provider({
    value: props.router,
    children: props.children,
  });
}

RouterContext.registerProviderAlias(
  RouterProvider as (props: Record<string, unknown>) => VNode | VNode[] | null,
  (p) => (p as { router: Router }).router,
);

/** 获取当前 router 实例（在 RouterProvider 子树内使用） */
export function useRouter(): Router | null {
  return RouterContext.useContext();
}

// ---------------------------------------------------------------------------
// 应用路由创建：统一配置拦截、守卫、标题，并 start()
// ---------------------------------------------------------------------------

const DOC_TITLE_SUFFIX = " — @dreamer/view 示例";

/**
 * 创建并启动应用路由
 * 内置：链接拦截、beforeRoute（如重定向）、afterRoute（标题同步）
 */
export function createAppRouter(opts: {
  routes: RouteConfig[];
  notFound: RouteConfig;
}): Router {
  const router = createViewRouter({
    routes: opts.routes,
    notFound: opts.notFound,
    interceptLinks: true,
    beforeRoute: (to) => {
      if (to?.fullPath === "/router-redirect") return "/router";
      return true;
    },
    afterRoute: (to) => {
      const title = (to?.meta?.title as string) ?? to?.path ?? "";
      if (title && typeof globalThis.document !== "undefined") {
        globalThis.document.title = `${title}${DOC_TITLE_SUFFIX}`;
      }
    },
  });
  router.start();
  return router;
}
