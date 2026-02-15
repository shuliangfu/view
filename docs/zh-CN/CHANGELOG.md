# 变更日志

@dreamer/view 的变更均记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [1.0.10] - 2026-02-15

### 变更

- **依赖：** 将 `@dreamer/esbuild` 升级至 `^1.0.24`（Windows CI
  解析器修复：`deno info` 使用相对入口路径与原生 cwd）。

---

## [1.0.9] - 2026-02-15

### 修复

- **vIf/vShow 指令导致的 input/textarea value 问题。** 在
  `applySingleProp`（props.ts）中， 表单 `value` 改为在通用的 `value == null`
  分支之前处理。vIf/vShow 切换时 patch 传入 `undefined` 或 `null` 时，会正确清空
  DOM 输入框的值，而不会跳过 value 分支导致仍显示旧值。

### 新增

- **测试：** 扩展单元测试：**applyProps**（ref、vShow/vCloak、value/checked
  响应式、事件、class、style、attribute、自定义指令 — 55
  条），**store**（persist 边界、getters/actions、同一 key 实例、setState
  updater、Proxy ownKeys — 29 条），**meta**（getMetaHeadFragment 与
  applyMetaToHead 边界 — 21 条），**compiler**（常量折叠除数为 0/取模为
  0、一元加号、.tsx、onLoad catch — 13 条）。集成 14 条、E2E 浏览器 52 条。合计
  **381 条**，全部通过（约 2 分钟）。

### 变更

- **props.ts：** 移除调试 log 与未使用的 `_isFocusedFormElement`。测试报告与
  README 已更新为 381 条。

---

## [1.0.8] - 2026-02-13

### 修复

- **SSR：子节点为普通函数。** 在 `normalizeChildrenForSSR`（stringify.ts）中，
  当子节点为普通函数（非 signal getter）时改为先执行再对返回值做规范化，不再
  直接字符串化。修复了 hybrid/SSR 首屏把 JS 函数源码当 HTML 输出的问题。
- **getter 返回单个 Fragment 时 input 不丢焦点。** 在 `appendDynamicChild`
  （element.ts）中，当规范化后的动态子节点仅有一项且为 Fragment 时，将该
  Fragment 展开为多项再参与 reconcile，使 lastItems 与 DOM 槽位一致，不再误删 /
  替换含 input 的节点，输入框保持焦点。

### 新增

- **测试：** 扩展 renderToString / renderToStream 的 SSR 分支与边界用例；集成
  测试：getter 返回 Fragment 内 input 在 signal 更新后仍为同一 DOM 节点（不丢
  焦点）。测试报告与 README 已更新为 290 条、约 1m37s。

---

## [1.0.7] - 2026-02-13

### 修复

- **appendDynamicChild（无 key）：** 改为用 `lastItems` 做 reconcile，不再每次
  getter 重跑都整块 `replaceChildren`。动态 getter 内的受控 input（如
  `value={input()}`）输入时不再丢失焦点。
- **patchNode：** Fragment 对 Fragment 时在父节点上做子节点 reconcile；组件
  （function type）节点改为替换以重新执行并读取最新 context/signal；
  ContextScope 节点改为替换，使 Provider value 更新（如主题切换）能正确更新
  消费者 DOM。

---

## [1.0.6] - 2026-02-13

### 修复

- **Hydrate 时组件返回函数：** 当组件返回函数（如为细粒度更新写的
  `() => ( <> ... </> )`）时，hydrate 现将其视为动态槽：创建占位节点、替换 对应
  DOM 并调用 `appendDynamicChild`，而不再当作 VNode 递归，从而避免 HYDRATE
  渲染时报错 "Cannot use 'in' operator to search for 'vIf' in undefined"。
- **hasStructuralDirective：** 对 `null` 或非对象 `props`（如 hydrate 路径下
  传入的“函数 vnode”）安全处理，返回 `null` 而非抛错。

---

## [1.0.5] - 2026-02-14

### 新增

- **Init 模板 (home.tsx)：** v-if 演示区块 — 条件分支（count ≤ 2 → AAA，3～5 →
  BBB，否则 CCC），使用 getter 形式的 `vIf`/`vElseIf`/`vElse`，并配有区分色标签
  （翠绿 / 琥珀 / 灰）便于展示。

---

## [1.0.4] - 2026-02-14

### 变更

- **Init 模板 (home.tsx)：** 计数器使用模块顶层 `createSignal` 与 `{count}`
  展示（与示例项目一致），根 effect 不订阅 count，计数正常。
