/**
 * @module router
 * @description 路由子路径：`jsr:@dreamer/view/router`。
 *
 * 与主入口导出的 router API 相同；仅路由场景时可避免拉入 form 等其它集成。
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
