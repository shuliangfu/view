/**
 * @dreamer/view 多页面示例 — 入口
 *
 * 从 router/router 创建带拦截与守卫的应用路由，
 * createRoot 根组件订阅路由并渲染当前页。
 */

import { createRoot } from "@dreamer/view";
import { createAppRouter } from "./router/router.ts";
import { App } from "./routes/app.tsx";
import { notFoundRoute, routes } from "./router/routers.tsx";

const container = document.getElementById("root");
if (container) {
  const router = createAppRouter({ routes, notFound: notFoundRoute });
  createRoot(() => <App router={router} />, container);
  container.removeAttribute("data-view-cloak");
}
