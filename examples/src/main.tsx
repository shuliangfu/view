/**
 * @dreamer/view 多页面示例 — 入口
 *
 * 使用内置 router 实现 SPA：createRouter、router.start() 拦截链接，
 * createRoot 根组件订阅路由并渲染当前页。
 */

import { createRoot } from "@dreamer/view";
import { createRouter } from "@dreamer/view/router";
import { App } from "./App.tsx";
import { notFoundRoute, routes } from "./routes.tsx";

const container = document.getElementById("root");
if (container) {
  const router = createRouter({
    routes,
    notFound: notFoundRoute,
    interceptLinks: true,
    beforeRoute: (to) => {
      if (to?.fullPath === "/router-redirect") return "/router";
      return true;
    },
    afterRoute: (to) => {
      const title = (to?.meta?.title as string) ?? to?.path ?? "";
      if (title && typeof document !== "undefined") {
        document.title = `${title} — @dreamer/view 示例`;
      }
    },
  });
  router.start();

  createRoot(() => <App router={router} />, container);
  container.removeAttribute("data-view-cloak");
}
