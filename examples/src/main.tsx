/**
 * @dreamer/view 现代架构多页面示例 — 入口
 * 全面转向自动化 jsx-runtime 与统一导入路径。
 */

import { createRouter, mountWithRouter } from "@dreamer/view";
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

/**
 * 根挂载：新架构下仅需传入选择器和路由器实例
 * HMR 将由编译器注入 createHMRProxy 自动处理局部重绘。
 */
mountWithRouter("#root", router);
