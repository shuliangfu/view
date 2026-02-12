# View 包 API 示例覆盖分析

本文档对照 `@dreamer/view` 及其子路径的**公开
API**，说明示例项目（examples）中哪些已有示例、哪些尚未覆盖。

---

## 一、主入口（@dreamer/view）

| API                                                         | 说明                                    | 示例覆盖  | 所在页/文件                                                         |
| ----------------------------------------------------------- | --------------------------------------- | --------- | ------------------------------------------------------------------- |
| `createSignal`                                              | 响应式单元                              | ✅        | Signal、Store、Resource、Context、Runtime、Directive、Boundary、App |
| `createEffect`                                              | 副作用，依赖变化时重新执行              | ✅        | Signal（+ onCleanup）、App（router.subscribe）                      |
| `createMemo`                                                | 派生值缓存                              | ✅        | Signal（double）                                                    |
| `onCleanup`                                                 | effect 内注册清理函数                   | ✅        | Signal（模块内 setTimeout/clearTimeout）                            |
| `createRoot`                                                | 创建响应式根并挂载                      | ✅        | main.tsx 入口；Runtime 页有说明                                     |
| `render`                                                    | 等同 createRoot                         | ✅        | Runtime 页文案说明                                                  |
| `renderToString`                                            | SSR 输出 HTML 字符串                    | ✅        | Runtime 页（输入 + 点击「生成 HTML」）                              |
| `hydrate`                                                   | Hybrid 激活（服务端 HTML + 客户端激活） | ⚠️ 仅文案 | Runtime 页仅文字说明，未实际跑 hydrate                              |
| `generateHydrationScript`                                   | Hybrid 注入脚本 HTML                    | ⚠️ 仅文案 | Runtime 页仅说明，未在示例中注入                                    |
| `getCurrentEffect` / `setCurrentEffect`                     | 内部/高级                               | -         | 框架内部用，一般不写示例                                            |
| `isSignalGetter`                                            | 判断是否为 signal getter                | -         | 框架内部用                                                          |
| `isDOMEnvironment`                                          | 是否 DOM 环境                           | -         | 框架内部用                                                          |
| 类型：`VNode` / `Root` / `SignalTuple` / `EffectDispose` 等 | 类型定义                                | ✅        | 各页 JSX 与 Root 使用                                               |

**结论**：核心 API 除 `hydrate`、`generateHydrationScript`
未实际运行外，其余均有示例或入口使用。

---

## 二、Store（@dreamer/view/store）

| API                                                             | 说明                                          | 示例覆盖 | 所在页                                         |
| --------------------------------------------------------------- | --------------------------------------------- | -------- | ---------------------------------------------- |
| `createStore`                                                   | 创建 store（state + getters + actions）       | ✅       | Store 页                                       |
| `state`                                                         | 初始状态                                      | ✅       | Store 页                                       |
| `getters`                                                       | 派生只读                                      | ✅       | Store 页（double、greeting）                   |
| `actions`                                                       | 方法（get/set 注入）                          | ✅       | Store 页（increment、reset、setName）          |
| `persist`                                                       | 持久化（key、storage、serialize/deserialize） | ✅       | Store 页（localStorage，key: view-demo-store） |
| 类型：`StorageLike` / `PersistOptions` / `CreateStoreConfig` 等 | 类型                                          | ✅       | 与上述用法一致                                 |

**结论**：Store 相关 API 已全部在 Store 页演示。

---

## 三、Boundary（@dreamer/view/boundary）

| API                                            | 说明                                | 示例覆盖 | 所在页                                                     |
| ---------------------------------------------- | ----------------------------------- | -------- | ---------------------------------------------------------- |
| `ErrorBoundary`                                | 错误边界，fallback(error)           | ✅       | Boundary 页（故意抛错 + 捕获）                             |
| `Suspense`                                     | 异步边界，fallback + Promise 子节点 | ✅       | Boundary 页（异步内容）；Resource 页（Suspense + Promise） |
| `isErrorBoundary` / `getErrorBoundaryFallback` | 内部/框架用                         | -        | 不要求示例                                                 |

