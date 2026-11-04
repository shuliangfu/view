/**
 * @module integrations/router
 * @description SPA 路由：History、`:` 动态段、末尾 `/*` 捕获、`basePath`、全局 `<a>` 冒泡委托、`beforeEach`、滚动策略、`subscribe`/`destroy`。
 *
 * **模块边界（P1-4，非破坏拆分）：**
 * - `./router/match.ts` — 纯函数 `parseRouterUrl` / `matchRoute`（无 history）
 * - `./router/history.ts` — `createRouter` / `useRouter`（History + SSR 模式）
 * - `./router/link.ts` — `Link` / `mountWithRouter`
 * - `./router/types.ts` — 公共类型
 *
 * **用法：**
 * - `createRouter(routes)` — 简写，等价于 `createRouter({ routes })`
 * - `createRouter({ routes, basePath?, notFound?, scroll?, interceptLinks?, beforeEach? })`
 *
 * **页面组件 props：** `{ params, query }`（`query` 为扁平对象，重复键后者覆盖）
 *
 * **导入：** `import { createRouter, Link, mountWithRouter, useRouter } from "@dreamer/view/router"`
 *
 * **`navigate` / `replace`：** 返回 `Promise<void>`，在 `beforeEach` 与 `pushState`/`replaceState` 提交完成后 resolve。
 *
 * **metadata：** 路由表中的 `metadata`（来自页面 `export const metadata` 与 codegen）在命中变化时由框架同步到 `document.title` 与对应 `<meta>`（与 v1.3.9 行为一致）。
 *
 * **SSR 同构：**
 * - `createRouter({ routes, url, ssr: true })` — 用 `url` 作初始位置，不挂 popstate/链接委托
 * - 在 `renderToString` 作用域内创建时自动 `ssr` 行为（`isSsrDomScopeActive`）
 * - 纯函数 {@link matchRoute} / {@link parseRouterUrl} 供无 Router 实例时匹配
 * - `@dreamer/view/ssr` 的 `renderRouterToString` 一站式串行渲染并 `destroy`
 *
 * **仍未覆盖：** 路由级动画、`popstate` 上的异步守卫、嵌套路由树配置 API。
 *
 * @usage
 * ```ts
 * const router = createRouter({
 *   basePath: "/app",
 *   routes: [
 *     { path: "/", component: Home },
 *     { path: "/user/:id", component: UserPage },
 *     { path: "/files/*", component: Files },
 *   ],
 *   notFound: { path: "*", component: NotFound },
 *   scroll: "top",
 *   beforeEach: (to) => to.params.id !== "0",
 * });
 * mountWithRouter("#root", router);
 *
 * // SSR：
 * // import { renderRouterToString } from "@dreamer/view/ssr";
 * // const html = renderRouterToString({ routes, url: req.url });
 * ```
 */

export type {
  CreateRouterOptions,
  RouteConfig,
  RouteLocation,
  RouteMatch,
  Router,
} from "./router/types.ts";

export { matchRoute, parseRouterUrl } from "./router/match.ts";

export { createRouter, useRouter } from "./router/history.ts";

export { Link, mountWithRouter } from "./router/link.ts";
