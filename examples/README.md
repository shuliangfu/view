# @dreamer/view 多页面示例

本示例使用 **内置 router**（`@dreamer/view/router`）实现多页面无刷新切换，覆盖
view 包主要 API。

- **路由**：首页
  `/`、`/signal`、`/store`、`/boundary`、`/directive`、`/resource`、`/context`、`/runtime`，未匹配走
  404 兜底。
- **模式**：**history**（路径如 `/signal`、`/runtime`），链接为
  `<a href="/path">`，由 router 拦截实现 SPA 跳转。
- **刷新与直链**：本地使用 `deno task serve` 会启动带 **SPA fallback**
  的服务（`server.ts`），任意路由刷新或直接打开都会返回 `index.html`，由前端
  router 正确渲染对应页面。

## 运行方式

```bash
cd view/examples
deno task bundle    # 构建 dist/main.js
deno task serve     # 启动静态服务（默认 8787，支持 SPA fallback）
# 浏览器打开 http://localhost:8787 或 http://localhost:8787/runtime 等，刷新也正常
```

或一键：`deno task dev`（先 bundle 再
serve）。切换页面使用顶部导航或首页链接；在任意路由下刷新或直接访问该 URL
均可正常显示。

## 示例结构

| 序号 | 模块     | 说明                                                              |
| ---- | -------- | ----------------------------------------------------------------- |
| 1    | 核心     | createSignal、createEffect、createMemo、onCleanup                 |
| 2    | Store    | createStore（getters、actions、persist）                          |
| 3    | Boundary | ErrorBoundary、Suspense                                           |
| 4    | 指令     | vIf、vElse、vElseIf、vFor、vShow、vText、vHtml、自定义（v-focus） |
| 5    | Resource | createResource（无/有 source）、Suspense                          |
| 6    | Context  | createContext、Provider、useContext                               |
| 7    | Runtime  | createRoot、render、renderToString、generateHydrationScript       |

## 依赖说明

示例通过 `deno.json` 的 `imports` 将 `@dreamer/view` 等指向上级
`../src`，因此需在 **view 仓库内** 运行；发布到 JSR 后，用户可改为
`jsr:@dreamer/view` 等。
