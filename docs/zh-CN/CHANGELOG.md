# 变更日志

@dreamer/view 的变更均记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [1.0.0-beta.29] - 2026-02-13

### 变更

- **init：** 路由页模板（home、about、not-found）改为单一直接默认导出
  （`export default function Home() { ... }`），避免动态加载时报「data.default
  不是一个函数」。

### 文档

- **Router：**
  说明每个路由文件必须默认导出页面组件，否则运行时可报「data.default
  不是一个函数」。

---

## [1.0.0] - 2026-02-12

### 新增

- **核心**
  - `createSignal(initialValue)` — 响应式 signal，getter/setter；在 effect
    中读取会登记依赖。
  - `createEffect(fn)` — 副作用，依赖的 signal 变化时重新执行（微任务）；返回
    dispose；支持 `onCleanup`。
  - `createMemo(fn)` — 派生值，依赖变化时重新计算并缓存。
  - `createRoot(fn, container)` / `render(fn, container)` — 挂载响应式根；细粒度
    DOM 更新，不整树替换。
  - `renderToString(fn, options?)` — SSR/SSG 输出 HTML；可选
    `allowRawHtml: false` 对 v-html 转义。
  - `hydrate(fn, container)` — 在服务端已有 HTML 的容器上激活，挂载事件与
    effect。
  - `generateHydrationScript(options?)` —
    为混合应用注入初始数据与可选客户端脚本。
  - `isDOMEnvironment()` — 检测是否存在 DOM，用于 SSR/CSR 分支。

- **Store**（`@dreamer/view/store`）
  - `createStore(config)` — 响应式 store，支持 `state`、可选
    `getters`、`actions` 与 `persist`（如 localStorage）。

- **Reactive**（`@dreamer/view/reactive`）
  - `createReactive(initial)` — 用于表单 model 的代理对象；在 effect
    中读取会追踪，赋值会触发更新。

- **Context**（`@dreamer/view/context`）
  - `createContext(defaultValue)` — 返回 `Provider`、`useContext` 与
    `registerProviderAlias`，用于跨层注入。

- **Resource**（`@dreamer/view/resource`）
  - `createResource(fetcher)` — 异步数据 getter，返回
    `{ data, loading, error, refetch }`。
  - `createResource(source, fetcher)` — source getter 变化时自动重新请求。

- **Router**（`@dreamer/view/router`）
  - `createRouter(options)` — 基于 History 的 SPA
    路由：路由表、basePath、链接拦截、`beforeRoute`/`afterRoute`、notFound、`back`/`forward`/`go`、meta。

- **Boundary**（`@dreamer/view/boundary`）
  - `Suspense` — 在 Promise 或 getter 解析前的 fallback 占位。
  - `ErrorBoundary` — 捕获子树错误并渲染 fallback(error)。

- **指令**（`@dreamer/view/directive`）
  - 内置：`vIf`、`vElse`、`vElseIf`、`vFor`、`vShow`、`vOnce`、`vCloak`（JSX
    中驼峰）。
  - 自定义指令：`registerDirective(name, { mounted, updated, unmounted })`。
  - 辅助：`hasDirective`、`getDirective`、`directiveNameToCamel`、`directiveNameToKebab`、`getDirectiveValue`、`hasStructuralDirective`、`createBinding`
    等。
  - 表单双向绑定：使用 `value` + `onInput`/`onChange` 配合 signal 或
    createReactive，无需 v-model 指令。

- **流式 SSR**（`@dreamer/view/stream`）
  - `renderToStream(fn, options?)` — 返回 HTML 字符串生成器，用于流式响应。

- **JSX**
  - 通过 `@dreamer/view`（jsx-runtime）提供 `jsx`/`jsxs` 与 `Fragment`；可通过
    `jsxImportSource` 配置。

- **DOM**
  - 细粒度更新：动态子节点（getter）、带 key 的列表协调、vShow 等指令的 getter
    在 effect 中更新。
  - 事件：`onClick`、`onInput`、`onChange` 等通过 addEventListener 绑定。
  - Ref：回调或 `{ current }` 在挂载后获取 DOM 引用。
  - SVG 命名空间与指令应用顺序（vShow 等指令，再通用 props）。

### 说明

- 无虚拟 DOM；更新由 signal/store/reactive 的订阅驱动。
- 根组件为响应式；在根函数中读取 signal 会触发重新展开与 patch，而非整树替换。
- 所有 API 支持 Deno/JSR；示例与测试在适用处使用 `@dreamer/test` 与 happy-dom。

[1.0.0]: https://github.com/dreamer-jsr/view/releases/tag/v1.0.0
