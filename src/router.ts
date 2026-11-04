/**
 * @module router
 * @description 路由子路径：`jsr:@dreamer/view/router`。
 *
 * **3.0：** 路由 API **仅**从此子路径导出（主入口不再 re-export）。
 */

export {
  createRouter,
  type CreateRouterOptions,
  Link,
  matchRoute,
  mountWithRouter,
  parseRouterUrl,
  type RouteConfig,
  type RouteLocation,
  type RouteMatch,
  type Router,
  useRouter,
} from "./integrations/router.ts";