- **组件返回函数：** 组件返回 `() => VNode` 时，该槽位在独立 effect
  中渲染（expandVNode + createElement），组件体只执行一次，组件内 state（如
  createSignal）得以保持。
- **响应式 v-if：** 条件请用 getter，例如 `vIf={() => count() <= 2}`，仅 v-if 的
  effect 订阅 signal；使用 `vIf={count() <= 2}`
  会让根订阅并在更新时可能重置组件状态。

---

## [1.0.3] - 2026-02-13

### 新增

- **mount(container, fn, options?)** — 统一挂载 API，适用于 CSR、hybrid
  与全量入口。`container` 可为 CSS 选择器（如 `"#root"`）或 `Element`。在
  hybrid/全量下：若容器有子节点则 hydrate，否则 render。选项：`hydrate`（强制
  hydrate 或 render）、`noopIfNotFound`（选择器 查不到时返回空
  Root）。从主入口、`@dreamer/view/csr`、`@dreamer/view/hybrid`
  导出。一步到位减少 客户端入口分支与心智负担。
- **MountOptions** 类型 — `hydrate?: boolean`、`noopIfNotFound?: boolean`。
- **resolveMountContainer**（内部）— 将选择器解析为 Element；根据
  `noopIfNotFound` 在未找到时抛错或返回 null。
- **Root.forceRender** — `createRoot`/`render`（以及 `mount`）返回的 `Root`
  上提供 **forceRender()**，用于强制重跑一次根 effect
  并重渲染整树，适用于外部路由或其它非响应式状态源。

### 变更

- **createRoot / render：** 首次 append 后自动调用
  `removeCloak(container)`，无需在业务中手动移除 `data-view-cloak`。hydrate
  路径行为不变（原本即会 removeCloak）。
- **测试：** 为 mount 新增 6
  个单元测试（Element、选择器、noopIfNotFound、选择器缺失时抛错、hydrate
  路径、render 路径）。总用例数 262。
- **文档：** README（中英文）与 TEST_REPORT（中英文）补充 mount
  API、MountOptions 及 262 用例摘要。

---

## [1.0.2] - 2026-02-14

### 新增

- **createReactiveRoot(container, getState, buildTree)** — 创建由外部状态驱动的
  根：当 `getState()`（如 signal）的返回值变化时，会按新状态重新建树并在原地
  patch，不整树卸载。从主入口、`@dreamer/view/csr` 与 `@dreamer/view/hybrid`
  导出。适用于 SPA 外壳由外部维护页面/路由状态、View 只根据该状态渲染的场景。

### 变更

- **测试：** 为 createReactiveRoot 新增 5 个单元测试（初始挂载、signal 驱动
  patch、unmount 清理、对象状态 patch、unmount 后再 set 的边界）。总用例数 252。

- **文档：** 测试报告（中英文）与 README（中英文）补充 createReactiveRoot 说明、
  用法与示例。

---

## [1.0.1] - 2026-02-14

### 变更

- **文档：** 许可证徽章与 README 许可证说明由 MIT 改为 Apache-2.0；链接指向
  LICENSE 与 NOTICE。

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

- **编译器**（`@dreamer/view/compiler`）
  - 构建时优化：`optimize`、`createOptimizePlugin`，可配合 esbuild 等打包器
    （可选）。

- **CLI（view-cli）**
  - 全局安装：`deno run -A jsr:@dreamer/view/setup`；安装后可在任意目录使用
    `view-cli`。
  - `view-cli init [dir]` — 脚手架生成项目（views、view.config.ts、_app、
    _layout、_loading、_404、_error）。
  - `view-cli dev` — 构建并启动静态服务（开发模式）。
  - `view-cli build` — 仅构建（输出到 dist/）。
  - `view-cli start` — 仅启动静态服务（需先执行 build）。
  - `view-cli upgrade` — 将 @dreamer/view 升级到最新（加 `--beta` 使用 beta）。
  - `view-cli update` — 更新项目依赖与 lockfile（加 `--latest` 使用最新版本）。
  - `view-cli version` / `view-cli --version` — 显示版本。
  - `view-cli --help` — 显示完整帮助。

### 说明

- 无虚拟 DOM；更新由 signal/store/reactive 的订阅驱动。
- 根组件为响应式；在根函数中读取 signal 会触发重新展开与 patch，而非整树替换。
- 所有 API 支持 Deno/JSR；示例与测试在适用处使用 `@dreamer/test` 与 happy-dom。

[1.0.0]: https://github.com/dreamer-jsr/view/releases/tag/v1.0.0