**结论**：ErrorBoundary、Suspense 均有示例。

---

## 四、指令（@dreamer/view/directive）

| 能力                                                             | 说明                                 | 示例覆盖 | 所在页                                   |
| ---------------------------------------------------------------- | ------------------------------------ | -------- | ---------------------------------------- |
| `registerDirective`                                              | 注册自定义指令                       | ✅       | Directive 页（v-focus）                  |
| `vIf` / `v-if`                                                   | 条件渲染                             | ✅       | Directive 页（A/B/C 切换）               |
| `vElseIf` / `v-else-if`                                          | 多分支                               | ✅       | Directive 页                             |
| `vElse` / `v-else`                                               | 否则分支                             | ✅       | Directive 页                             |
| `vFor` / `v-for`                                                 | 列表渲染                             | ✅       | Directive 页（列表 + 追加一项）          |
| `vShow` / `v-show`                                               | 显隐（display）                      | ✅       | Directive 页                             |
| `vText` / `v-text`                                               | 文本绑定                             | ✅       | Directive 页                             |
| `vHtml` / `v-html`                                               | 原始 HTML                            | ✅       | Directive 页（含输入 + 生成 HTML）       |
| `vModel` / `v-model`                                             | 双向绑定（input/textarea/select）    | ✅       | Directive 页（文本 + 复选框）            |
| `getModelFromProps`                                              | 自定义组件内取 v-model 的 [get, set] | ✅       | Directive 页（DropdownList、RadioGroup） |
| 其它：directiveNameToCamel/Kebab、getDirective、createBinding 等 | 工具/内部                            | -        | 一般不单独示例                           |

**结论**：常用指令（含 v-model）及自定义指令注册均有示例。

---

## 五、Resource（@dreamer/view/resource）

| API                                       | 说明                           | 示例覆盖 | 所在页                               |
| ----------------------------------------- | ------------------------------ | -------- | ------------------------------------ |
| `createResource(fetcher)`                 | 无 source，refetch 手动请求    | ✅       | Resource 页（重新请求）              |
| `createResource(source, fetcher)`         | 有 source，source 变化自动请求 | ✅       | Resource 页（id=1/2/3）              |
| 返回：`{ data, loading, error, refetch }` | 资源状态                       | ✅       | Resource 页（加载中/错误/data 展示） |
| 类型：`ResourceResult<T>`                 | 类型                           | ✅       | 同上                                 |

**结论**：createResource 两种用法及与 Suspense 配合均有示例。

---

## 六、Context（@dreamer/view/context）

| API                            | 说明       | 示例覆盖 | 所在页                        |
| ------------------------------ | ---------- | -------- | ----------------------------- |
| `createContext(defaultValue)`  | 创建上下文 | ✅       | Context 页                    |
| `Provider`（value + children） | 提供值     | ✅       | Context 页（theme）           |
| `useContext()`                 | 消费上下文 | ✅       | Context 页（light/dark 切换） |

**结论**：Context 全流程已有示例。

---

## 七、Router（@dreamer/view/router）

| API                                              | 说明            | 示例覆盖 | 所在页/文件                              |
| ------------------------------------------------ | --------------- | -------- | ---------------------------------------- |
| `createRouter(options)`                          | 创建路由器      | ✅       | main.tsx                                 |
| `routes` / `notFound` / `basePath`               | 路由表与 404    | ✅       | routes.tsx、main.tsx                     |
| `interceptLinks`                                 | 拦截 <a> 点击   | ✅       | main.tsx（true）                         |
| `router.start()`                                 | 启动监听        | ✅       | main.tsx                                 |
| `router.getCurrentRoute()`                       | 当前匹配        | ✅       | App.tsx、Router 页                       |
| `router.subscribe(cb)`                           | 订阅路由变化    | ✅       | App.tsx（createEffect 内）               |
| `router.navigate(path, replace?)`                | 编程式导航      | ✅       | Router 页（按钮 + 输入框导航）           |
| `router.replace(path)`                           | 替换当前历史    | ✅       | Router 页                                |
| `router.back()` / `forward()` / `go(delta)`      | 浏览器前进/后退 | ✅       | Router 页                                |
| `router.href(path)`                              | 生成完整 href   | ✅       | Router 页（展示 router.href("/signal")） |
| `router.stop()`                                  | 停止监听        | ❌       | 未示例（通常仅在卸载时用）               |
| `beforeRoute`                                    | 前置守卫        | ✅       | main.tsx（/router-redirect → /router）   |
| `afterRoute`                                     | 后置守卫        | ✅       | main.tsx（设置 document.title）          |
| 动态路由 `:param`、`match.params`、`match.query` | 路径与查询参数  | ✅       | Router 页「动态路由」说明与示例          |

