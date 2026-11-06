/**
 * @dreamer/view 现代架构多页面示例 — 入口
 * 全面转向自动化 jsx-runtime 与统一导入路径。
 *
 * DevTools overlay：DEV 由 view 内核自动挂载（HMR banner + auto-mount 入口），
 * 业务零调用 `mountDevtoolsOverlay`。`mountWithRouter` 在 VIEW_DEV 下走
 * `createRootTracked`，树面板可见 Owner 根。
 */

import { createRouter, mountWithRouter } from "@dreamer/view/router";
import { routerBeforeEach } from "./router/router.ts";
import { notFoundRoute, routes } from "./router/routers.tsx";
import "./assets/global.css";

/**
 * 现代架构下的路由初始化：`notFound` 独立配置；`scroll: "top"` 在导航后滚回顶部；
 * `beforeEach` 演示全局卫士（控制台打印 to/from，可按 /route-guard 页开关拦截 /form）。
 */
const router = createRouter({
  routes: [...routes],
  notFound: notFoundRoute,
  scroll: "top",
  beforeEach: routerBeforeEach,
});

mountWithRouter("#root", router);
