# 变更日志

@dreamer/view 的变更均记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [1.0.20] - 2026-02-18

### 修复

- **e2e init 测试**：在测试中调用 initMain 前先初始化 view i18n 并设置 locale 为
  zh-CN，使生成的 view.config.ts 包含翻译后注释（「view 项目配置」）。修复
  不经过 CLI 入口（如 CI）时未调用 initViewI18n 导致的失败。

---

## [1.0.19] - 2026-02-18

### 变更

- **i18n**：迁至 `src/cmd/`（i18n.ts 与
  locales），客户端入口（`mod.ts`）不再拉取服务端 代码。仅在 CLI
  入口（`cli.ts`、`setup.ts`）初始化；`mod.ts` 不再调用 `initViewI18n()`。`$t()`
  内不再调用 `ensureViewI18n()` 或设置 locale。

---

## [1.0.18] - 2026-02-17

### 新增

- **CLI i18n：** view-cli
  服务端国际化：`i18n.ts`、由环境变量（LANGUAGE/LC_ALL/LANG） 检测语言的
  `detectLocale()`、`ensureViewI18n()`、`$t()`；`en-US.json` 与 `zh-CN.json`
  覆盖 setup、serve、init、build、config、dev、HMR 等文案。
- **init 模板 i18n：** 所有 init 生成文件中的注释与 TSX 文案均使用
  `init.template.*` 键（view.config、main、_app、_layout、_loading、_404、
  _error、home、about、router、routers）；路由 metadata 标题与 `generate.ts`
  默认首页标题、路由表注释使用 `$t`。

### 变更

- **init：** 从 main.tsx 模板中移除多余的
  `container.removeAttribute("data-view-cloak")`（运行时已在首次 append 后调用
  `removeCloak`）。在「项目已创建」提示前增加空行。locale 中 `countLabelHigh`
  改为 `count &gt; 5` 以符合 TSX 语法。
- **generate：** `titleFromRelative` 与生成的路由表注释使用 `$t`；新增
  `generate.tsNocheckComment` 文案键。
- **build/config：** `getRoutePathForChangedPath` 与 `getBuildConfigForMode` 的
  JSDoc 参数说明改为英文。

---

## [1.0.17] - 2026-02-17

### 修复

- **setup：** deno install 的 spawn 使用 `stdin: "null"`，避免子进程等待终端
  输入；spawn 后立即调用 `child.unref()` 便于 setup 进程退出；入口在
  `installGlobalCli()` resolve 后调用 `exit(0)`，确保进程退出（否则 Deno 会因
  ref 不退出）。
- **upgrade：** 以 `stdin: "null"` spawn setup，spawn 后调用 `child.unref()`，
  成功时 `exit(0)`、失败时 `exit(1)`，使 CLI 在命令结束时退出。

---

## [1.0.16] - 2026-02-17

### 修复

- **upgrade 命令（Deno）：** 在 await spawn 的 status 后调用 `child.unref()`，使
  CLI 在安装子进程结束后能正常退出（与 dweb 一致，避免 Deno 下挂起）。

---

## [1.0.15] - 2026-02-17

### 新增

- **文档 – 链接拦截：** README（中英文）与 router 模块 JSDoc 现明确说明
  `interceptLinks: true` 时哪些 `<a>` 点击会被拦截、哪些不会：不拦截情形包括
  `target` ≠ `_self`、`download`、`data-native`、同页锚点（pathname+search
  相同且仅 hash）、hash 模式下 `#section`（与 `#/path`
  区分）、修饰键或非左键、跨域或非 http(s)、无效或空 `href`。中英文 README
  均增加表格与说明。

### 变更

- **测试报告与 README：** 更新为 435 个用例（router 40、integration 14）；英文与
  中文 README 的测试徽章与摘要表更新为 435 通过；测试日期 2026-02-17，
  报告内版本为 1.0.15。

---

## [1.0.14] - 2026-02-16

### 变更

- **Store：** 重写 `createStore` 实现：抽出 `makeActionContextProxy` 与
  `makeStoreObjectProxy`，在 getters/actions/asObject 各分支间复用 Proxy
  逻辑；重载与 API 不变。
- **Version：** 将 `getVersionCachePath` 内联到 `readVersionCache` 与
  `writeVersionCache`，删除该辅助函数以减小源码体积。
- **Router：** 新增 `buildMatch` 辅助函数，在 `matchPath` 中统一构建
  `RouteMatch`，去掉匹配与 notFound 两处重复的对象字面量。
- **DOM（element）：** 新增 `registerPlaceholderEffect` 与 `getItemKey`；
  `reconcileKeyedChildren` 现接受 `oldItems`，当 key 相同且存在旧 VNode 时 对
  wrapper 子节点做原地 `patchNode`，不再整块替换，减少 keyed 列表的 DOM 变动。
- **DOM（props）：** 在 `applySingleProp` 中，当 className、style（字符串与
  对象）、表单 value、checked/selected 及通用 attribute 的值与当前 DOM
  一致时跳过写入。
- **Directive：** 自定义指令的 `mounted` 在支持时改为通过 `queueMicrotask`
  执行（否则回退到 `setTimeout(..., 0)`），在元素入文档后 更早执行。
- **Runtime：** 根 effect 在根 VNode 引用未变（如 memo 或稳定引用）时跳过 expand
  与 patch，避免重复计算。

---

## [1.0.13] - 2026-02-16

### 新增

- **RoutePage match.getState(key, initial)：** 按 path 稳定的页面状态，页面组件
  可在组件体内使用 getState 写状态，点击仍能触发更新（无需缓存页面 VNode）。
  路由 path 变化时清理上一 path 的状态。
- **Router 类型：** 从 `@dreamer/view/router` 导出 `GetState` 与
  `RoutePageMatch`， 供使用 `match.getState` 的页面组件导入。
- **Portal 与 Transition：** 文档中补充并突出 Portal（渲染到指定容器）与
  Transition（显隐 + enter/leave class 与 duration）。
- **视图文件导入 CSS：** 视图与组件文件中可导入 CSS（如
  `import "../../assets/index.css"`）；默认内联进 JS，或配置
  `cssImport.extract: true` 产出独立 .css。

### 修复

- **文档：** README 与中文 README 的 createContext 示例将 `theme()` 改为
  `themeValue()`，避免 Tailwind 工具解析代码块时报 “'' does not exist in your
  theme config”。

---

## [1.0.12] - 2026-02-16

### 修复

- **view-cli upgrade 与 setup：** upgrade 命令与 setup 脚本此前以
  `stdout`/`stderr` 为 `"piped"` 启动子进程但未读取管道，子进程在管道写满后
  会阻塞，CLI 表现为卡住。现已改为 `stdout`/`stderr` `"null"`，输出被丢弃，
  安装完成后进程正常退出且不阻塞。

---

## [1.0.11] - 2026-02-15

### 修复

- **子节点：** JSX 子节点中的布尔值 `false` 和空字符串 `""`
  此前会被渲染成文本（"false" 或空文本节点），现已视为空并跳过，不再输出 DOM。

### 新增

- **isEmptyChild(value)：** `dom/shared.ts` 中的辅助函数；对
  `null`、`undefined`、`false`、`""` 返回 true，供客户端
  `normalizeChildren`（element.ts）与 SSR
  `normalizeChildrenForSSR`（stringify.ts）统一过滤，不再转为文本节点。

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