**结论**：路由相关 API 除 `router.stop()` 外均已覆盖；动态路由在 Router
页以说明与示例展示。

---

## 八、Runtime 进阶（SSR / Hybrid / Stream）

| API                                                  | 说明           | 示例覆盖                                                        |
| ---------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `renderToString(fn, options?)`                       | SSR 输出字符串 | ✅ Runtime 页                                                   |
| `hydrate(fn, container)`                             | 客户端激活     | ⚠️ 仅 Runtime 页文字说明，未在示例中实际运行（需完整 SSR 环境） |
| `generateHydrationScript(options)`                   | 注入脚本片段   | ✅ Runtime 页（实际调用并展示生成结果）                         |
| `renderToStream`（view/stream）                      | 流式 SSR       | ✅ Runtime 页（代码示例与说明，服务端使用）                     |
| `optimize` / `createOptimizePlugin`（view/compiler） | 构建时源码优化 | ❌ 不写示例（构建时工具，不适合浏览器示例）                     |

**结论**：SSR、generateHydrationScript、renderToStream 用法均已示例；hydrate
需完整 SSR 环境，仅保留说明。

---

## 九、JSX / 运行时

| 能力           | 说明                      | 示例覆盖                                              |
| -------------- | ------------------------- | ----------------------------------------------------- |
| `jsx` / `jsxs` | 运行时（jsxImportSource） | ✅ 所有页通过 JSX 编译使用                            |
| `Fragment`     | 片段                      | ✅ 各页多处使用（如列表、条件多子节点），未单独“教学” |

**结论**：JSX 与 Fragment 在示例中均有使用，无单独卡片。

---

## 十、总结表

| 模块                                     | 已覆盖                                                                                                                                     | 未覆盖或仅说明                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 主入口（signal/effect/memo/root/render） | createSignal、createEffect、createMemo、onCleanup、createRoot、render、renderToString                                                      | hydrate 仅说明（需完整 SSR 环境）   |
| Store                                    | createStore、state、getters、actions、persist                                                                                              | -                                   |
| Boundary                                 | ErrorBoundary、Suspense                                                                                                                    | -                                   |
| Directive                                | registerDirective、vIf/vElse/vElseIf/vFor/vShow/vText/vHtml、自定义指令                                                                    | -                                   |
| Resource                                 | createResource(无/有 source)、与 Suspense 配合                                                                                             | -                                   |
| Context                                  | createContext、Provider、useContext                                                                                                        | -                                   |
| Router                                   | createRouter、start、getCurrentRoute、subscribe、navigate、replace、back/forward/go、href、beforeRoute、afterRoute、动态 :param（User 页） | router.stop() 未示例                |
| Runtime 进阶                             | renderToString、generateHydrationScript（实际输出）、renderToStream（代码示例）                                                            | hydrate 未实际跑；compiler 不写示例 |

---

## 十一、说明

- **hydrate**：需服务端先输出 HTML 再加载客户端脚本并调用 hydrate，当前示例为
  SPA 入口，仅保留文案说明。
- **router.stop()**：一般在应用卸载时调用，示例中未单独演示。
- **compiler（optimize /
  createOptimizePlugin）**：构建时工具，不适合在浏览器示例中体现。

当前示例已覆盖 **所有适合在浏览器中演示** 的 view API。
