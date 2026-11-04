# P1-4：Router 拆分 match／history／Link + SSR 同构加强

> **状态：** Unreleased（2.x 非破坏）  
> **约束：** 对外 API／行为不变；禁 JSR／npm；不放宽 size／consumer-bundle／E2E 断言。

## 模块边界

原 `src/integrations/router.ts` 单体拆为：

| 模块 | 路径 | 职责 |
|------|------|------|
| **types** | `src/integrations/router/types.ts` | `RouteConfig`／`RouteLocation`／`RouteMatch`／`CreateRouterOptions`／`Router` |
| **match** | `src/integrations/router/match.ts` | 纯函数 `parseRouterUrl`／`matchRoute` 与路径编译；**无** history／单例 |
| **history** | `src/integrations/router/history.ts` | `createRouter`／`useRouter`：History、委托、`navigate`／`render`、SSR 模式 |
| **link** | `src/integrations/router/link.ts` | `Link`／`mountWithRouter` |

`src/integrations/router.ts` 仍为 **barrel**（与 `jsr:@dreamer/view/router`／主入口 re-export 相同公开面）。

## SSR 同构（推荐用法）

1. **预匹配／数据预取（无实例）：**
   ```ts
   import { matchRoute } from "@dreamer/view/router";
   const m = matchRoute(routes, req.url);
   // m?.params / m?.query / m?.pattern
   ```
2. **一站式串行 HTML：**
   ```ts
   import { renderRouterToString } from "@dreamer/view/ssr";
   const html = renderRouterToString({ routes, url: req.url });
   ```
3. **手写同构：** `createRouter({ routes, url, ssr: true })` → `renderToString(() => router.render())` → `router.destroy()`。  
   `ssr: true`（或处于 `renderToString` DOM 作用域／`VIEW_SSR`）时**不**挂 `popstate`／`<a>` 委托。客户端 hydrate 后可用默认 `createRouter`，或对已有实例调用 `router.start()`。

**保证：** 同一 `routes`＋`url` 下，`matchRoute(...)` 与 `createRouter({ url, ssr: true }).match()` 的 `path`／`pattern`／`params`／`query`／`pathname` 一致（见 `tests/unit/integrations/router-ssr.test.ts`）。

## 非目标（仍 HOLD）

- 嵌套路由树配置 API、路由级动画、`popstate` 异步守卫
- 3.0 破坏性主入口瘦身
