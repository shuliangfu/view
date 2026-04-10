# 变更日志

@dreamer/view 的变更均记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [2.0.1] - 2026-04-10

### 新增

- **`RefObject<T>`**：**`current`** 必存在（初始可为 `null`）；**`createRef`**
  现返回 **`RefObject<T>`**，便于类型收窄。
- **`MaybeAccessor<T>`** 与 **`readAccessor`**：控制流入参可为**静态值**、**零参
  getter** 或 **`createSignal` 元组 getter**；用于
  **`Show`**、**`For`**、**`Index`**、**`Match`**、
  **`ErrorBoundary.resetKeys`**。
- 主包再导出 **`isSignal`**、**`readAccessor`**、**`unwrap`**，供组件库与
  `insert` 对 Signal/函数的判定保持一致。
- **`@dreamer/view/jsx-runtime`** 与 **`jsx` 一并再导出 **`createRef`**、**
  `getDocument`**， 仅打 JSX 子路径时也可使用 ref 容器。
- **`createRef` / `getDocument` JSDoc** 与 **`mod.ts`** 架构说明补充。

### 修复

- **`insert`（数组）**：子项**依次插入真实父节点**，不再经
  **`DocumentFragment`** 中转（fragment 进文档后会被搬空，Effect
  仍指向已脱离文档的 fragment，导致多节点场景 如密码多行不可见等问题）。
- **数组段**：尾锚注释 **`<!--view:array-end-->`** + **`WeakMap`**
  记录首节点，响应式重跑时 整段摘除/替换；文档说明勿再套 **`display:contents`
  壳**（会破坏 Tailwind **`space-y-*`**、 **`:first-child`**
  等）；**`<details>`** 多子路径保证 **`summary`** 为首个**元素**子节点，
  满足内容模型。
- **事件委托**：**`onMouseEnter` / `onMouseLeave` / `onPointerEnter` /
  `onPointerLeave`** 改为元素上 **直连 `addEventListener`**（上述事件不冒泡到
  `document`**）。
- **DOM 属性**：**`id`**、**`name`**、**`for`** 等在值为 **`undefined` /
  `null`** 时 **移除特性**，避免浏览器写成字面量 **`"undefined"`**（破坏 label
  与表单语义）。

### 变更

- **`ViewRefObject`**：标明为宽松形态（**`current`** 可选）；**`RefObject`** 为
  **`createRef`** 的严格返回类型。

### 测试

- 补充
  **`insert`**（数组、**`<details>`**）、**`props`**（非冒泡事件、移除属性）、
  **`dom`/ref**、**控制流 `MaybeAccessor`** 等单元测试。

## [2.0.0] - 2026-04-06

本版本将 **2.0.0** 作为文档与发布基线。下文按能力维度**汇总框架提供的功能**（与
1.x 逐条差异无关）。

### 响应式与状态

- **Signal**：同一返回值支持 **`.value`**、调用式 **`s()` / `s(x)`**、元组解构
  **`const [get, set] = createSignal(initial)`**；可选**具名信号**便于
  HMR/调试。
- **Effect**：**`createEffect`**、偏同步的 **`createRenderEffect`**（响应式 DOM
  属性等）；依赖收集与 Owner 上的清理。
- **Memo**：**`createMemo`** 与别名 **`memo`**。
- **批处理与调度**：**`batch`**、**`untrack`**，以及 **`scheduler/batch`**、
  **`scheduler/priority`** 的微任务/优先级排空。
- **生命周期与错误**：**`onMount`**、**`onCleanup`**、**`onError`**、
  **`catchError`**，与 **ErrorBoundary**、Owner 冒泡配合。
- **延迟与过渡**：**`createDeferred`**、**`useTransition`**、
  **`startTransition`**。
- **Selector**：**`createSelector`**，列表选中态等按 key 缓存，避免整表重算。
- **Context**：**`createContext`**、**`Provider`**、**`useContext`**（透明
  Provider，不新建 Owner）。
- **Store**：深度代理、**`setState`**、**`produce`**、**`reconcile`**，可选
  **具名单例**与 **persist**（**`key`**、**`storage`**、**`serialize`** /
  **`deserialize`**）；数组根状态有独立更新路径。

### 运行时与 DOM

- **无虚拟 DOM**：JSX 为 Thunk；**`insert(parent, value, current?, before?)`**
  做细粒度 DOM 更新与订阅。
- **`template` / `walk`**：静态 HTML 克隆与路径寻址，供编译产物与高级用法。
- **属性与事件**：**`setProperty`**、**`spread`**、**`setAttribute`**，委托事件与
  受控输入；**`getDocument`**、**`createRef`** 安全访问文档与 ref。
- **挂载**：**`mount`**（清空容器、处理 **`data-view-cloak`**）、**`hydrate`**
  （可选编译器 **binding map**）；**`createRoot` + `insert`** 拿 **`dispose`**
  做整树卸载。

### 控制流与异步 UI

- **组件**：**`Show`**、**`For`**、**`Index`**、**`Switch` / `Match`**、
  **`Dynamic`**、**`lazy`** + **`Suspense`**。
- **异步数据**：**`Suspense`**、**`createResource`**（含 **`source + fetcher`**
  重载），loading/error、**`mutate` / `refetch`**；含 **ErrorBoundary** 恢复后
  对新边界的再注册。
- **错误边界**：**`ErrorBoundary`**，**`fallback`**、**`reset`**、**`resetKeys`**。
- **传送门**：声明式 **`Portal`** 与命令式 **`createPortal`**（亦可从
  **`@dreamer/view/portal`** 单独引用）。

### 路由、配置与 CLI

- **SPA 路由**：**`createRouter`**、**`mountWithRouter`**、**`Link`**、
  **`useRouter`**、**`navigate` /
  `replace`**，动态段、尾缀捕获、**`beforeEach`**、
  **`basePath`**、滚动行为、可选同源 **`a`** 委托、**`router.render()`** 做布局
  嵌套。
- **文件式工程**（**`view-cli init`**）：**`view.config.ts`**、**`src/views/`**
  约定（**`_app`**、**`_layout`**、**`_loading`**、**`_404`**、**`_error`**），由
  扫描生成的 **`src/router/routers.tsx`**，支持
  **`routePath`**、**`metadata`**、 **`inheritLayout`**、**`loading`**
  等静态解析（扫描器不依赖 JSX 环境的动态 **`import()`**）。
- **服务端辅助**：**`loadViewConfig`**、布局链、**`generateRoutersFile`**、
  **`createApp`**，dev/prod 服务与构建编排（见 **`server/core`**）。
- **全局 CLI**：安装 **`deno run -A jsr:@dreamer/view/setup`** 后使用
  **`view-cli init | dev | build | start | upgrade | update | version`**；CLI
  与框架文案内置 **i18n**。
- **CSR 客户端构建映射**：**`toClientConfig`** 将 **`view.config` 的
  `build.sourcemap`** （**`boolean` 或对象**）传入 **`@dreamer/esbuild` 的
  `ClientConfig.sourcemap`**； 仅在布尔或未配置时写入
  **`bundle.sourcemap`**，避免对象形式的 map 配置被压成 **`true`**，保证生产构建
  source map 选项生效（**`dev`** 仍为 HMR 强制 sourcemap）。

### 表单

- **`createForm`**：**`field(name)`**（**`value` + `onInput`**），可选
  **`rules`**、 **`validate` / `validateField`**、**`validateOn`**（**`submit` /
  `change` / `blur`**）、**`handleSubmit`**、**`reset`**，Store 型 **`data` /
  `errors`**，**`produce`** 更新。

### 编译器、优化与 SSR

- **`@dreamer/view/compiler`**：**`compileSource`**、**`transformJSX`**，DOM/SSR
  生成、水合标记、HMR 包装注入，分析器与路径生成、指令转换等。
- **`@dreamer/view/optimize`**：**`optimize`** 压缩 **`template("…")`** 字面量，
  **`createOptimizePlugin`** 接入 esbuild。
- **`@dreamer/view/ssr`**：**`renderToString`**、**`renderToStringAsync`**、
  **`renderToStream`**、**`generateHydrationScript`**，极简 SSR **`document`**
  与 **`enterSSRDomScope` / `leaveSSRDomScope`**、**`queueSsrAsyncTask`**、
  **`registerSSRPromise`**、**`isServer`** 等。

### 开发体验

- **HMR**：**`createHMRProxy`**（**`VIEW_DEV`** 下由 CLI/编译注入为主）。
- **JSX 运行时**：**`jsx` / `jsxs` / `Fragment`** 与 dev 入口，兼容 Deno/Bun 对
  **`jsxDEV`** 的解析需求。
- **类型**：**`@dreamer/view/types`** 导出 **`VNode`**、**`JSXRenderable`**
  等公共类型。

### 已发布的子路径（与 JSR `deno.json` 一致）

**`.`**、**`./types`**、**`./cli`**、**`./setup`**、**`./jsx-runtime`**、
**`./jsx-dev-runtime`**、**`./portal`**、**`./compiler`**、**`./optimize`**、
**`./ssr`**。除单独子路径说明外，上述能力均可从**主入口**使用。

### 破坏性变更

- **npm `package.json` 的 `exports`**：移除
  **`./csr`**、**`./hybrid`**（仅指向主 入口的别名），请改用主包导出；新增
  **`./portal`** 与 JSR 对齐。
