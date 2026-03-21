# @dreamer/view

> 轻量、细粒度响应式视图引擎。无虚拟 DOM：由 signal 与 effect 驱动精确的 DOM
> 更新。支持 CSR、SSR、流式 SSR 与激活（hydration）。

[English](../../README.md) | 中文

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-509%20passed-brightgreen)](./TEST_REPORT.md)

---

## 🎯 功能

基于细粒度更新的响应式视图引擎：无虚拟 DOM，通过 signal 与 effect
做依赖追踪，可选 store、router、context、resource 与边界组件。使用 JSX
与内置指令（v-if、v-once、v-cloak 等）实现 CSR、SSR、流式 SSR 与 hydration。

---

## 📦 安装

### 全局安装 view-cli

在任意目录使用 `view-cli` 命令（如
`view-cli init`、`view-cli dev`）前，请先执行安装脚本：

```bash
deno run -A jsr:@dreamer/view/setup
```

安装完成后，可执行 `view-cli upgrade` 升级到最新版本。

安装后可用命令：

```bash
view-cli init [dir]     # 按示例结构初始化项目
view-cli dev            # 构建并启动开发静态服务
view-cli build         # 仅构建（输出到 dist/）
view-cli start         # 仅启动静态服务（需先 build）
view-cli upgrade       # 升级 @dreamer/view 到最新版（加 --beta 可升级到 beta）
view-cli update        # 更新项目依赖与 lockfile（加 --latest 更新到最新）
view-cli version       # 显示版本（别名：v）
view-cli --version     # 显示版本（别名：-v）
view-cli --help        # 完整帮助
```

### 在已有项目中仅使用库（不安装 CLI）

若只需在现有 Deno/Bun 项目中引用库而无需 CLI：

**Deno**

```bash
deno add jsr:@dreamer/view
```

**Bun**

```bash
bunx jsr add @dreamer/view
```

**按需添加子路径**（Deno 与 Bun 均需按需导入时，在项目里添加以下子路径；Deno 用
`deno add`，Bun 用 `bunx jsr add`，子路径一致）

```bash
# 主入口：signal/effect/memo、createRoot、render、mount、generateHydrationScript
deno add jsr:@dreamer/view
# SSR：renderToString、renderToStream、getActiveDocument、createSSRDocument（做 SSR 时按需添加）
deno add jsr:@dreamer/view/ssr
# 仅 CSR：更小体积，无 renderToString/hydrate/generateHydrationScript
deno add jsr:@dreamer/view/csr
# 客户端混合入口：createRoot、render、mount（无 generateHydrationScript；水合用 compiler 的 hydrate）
deno add jsr:@dreamer/view/hybrid
# Store：响应式状态、getters、actions、可选持久化（如 localStorage）
deno add jsr:@dreamer/view/store
# Reactive：表单代理 createReactive，value + onInput 双向绑定
deno add jsr:@dreamer/view/reactive
# Context：createContext、Provider、useContext 跨树注入
deno add jsr:@dreamer/view/context
# Resource：createResource 异步数据，配合 Suspense 使用
deno add jsr:@dreamer/view/resource
# Router：createRouter SPA 路由（History、routes、navigate、scroll: top/restore）
deno add jsr:@dreamer/view/router
# Portal：createPortal(children, container) 将子树挂到指定 DOM（弹窗/toast）
deno add jsr:@dreamer/view/portal
# Transition：轻量 enter/leave class 切换，配合 CSS 做显隐过渡
deno add jsr:@dreamer/view/transition
# Boundary：Suspense、ErrorBoundary 边界组件
deno add jsr:@dreamer/view/boundary
# Directive：内置 vIf/vElse 链、vOnce、vCloak 与 registerDirective 自定义指令
deno add jsr:@dreamer/view/directive
# Stream：renderToStream 流式 SSR（也可从 /ssr 导入）
deno add jsr:@dreamer/view/stream
# Compiler：insert、hydrate、renderToString 等（与 view-cli 全编译对齐）
deno add jsr:@dreamer/view/compiler
# Optimize：编译期 optimize / createOptimizePlugin（可选，依赖 TypeScript API）
deno add jsr:@dreamer/view/optimize
```

---

## 入口与子路径

按**体积与职责**拆分：按场景选择入口，可避免只做 CSR 却引入 SSR 相关代码。

### 主入口 `jsr:@dreamer/view`

面向 **CSR / 混合应用客户端**：signal、effect、**insert** 系列、`createRoot` /
`render` / **mount**、`generateHydrationScript`、`getDocument`、`mergeProps` /
`spreadIntrinsicProps` / `scheduleFunctionRef` 等。

**不再从主入口导出**（已迁至子路径，减小默认 bundle）：

| 原主入口用法                             | 现应从何处导入                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `renderToString`、`renderToStream`       | `jsr:@dreamer/view/ssr` 或 `jsr:@dreamer/view/stream`（仅流式）            |
| `getActiveDocument`、`createSSRDocument` | `jsr:@dreamer/view/ssr`（或手写编译产物时用 `jsr:@dreamer/view/compiler`） |

**独立 API `hydrate(fn, container)`**：由 **`jsr:@dreamer/view/compiler`**
导出。`fn` 须与 **`renderToString(fn)`**（或流式 SSR）使用**同一套**编译产物
`(container) => void`，内部通过 `insert` 建立结构；客户端在已含服务端 HTML
的容器上调用，按插入点复用 DOM 并绑定 effect。

**`mount(container, fn, options?)`**（主入口 / csr /
hybrid）：当前实现为解析容器后调用
**`render(fn, el)`**，**不会**根据「是否有子节点」自动切换为水合；混合应用请在客户端显式调用
**`hydrate`**（自 **compiler** 导入）。

本包**不再提供** **`createReactiveRoot`**，请改用 **createRoot** + **signal** 或
**mountWithRouter**（见下文示例）。

### SSR 子路径 `jsr:@dreamer/view/ssr`

聚合服务端常用能力：**renderToString**、**renderToStream**、**getActiveDocument**、**setSSRShadowDocument**、**createSSRDocument**
及 SSROptions、SSRElement 等类型。仅服务端或构建脚本需要时再 `deno add`
此子路径。

### 编译器 / 全编译运行时 `jsr:@dreamer/view/compiler`

与 **view-cli** 产出的 **`(container) => void` + insert** 模型对齐：导出
**insert**、**insertReactive**、**createRoot**、**render**、**hydrate**、**renderToString**、**renderToStream**、**getActiveDocument**、**createSSRDocument**
等。全编译应用、或工具链默认 `insertImportPath: "@dreamer/view/compiler"`
时使用。

**view-cli build**：对 `.tsx` 使用 `compileSource`，`insertImportPath` 为
**`@dreamer/view`** 时，若产物需要
`getActiveDocument()`，编译器会**自动追加**一行\
`import { getActiveDocument } from "@dreamer/view/compiler"`（主包不再导出该符号）。**init**
生成的 `deno.json` 仅映射 `jsr:@dreamer/view@^…` 即可；子路径由 JSR 包
**exports** 解析。

### 其他子路径（略）

`csr` / `hybrid`、`router`、`store`、`directive` 等含义不变，见下文
**按需添加子路径** 与 **模块与导出**。

---

## 🌍 环境兼容性

| 环境       | 版本           | 状态                                                    |
| ---------- | -------------- | ------------------------------------------------------- |
| **Deno**   | 2.5+           | ✅ 完全支持                                             |
| **Bun**    | 1.0+           | ✅ 完全支持                                             |
| **浏览器** | 现代 (ES2020+) | ✅ CSR、Hydration                                       |
| **服务端** | -              | ✅ SSR、流式 SSR（无 DOM）                              |
| **依赖**   | -              | 📦 可选：happy-dom 用于测试；@dreamer/test 用于测试运行 |

---

## 📁 项目结构与约定（view-cli）

使用 **view-cli init [dir]**
创建项目后，会采用以下结构与约定。了解本节有助于理解各文件作用、如何新增路由或修改布局。

### view init 会生成什么

执行 `view-cli init` 后，除其他文件外会得到：

- **view.config.ts** — 项目配置，供 dev/build/start 读取（见下文
  [view.config](#viewconfig)）。
- **deno.json** —
  编译选项（jsx、jsxImportSource）、imports（@dreamer/view）、tasks（dev、build、start）。
- **jsx.d.ts** — JSX 的 TypeScript 类型声明（deno.json 中引用），TSX
  类型检查需要。
- **src/main.tsx** — 入口：创建 router，将 `<App />` 挂载到 `#root`。
- **src/views/** — 基于文件的路由与约定文件。
- **src/router/router.ts** — 路由工厂（createAppRouter）。
- **src/router/routers.tsx** — 由 `src/views` **自动生成**；请勿手改；已加入
  .gitignore。

### src/views 下的约定文件（下划线前缀）

以 **下划线 `_` 开头**的文件为**约定特殊文件**，**不参与普通路由扫描**。其中只有
`_404.tsx` 会作为 notFound 路由（path `*`）。

| 文件             | 用途                                                          | 是否路由 |
| ---------------- | ------------------------------------------------------------- | -------- |
| **_app.tsx**     | 根组件：使用 router，渲染 Layout + 当前页。                   | 否       |
| **_layout.tsx**  | 布局包装（如导航 + 主内容）。可导出 `inheritLayout = false`。 | 否       |
| **_loading.tsx** | 懒加载路由的加载占位；**仅对当前目录生效**（子目录不继承）。  | 否       |
| **_404.tsx**     | 404 页；作为唯一的 notFound 路由（path `*`）。                | 是 (*)   |
| **_error.tsx**   | 错误兜底（如给 ErrorBoundary 用）。                           | 否       |

- **_layout 与 inheritLayout**：在任意 `_layout.tsx` 中可写
  `export const inheritLayout = false`，则该目录下的路由**不继承**父级布局。布局可多层嵌套。
- **_loading 作用域**：某目录下的 `_loading.tsx`
  只对该目录内的路由生效；子目录不继承（子目录可有自己的 `_loading.tsx`）。

### 普通路由文件（非下划线）

- **路径映射**：`src/views` 下（递归，最多 5
  层）的文件会变成路由。路径规则：`home.tsx` 或 `index.tsx` 或 `home/index.tsx`
  → `/`；`about.tsx` → `/about`；`blog/post.tsx` → `/blog/post`。特殊文件名
  `not-found` / `404`（可带 `/index`）→ path `*`（notFound）。
- **默认导出**：每个路由文件**必须**默认导出页面组件（如
  `export default function Home() { ... }`）。仅使用命名导出再
  `export default Home` 可能导致运行时报错「data.default
  不是一个函数」；请使用单一、直接的默认导出。
- **export metadata**：可在路由文件中导出 **`metadata`**
  对象（title、description、keywords、author、og）；生成 `routers.tsx`
  时会合并进该路由的 metadata。未写 `export metadata` 时，`title`
  由文件路径推断。

### view.config

CLI（dev / build / start）从项目根目录读取 **view.config.ts** 或
**view.config.json**。

| 配置块          | 主要字段                                                                          | 说明                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **server.dev**  | port、host、dev.hmr、dev.watch                                                    | 开发服务器及 HMR / 监听配置。                                                                                                                                                                         |
| **server.prod** | port、host                                                                        | 生产服务器（start 命令）。                                                                                                                                                                            |
| **build**       | entry、outDir、outFile、minify、sourcemap、splitting、**optimize**、**cssImport** | 构建入口与输出；splitting 启用按路由分块。**optimize**（生产默认 true）：对 .tsx 启用 createOptimizePlugin。**cssImport**：CSS 导入处理（见 [CSS 导入](#css-导入样式)），默认内联（运行时注入样式）。 |
| **build.dev**   | 与 build 同结构                                                                   | 仅 dev 模式生效的覆盖（如 minify: false、sourcemap: true）。                                                                                                                                          |
| **build.prod**  | 与 build 同结构                                                                   | 仅 prod 模式生效的覆盖。                                                                                                                                                                              |

- **server.dev.port** / **server.prod.port**：默认 8787，可由环境变量 `PORT`
  覆盖。
- **server.dev.dev.hmr**：如 `{ enabled: true, path: "/__hmr" }`。
- **build.entry**：默认 `"src/main.tsx"`。**build.outDir**：默认
  `"dist"`。**build.outFile**：默认
  `"main.js"`。**build.optimize**：生产构建默认 true，对 .tsx 启用
  createOptimizePlugin；设为 `false` 可关闭。
- **build.dev** / **build.prod**：与 **build** 同结构；CLI 在 dev 模式下会合并
  **build** 与 **build.dev**（prod 模式下合并 **build.prod**），例如可设置
  `dev: { minify: false, sourcemap: true }` 便于调试，`prod: { minify: true }`
  用于生产。

### CSS 导入（样式）

可在任意视图或组件中通过 ES 模块导入 CSS 文件，构建（通过
@dreamer/esbuild）会编译并在页面中注入样式。

- **默认（内联模式）**：直接写 `import "相对路径.css"`，CSS 会打进
  JS，模块加载时自动在 `document.head` 插入 `<style>`，无需改 `index.html`。

  ```tsx
  // 例如在 src/views/home/index.tsx
  import "../../assets/index.css";

  export default function Home() {
    return <div class="page">...</div>;
  }
  ```

- **提取模式**：若希望产出独立 `.css` 文件并在 `index.html` 中注入
  `<link>`（便于缓存），可在 **view.config.ts** 中配置：

  ```ts
  build: {
    cssImport: { enabled: true, extract: true },
    // ... 其余 build 配置
  },
  ```

  dev 时 CLI 会自动把构建出的 CSS 链接注入到返回的 `index.html` 中。

导入路径相对于当前文件（例如从 `src/views/home/index.tsx` 引用
`../../assets/index.css`）。

每次 dev 构建会根据 `src/views` 重新生成
`src/router/routers.tsx`；不要提交该文件（已加入 .gitignore）。

---

## ✨ 特性

- **核心**
  - `createSignal` / `createEffect` / `createMemo` — 响应式基础；依赖的 signal
    变化后 effect 在微任务中重跑。
  - `insert` / `insertReactive` / `insertStatic` / `insertMount` —
    插入点原语；编译产物与手写 CSR 共用（主入口导出）。
  - `createRoot` / `render` — 挂载响应式根；由 insert + effect
    驱动更新，无整树虚拟 DOM diff。
  - `mount(container, fn, options?)` — 解析容器后
    **`render(fn, el)`**；`options` 中 **`noopIfNotFound`**
    生效（选择器查不到时可返回空 Root）。**客户端水合**请使用
    **`jsr:@dreamer/view/compiler` 的 `hydrate(fn, container)`**（与 SSR 同一
    `fn`）。类型 **`MountOptions.hydrate`** 与实现演进可能不同步，请以源码为准。
  - `generateHydrationScript` — 混合应用注入激活脚本（主入口）。
  - **`renderToString` / `renderToStream` / `getActiveDocument`** — 已迁至
    **`jsr:@dreamer/view/ssr`**（流式亦可 `jsr:@dreamer/view/stream`）；可选
    `allowRawHtml: false`（见 [安全](#-安全)）。
- **Store**（`@dreamer/view/store`）
  - `createStore` — 响应式 store：state、getters、actions，可选 persist（如
    localStorage）。
- **Reactive**（`@dreamer/view/reactive`）
  - `createReactive` — 表单 model 代理；在 effect
    中读取会被追踪，写入会触发更新。
- **Context**（`@dreamer/view/context`）
  - `createContext` — Provider / useContext / registerProviderAlias，跨树注入。
- **Resource**（`@dreamer/view/resource`）
  - `createResource(fetcher)` 或 `createResource(source, fetcher)` —
    异步数据，返回 `{ data, loading, error, refetch }`。
- **Router**（`@dreamer/view/router`）
  - `createRouter` — 基于 History 的 SPA
    路由：routes、basePath、beforeRoute/afterRoute、notFound、back/forward/go。
- **Boundary**（`@dreamer/view/boundary`）
  - `Suspense` — 在 Promise 或 getter 解析前显示 fallback。
  - `ErrorBoundary` — 捕获子树错误并渲染 fallback(error)。
- **指令**（`@dreamer/view/directive`）
  - 内置：vIf、vElse、vElseIf、vOnce、vCloak；自定义通过 `registerDirective`。
- **流式 SSR**（`@dreamer/view/stream`）
  - `renderToStream` — 返回 HTML 分片生成器，用于流式响应。
- **JSX**
  - 通过 jsx-runtime 提供 `jsx` / `jsxs` / `Fragment`；在 JSX 中用 getter
    表示响应式内容。

---

## 🎯 使用场景

- **CSR**：细粒度更新的交互式 SPA。
- **SSR / SSG**：服务端渲染或预渲染为 HTML。
- **流式 SSR**：以 HTML 分片流式输出，加快首屏。
- **Hydration**：在浏览器中激活服务端 HTML。
- **表单**：createReactive（或 createSignal）+ value + onInput/onChange
  双向绑定。
- **全局状态**：createStore（getters/actions/persist）。
- **异步 UI**：createResource + Suspense。
- **路由**：createRouter 做 SPA 导航。
- **主题 / 注入**：createContext。

---

## 🚀 快速开始

最简客户端应用：

```tsx
// main.tsx：根函数为 (container) => void，内部用 insert 挂接 UI
import { createRoot, createSignal, insert } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

function App(): VNode {
  const count = createSignal(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button
        type="button"
        onClick={() => {
          count.value = count.value + 1;
        }}
      >
        +1
      </button>
    </div>
  );
}

const container = document.getElementById("root")!;
createRoot((el) => {
  insert(el, () => <App />);
}, container);
```

在 JSX 中 **`SignalRef` 可直接插值**（如 `{count}` 会自动解包）。在 **effect**
与 **事件**中用 **`.value`** 读写。表单：**value** + **onInput** / **onChange**
配合 createSignal 或 createReactive。事件：`onClick`、
`onInput`、`onChange`（驼峰）。Ref：`ref={(el) => { ... }}` 或 `ref={refObj}`。
若需在 `createEffect` 中随节点挂载/卸载重跑，请使用 `createRef()` 并写
`ref={myRef}`（编译器生成的 `ref.current = el` 会更新内部 signal）；普通
`{ current: null }` 不会触发 effect。 Fragment：`<>...</>` 或
`<Fragment>...</Fragment>`。

---

## 🎨 使用示例

### Signal + effect

```ts
import { createEffect, createMemo, createSignal } from "jsr:@dreamer/view";

const count = createSignal(0);
const double = createMemo(() => count.value * 2);
createEffect(() => console.log("count:", count.value));
count.value = 1;
```

### Store

```ts
import { createStore, withActions, withGetters } from "jsr:@dreamer/view/store";

// 默认返回单对象：可直接 store.count 读、store.count = 1 写、store.increment() 调方法
type State = { count: number };
type Getters = { double(): number };
type Actions = { increment(): void; reset(): void };

const store = createStore({
  state: { count: 0 } as State,
  getters: withGetters<State, Getters>()({
    double() {
      return this.count * 2;
    },
  }),
  actions: withActions<State, Actions>()({
    increment() {
      this.count = this.count + 1;
    },
    reset() {
      this.count = 0;
    },
  }),
  persist: { key: "app" },
});
store.count; // 读
store.count = 1; // 直接赋值更新
store.setState({ count: 2 }); // 或 setState
store.double; // getter 派生值
store.increment(); // action
```

### createReactive + value + onInput

使用 `createReactive` 维护表单状态，用 `value={form.字段}` 与
`onInput`/`onChange` 绑定即可，无需 v-model 指令。

```tsx
import { createReactive } from "jsr:@dreamer/view/reactive";

const form = createReactive({ name: "" });
// JSX 中：
<input
  type="text"
  value={form.name}
  onInput={(e) => (form.name = (e.target as HTMLInputElement).value)}
/>;
```

**按字段展示错误：** 将校验错误放在响应式状态中（如
`createReactive({ name: "", errors: {} as Record<string, string> })`），在每项旁边展示（如
`{form.errors.name && <span class="error">{form.errors.name}</span>}`）。在提交或失焦时校验并设置
`form.errors.字段名 = "错误信息"`，界面会随之更新。

### Resource + Suspense

```tsx
import { createResource } from "jsr:@dreamer/view/resource";
import { Suspense } from "jsr:@dreamer/view/boundary";

const user = createResource(() => fetch("/api/user").then((r) => r.json()));
// JSX 中：在 effect 里使用 user()，或将异步子节点包在 <Suspense fallback={...}>...</Suspense>
```

### 指令用法（内置 + 自定义）

内置指令在 JSX 中用**驼峰**书写；需要响应式时值为 **getter**（如
vIf）。自定义指令需先 `registerDirective`，再在 JSX 中使用。

**全部内置：vIf、vElse、vElseIf、vOnce、vCloak**

```tsx
import { createSignal } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

function Demo(): VNode {
  const show = createSignal(true);
  const list = createSignal([{ id: 1, name: "a" }, {
    id: 2,
    name: "b",
  }]);
  const visible = createSignal(true);
  const staticText = createSignal("只渲染一次，不随 signal 更新");
  return (
    <div>
      {/* 条件分支：vIf / vElse / vElseIf */}
      <div vIf={() => show.value}>当 show 为 true 时显示</div>
      <div vElseIf={() => false}>可选：再判断一档条件</div>
      <div vElse>否则显示这里</div>

      {/* 列表 */}
      <ul>
        {() =>
          list.value.map((item, index) => (
            <li key={item.id}>
              {index + 1}. {item.name}
            </li>
          ))}
      </ul>

      {/* 显隐：vIf（false 时卸载节点） */}
      <p vIf={() => visible.value}>visible 为 true 时显示</p>

      {/* 只渲染一次：vOnce。内部求值一次后冻结，不建立 effect，适合静态内容 */}
      <div vOnce>{staticText}</div>

      {/* 未激活前隐藏：vCloak。元素带 data-view-cloak，用 CSS [data-view-cloak]{ display:none } 隐藏，hydrate 后移除 */}
      <div vCloak>SSR 时先隐藏，客户端激活后再显示</div>
    </div>
  );
}
```

**自定义指令：registerDirective + 在 JSX 中使用**

```tsx
// 在应用入口或根组件前注册一次
import { registerDirective } from "jsr:@dreamer/view/directive";

registerDirective("v-focus", {
  mounted(el) {
    (el as HTMLInputElement).focus();
  },
});

// JSX 中使用（驼峰 vFocus 或保持 v-focus）
function Form(): VNode {
  return <input type="text" vFocus />;
}
```

更多指令 API（getDirective、hasDirective、DirectiveBinding 等）见下方「更多 API
代码示例」中的 **registerDirective** 与 **模块与导出 → Directive**。

### 更多 API 代码示例

以下为文档中提到的、尚未在「使用示例」中展开的 API 的简短示例。

**createRoot / render（外部路由 / 外部状态）**

根 API 为 **`createRoot(fn, container)`** /
**`render(fn, container)`**：**`fn`** 为
**`(container: Element) => void`**，内部用 **`insert(container, …)`** 挂接
UI（与 **view-cli** 编译产物一致）。

推荐：

- **view-cli + 文件路由**：根组件用 `router.getCurrentRouteSignal()()` 驱动
  `<RoutePage />`，由框架与 signal 触发更新。
- **自建 SPA + `@dreamer/view/router`**：使用 **`mountWithRouter`**，由路由器
  signal 驱动整树重挂。
- **状态全在 View signal 内**：在根 **`insert`** 的 getter 或子组件中读
  signal，细粒度更新；参见下文
  [Effect 作用域与渲染 thunk](#effect-作用域与渲染-thunk)。
- **外部非响应式导航**：可 **`root.unmount()`** 后再次 **`mount` /
  `render`**，或把「当前页」放进 **signal** 后在同一根内切换子树。

```ts
import { createRoot, createSignal, insert } from "jsr:@dreamer/view";

const container = document.getElementById("root")!;

// 根内用 signal 切换页面片段（推荐）
const route = createSignal<"home" | "user">("home");
createRoot(
  (el) => {
    insert(el, () => (route.value === "home" ? <Home /> : <User />));
  },
  container,
);
```

**CSR 入口（仅客户端、更小 bundle）**

不需要 SSR 或 hydrate 时，从 `view/csr` 引入可减少打包体积（不含
renderToString、hydrate、generateHydrationScript）：

```tsx
import type { VNode } from "jsr:@dreamer/view";
import { insert } from "jsr:@dreamer/view";
import { createSignal, mount } from "jsr:@dreamer/view/csr";

function App(): VNode {
  const count = createSignal(0);
  return (
    <div onClick={() => (count.value = count.value + 1)}>Count: {count}</div>
  );
}
// mount：解析容器后 render；fn 须为 (el) => void + insert
mount("#root", (el) => {
  insert(el, () => <App />);
});
// 可选：选择器查不到时静默返回空 Root 而不抛错
mount(
  "#maybe-missing",
  (el) => {
    insert(el, () => <App />);
  },
  { noopIfNotFound: true },
);
```

**onCleanup（effect 内注册清理）**

```ts
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view";

const id = createSignal(1);
createEffect(() => {
  const currentId = id.value;
  const timer = setInterval(() => console.log(currentId), 1000);
  onCleanup(() => clearInterval(timer));
});
```

**renderToString（SSR）**

```ts
import { insert } from "jsr:@dreamer/view";
import { renderToString } from "jsr:@dreamer/view/ssr";

const html = renderToString((el) => {
  insert(el, () => "Hello SSR");
});
// 可选：allowRawHtml: false 对 dangerouslySetInnerHTML 转义
const safe = renderToString((el) => {
  insert(el, () => <App />);
}, { allowRawHtml: false });
```

**hydrate + generateHydrationScript（混合应用）**

```ts
// 服务端：输出 HTML + 注入激活脚本（fn 与客户端 hydrate 必须一致）
import { generateHydrationScript, insert } from "jsr:@dreamer/view";
import { renderToString } from "jsr:@dreamer/view/ssr";

function rootFn(el: Element) {
  insert(el, () => <App />);
}

const html = renderToString(rootFn);
const script = generateHydrationScript({ scriptSrc: "/client.js" });
// 返回 html + script

// 客户端：显式 hydrate（自 compiler 导出；hybrid 入口不含 hydrate）
import { hydrate } from "jsr:@dreamer/view/compiler";

hydrate(rootFn, document.getElementById("root")!);

// 若仅需 CSR（空容器），可用 hybrid 或主入口的 mount + 同一 (el)=>void 形态
import { mount } from "jsr:@dreamer/view/hybrid";

mount("#root", (el) => {
  insert(el, () => <App />);
});
```

**SSR：安全访问 document**

在可能于服务端执行的代码中，不要直接使用 `document`。请从主入口使用
`getDocument()`：在浏览器中返回 `document`；无 DOM 或未设置影子 document 的 SSR
场景下返回 **`null`**；若设置了 `KEY_VIEW_SSR_DOCUMENT` 影子
document，则优先返回该对象。

**开发体验（仅开发环境）**

在开发构建下，运行时会针对常见写法给出提示（生产构建中关闭）：

- **Hydration 不匹配**：若服务端输出的 HTML 与客户端首次渲染的节点结构或 key
  不一致，会 `console.warn` 并附带节点路径或选择器，便于修复错位、白屏或闪烁。
- **响应式插值**：若误将 `SignalRef`
  当作普通字符串拼接等，可能收到一次性提示，请使用 `{signal}` 或 `signal.value`
  保持响应式。

**createContext（Provider / useContext）**

```tsx
import { createContext } from "jsr:@dreamer/view/context";

const ThemeContext = createContext<"light" | "dark">("light");
// 根或父级（themeValue 来自上层 signal/state）
<ThemeContext.Provider value={themeValue()}>
  <App />
</ThemeContext.Provider>;
// 子组件内
const theme = ThemeContext.useContext();
```

**createResource(source, fetcher)（带 source 的异步数据）**

```ts
import { createEffect, createSignal } from "jsr:@dreamer/view";
import { createResource } from "jsr:@dreamer/view/resource";

const id = createSignal(1);
const user = createResource(
  id,
  (id) => fetch(`/api/user/${id}`).then((r) => r.json()),
);
createEffect(() => {
  const { data, loading, error, refetch } = user();
  if (data) console.log(data);
});
```

**createRouter（路由 + start / subscribe / navigate）**

```ts
import { createRouter } from "jsr:@dreamer/view/router";
import { createSignal } from "jsr:@dreamer/view";

const router = createRouter({
  routes: [
    { path: "/", component: (match) => <Home /> },
    { path: "/user/:id", component: (match) => <User id={match.params.id} /> },
  ],
  notFound: () => <div>页面未找到</div>,
});
const match = createSignal(router.getCurrentRoute());
router.subscribe(() => (match.value = router.getCurrentRoute()));
router.start();
// 编程式导航：router.navigate("/user/1"); router.back(); router.forward();
```

**Portal（createPortal）**

将子树渲染到指定 DOM 容器（如 `document.body`），弹窗、抽屉、toast 不受父级
`overflow` 或 `z-index` 影响。从 `jsr:@dreamer/view/portal` 引入。

```tsx
import { createPortal } from "jsr:@dreamer/view/portal";

// 挂载到 document.body（默认）
const root = createPortal(() => <Modal />);
// 或指定容器：createPortal(() => <Modal />, document.getElementById("modal-root")!);
// 关闭时：root.unmount();
```

**Transition（过渡）**

轻量进入/离开过渡：仅切换 CSS class，具体动画由你的 CSS 实现。从
`jsr:@dreamer/view/transition` 引入。

```tsx
import { createSignal } from "jsr:@dreamer/view";
import { Transition } from "jsr:@dreamer/view/transition";

const visible = createSignal(false);
// CSS 示例：.enter { opacity: 0; } .enter-active { transition: opacity 0.2s; opacity: 1; }
//           .leave { opacity: 1; } .leave-active { transition: opacity 0.2s; opacity: 0; }
<Transition
  show={() => visible.value}
  enter="enter enter-active"
  leave="leave leave-active"
  duration={200}
>
  <div>内容</div>
</Transition>;
```

**ErrorBoundary（错误边界）**

```tsx
import { ErrorBoundary } from "jsr:@dreamer/view/boundary";

<ErrorBoundary fallback={(err) => <div>错误：{String(err?.message)}</div>}>
  <MaybeThrow />
</ErrorBoundary>;
```

**ErrorBoundary 放置建议：**
建议在**路由或布局**层级包裹，这样单页或单块出错不会导致整站不可用。可在根组件外再包一层全局
ErrorBoundary，在重量级或第三方区域外再包一层。

**可访问性（a11y）：** 对加载后会发生变化的动态内容（如实时区域），在容器上使用
`aria-live="polite"` 或
`aria-live="assertive"`，以便读屏软件播报更新。弹窗、对话框打开时主动管理焦点（如将焦点移到首个可聚焦元素、在关闭前将焦点限制在内部）。为控件使用
`aria-label` 或可见文案；纯装饰元素可使用 `aria-hidden="true"`。

**registerDirective（自定义指令）**

```ts
import { registerDirective } from "jsr:@dreamer/view/directive";

registerDirective("v-focus", {
  mounted(el) {
    (el as HTMLInputElement).focus();
  },
});
// JSX 中：<input vFocus /> 或 vFocus={true}
```

**renderToStream（流式 SSR）**

```ts
import { renderToStream } from "jsr:@dreamer/view/stream";

const stream = renderToStream(() => <App />);
for (const chunk of stream) {
  response.write(chunk);
}
// 或 ReadableStream.from(renderToStream(() => <App />))
```

**Compiler：optimize / createOptimizePlugin**

`view-cli build` 生产构建默认对 `.tsx` 启用 optimize
插件（常量折叠与静态提升）。在 view.config 中设置 `build.optimize: false`
可关闭。使用自定义打包器时需手动加入插件：

```ts
import { createOptimizePlugin, optimize } from "jsr:@dreamer/view/compiler";

const out = optimize(sourceCode, "App.tsx");
// esbuild 插件
import { build } from "esbuild";
await build({
  plugins: [createOptimizePlugin(/\.tsx$/)],
  // ...
});
```

**Store 元组形式（asObject: false）**

```ts
import { createStore } from "jsr:@dreamer/view/store";

const [get, set, getters, actions] = createStore({
  state: { count: 0 },
  getters: {
    double() {
      return this.count * 2;
    },
  },
  actions: {
    increment() {
      this.count++;
    },
  },
  asObject: false,
});
get().count;
actions.increment();
```

---

## 📚 Store 详解（@dreamer/view/store）

Store 提供「整棵可读写状态树」+ 派生 getters + 方法 actions + 可选持久化，与
createEffect 联动，适合全局状态（如用户信息、主题、购物车）。

**Store key：** 请使用**固定 key**（如 `"app"`、`"theme"`），以便同一实例在 多个
chunk 间复用。避免在「会反复创建与销毁」的场景下使用**动态 key**（如
`` `user-${id}` ``）：全局注册表不会自动移除条目，动态 key 会导致内存持续
增长。当某个 store 实例不再需要时（如弹窗或路由级 store），可调用
**`unregisterStore(key)`** 将其从注册表移除。

### 导入与创建

```ts
import { createStore, withActions, withGetters } from "jsr:@dreamer/view/store";
```

### 配置项 CreateStoreConfig

| 字段       | 类型                | 必填 | 说明                                                                                                                                                            |
| ---------- | ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`    | `T`                 | ✅   | 初始状态（浅拷贝，可嵌套对象）；需满足 `Record<string, unknown>`                                                                                                |
| `getters`  | `G`                 | 否   | 派生只读：方法内通过 `this` 读 state，如 `double() { return this.count * 2 }`；在 effect 中读取会随 state 响应式更新                                            |
| `actions`  | `A`                 | 否   | 方法：通过 `this` 读/写 state、`this.setState(...)`、以及调用其它 action（如 `this.increment()`）                                                               |
| `persist`  | `PersistOptions<T>` | 否   | 持久化：`key` 必填；`storage` 不传默认 localStorage；可选 `serialize`/`deserialize`                                                                             |
| `asObject` | `boolean`           | 否   | **默认 `true`**：返回单对象，可直接 `store.xxx` 读、`store.xxx = value` 写、`store.actionName()` 调方法；传 `false` 时返回元组 `[get, set, getters?, actions?]` |

### 返回形式

- **默认（asObject 为 true）**：返回**单个对象**。
  - 读 state：`store.count`、`store.theme`（在 effect/组件中读会响应式更新）。
  - 写 state：`store.count = 1` 或
    `store.setState({ count: 1 })`、`store.setState(prev => ({ ...prev, count: prev.count + 1 }))`。
  - 有 getters 时：`store.double` 等为派生值（只读）。
  - 有 actions 时：`store.increment()`、`store.toggleTheme()` 等。
- **asObject: false**：返回元组 `[get, set]` 或 `[get, set, getters]` 或
  `[get, set, actions]` 或 `[get, set, getters, actions]`，与
  state/getters/actions 是否传入有关。

### withGetters / withActions（推荐）

- **withGetters&lt;State, GettersType&gt;()(getters)**：包装 getters，使 getter
  内 `this` 明确为 state 类型，便于 IDE 识别与跳转（如 `this.count`）。
- **withActions&lt;State, ActionsType&gt;()(actions)**：包装 actions，使 action
  内 `this` 包含其它 action，可直接写 `this.otherAction()`，无需类型断言。

先定义类型再传入，例如：

```ts
type ThemeState = Record<string, unknown> & { theme: "light" | "dark" };
type ThemeActions = {
  setTheme(next: "light" | "dark"): void;
  toggleTheme(): void;
};

const themeStore = createStore({
  state: { theme: "light" } as ThemeState,
  actions: withActions<ThemeState, ThemeActions>()({
    setTheme(next) {
      this.theme = next;
    },
    toggleTheme() {
      this.setTheme(this.theme === "dark" ? "light" : "dark");
    },
  }),
  persist: { key: "view-theme" },
});
themeStore.theme;
themeStore.toggleTheme();
```

### 类型导出

- **StorageLike**、**PersistOptions&lt;T&gt;**：持久化接口与配置。
- **StoreGetters&lt;T&gt;**、**StoreActions&lt;T&gt;**、**StoreActionContextBase&lt;T&gt;**、**StoreActionContext&lt;T,
  A&gt;**：getters/actions 与 action 内 `this` 类型。
- **WithGettersContext&lt;T, G&gt;**、**WithActionsContext&lt;T,
  A&gt;**：withGetters/withActions 入参映射类型。
- **StoreAsObjectStateOnly&lt;T&gt;**、**StoreAsObjectWithGetters&lt;T,
  G&gt;**、**StoreAsObject&lt;T,
  A&gt;**、**StoreAsObjectWithGettersAndActions&lt;T, G,
  A&gt;**：不同配置下返回对象的类型。
- **CreateStoreConfig&lt;T, G?, A?&gt;**：createStore 的配置类型。

---

## 📦 模块与导出（完整）

以下对应 `deno.json` 的 `exports`，按需从对应子路径导入。

### 主入口 `jsr:@dreamer/view`（`.`）

核心响应式与渲染 API。主入口**不** re-export
router、store、stream、boundary、portal、transition 等，请从子路径按需导入（如
`@dreamer/view/router`），未使用的模块不会打进 bundle（利于 tree-shake）。

| 导出                                                                                 | 说明                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **createSignal**                                                                     | 创建 signal，返回 **`SignalRef`**；用 **`.value`** 读/写；在 effect 中读会登记依赖                                                                          |
| **createEffect**                                                                     | 创建 effect，先执行一次，依赖的 signal 变化后在微任务中重跑，返回 dispose                                                                                   |
| **createMemo**                                                                       | 创建带缓存的派生 getter                                                                                                                                     |
| **onCleanup**                                                                        | 在 effect/memo 内注册清理函数（当前 effect 重跑或 dispose 时执行）                                                                                          |
| **untrack**                                                                          | 在回调内读取 signal 但不登记依赖（高级用法）                                                                                                                |
| **getCurrentEffect** / **setCurrentEffect**                                          | 当前运行的 effect（内部/高级用法）                                                                                                                          |
| **isSignalGetter**                                                                   | 判断是否为 signal getter                                                                                                                                    |
| **isSignalRef**                                                                      | 判断是否为 `createSignal` 返回的 `SignalRef`                                                                                                                |
| **unwrapSignalGetterValue**                                                          | 解包 getter 或 `SignalRef`（编译器用于文本插值与受控属性）                                                                                                  |
| **createRef**                                                                        | 创建 ref 对象，配合 `ref={refObj}` 在 effect 中随节点挂载/卸载重跑                                                                                          |
| **createRoot**                                                                       | 创建根：执行一次 **`fn(container)`**，内部用 **insert** 建 UI；返回 **Root**（`unmount`、`container`）                                                      |
| **render**                                                                           | 等同于 **`createRoot(fn, container)`**；`fn` 为 **`(container) => void`**（与编译产物一致）                                                                 |
| **mount**                                                                            | **`render(fn, el)`** 的便捷入口：`container` 为选择器或 **Element**；**`options.noopIfNotFound`** 可查不到节点时返回空 Root；**不**自动水合                 |
| **insert** / **insertReactive** / **insertStatic** / **insertMount**                 | 插入点 API；与编译器产出对齐                                                                                                                                |
| **mergeProps** / **splitProps** / **spreadIntrinsicProps** / **scheduleFunctionRef** | 编译期 props 与函数 ref（从 compiler 再导出至主入口）                                                                                                       |
| **generateHydrationScript**                                                          | 生成激活脚本标签（混合应用）                                                                                                                                |
| **hydrate**（显式 API）                                                              | 在 **`jsr:@dreamer/view/compiler`** 导出；客户端水合请使用 **`hydrate(fn, container)`**（与 SSR 同一 `fn`），**mount** 不会根据子节点自动水合               |
| **getDocument**                                                                      | 安全访问 document：浏览器返回 `document`；无 DOM / SSR 时返回 **`null`**（除非已设影子 document）                                                           |
| **类型**                                                                             | VNode、Root、MountOptions、SignalRef、SignalGetter、SignalSetter、SignalTuple、EffectDispose、HydrationScriptOptions、ElementRef、InsertParent、InsertValue |
| **setGlobal**                                                                        | 设置全局 document 等（内部/高级用法）                                                                                                                       |
| **isDOMEnvironment**                                                                 | 当前是否为 DOM 环境                                                                                                                                         |

**SSR
相关**（`renderToString`、`renderToStream`、`getActiveDocument`、`createSSRDocument`）已移至子路径
**`jsr:@dreamer/view/ssr`**，仅做 CSR 时可不引入以减小主包体积。

### SSR 子路径 `jsr:@dreamer/view/ssr`

导出：**renderToString**、**renderToStream**、**getActiveDocument**、**setSSRShadowDocument**、**createSSRDocument**，以及类型
SSROptions、SSRElement、SSRNode、SSRTextNode。做服务端渲染或流式 SSR
时从此路径按需导入。

### CSR 入口 `jsr:@dreamer/view/csr`

仅客户端渲染的轻量入口：不含
`renderToString`、`hydrate`、`generateHydrationScript`，bundle 更小。**不导出
insert**：使用 **mount** 时需从主入口或 **compiler** 引入 **insert**（见上文 CSR
示例）。

导出：createSignal、createEffect、createMemo、onCleanup、createRoot、**render**、**mount**（选择器或
Element，始终 render），以及相关类型。不需要 SSR 或 hydrate 时从此入口引入。

### Hybrid 入口 `jsr:@dreamer/view/hybrid`

客户端轻量入口：含 **createRoot**、**render**、**mount**（与 csr
相同挂载模型），**不含**
**generateHydrationScript**、**renderToString**。**不导出
`hydrate`**：容器内已有服务端 HTML 时，客户端请从
**`jsr:@dreamer/view/compiler`** 调用 **`hydrate(fn, container)`**（`fn` 与 SSR
一致）。服务端 HTML 与脚本仍可用主入口的 **`generateHydrationScript`** 等。

### JSX 运行时 `jsr:@dreamer/view/jsx-runtime`

与 React 17+ automatic runtime 兼容。导出 **jsx**、**jsxs**、**Fragment**。在
`deno.json` 中配置后，由编译器自动从 `jsr:@dreamer/view`（或
`jsr:@dreamer/view/jsx-runtime`）注入，业务代码无需显式导入。

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jsr:@dreamer/view"
  }
}
```

### Store `jsr:@dreamer/view/store`

见上文 **Store
详解**。导出：**createStore**、**unregisterStore**、**withGetters**、**withActions**，以及
StorageLike、PersistOptions、StoreGetters、StoreActions、CreateStoreConfig、StoreAsObject*
等类型。

### Reactive `jsr:@dreamer/view/reactive`

表单等「单对象、多字段、双向绑定」的响应式代理。

| 导出                        | 说明                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **createReactive(initial)** | 将普通对象变为 Proxy，在 effect 中读取会登记依赖，任意属性赋值会触发更新。适合 `value={form.name}` + `onInput` 绑定 |

### Boundary `jsr:@dreamer/view/boundary`

| 导出                                      | 说明                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Suspense**                              | children 为 Promise 或 getter 返回 Promise 时先显示 fallback，resolve 后显示内容；可与 createResource 配合 |
| **ErrorBoundary**                         | 捕获子树渲染中的同步错误，渲染 `fallback(error)`                                                           |
| isErrorBoundary、getErrorBoundaryFallback | 内部/dom 层使用                                                                                            |

### Directive `jsr:@dreamer/view/directive`

指令系统：内置 vIf、vElse、vElseIf、vOnce、vCloak；自定义通过
**registerDirective**。**用法示例**见上文 **使用示例 → 指令用法**。

| 导出                                                                                                        | 说明                                                 |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **registerDirective(name, hooks)**                                                                          | 注册自定义指令；hooks 含 mounted、updated、unmounted |
| **getDirective**、**hasDirective**、**directiveNameToCamel**、**directiveNameToKebab**、**isDirectiveProp** | 查询与命名转换                                       |
| **DirectiveBinding**、**DirectiveHooks**                                                                    | 类型                                                 |

表单双向绑定：使用 createReactive 或 createSignal，在 input/textarea/select 上写
`value={...}` + onInput/onChange，无需 v-model。

### Resource `jsr:@dreamer/view/resource`

异步数据源。

| 导出                                | 说明                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| **createResource(fetcher)**         | 无 source，单次或手动 refetch；返回 getter，调用得到 `{ data, loading, error, refetch }` |
| **createResource(source, fetcher)** | source 变化时自动重新请求；fetcher 接收当前 source 值返回 Promise                        |
| **ResourceResult&lt;T&gt;**         | 类型：data、loading、error、refetch                                                      |

与 Suspense 配合：`resource().loading` 时用 Suspense 的 fallback；有 data
时显示内容。

### Compiler `jsr:@dreamer/view/compiler`

**本子路径导出**：**insert**、**insertReactive**、**insertStatic**、**createRoot**、**render**、**hydrate**、**renderToString**、**renderToStream**、**getActiveDocument**、**createSSRDocument**、**mergeProps**
/ **splitProps** / **spreadIntrinsicProps**、**scheduleFunctionRef** 与
signal/effect 等，与 **view-cli** 全编译产物一致。**view-cli** 在
`insertImportPath` 为主包且产物需要 **getActiveDocument** 时，会自动追加\
`import { getActiveDocument } from "@dreamer/view/compiler"`。

**不包含** `optimize` / `createOptimizePlugin`（见
**`jsr:@dreamer/view/optimize`**）。

### Optimize `jsr:@dreamer/view/optimize`

编译期优化（静态提升、常量折叠），依赖 **TypeScript 编译器
API**，仅在使用时加载。

| 导出                                         | 说明                                              |
| -------------------------------------------- | ------------------------------------------------- |
| **optimize(code, fileName?)**                | 对源码执行优化，返回优化后代码字符串              |
| **createOptimizePlugin(filter?, readFile?)** | 返回 esbuild onLoad 插件，对匹配文件执行 optimize |

### Context `jsr:@dreamer/view/context`

跨层数据注入。

| 导出                            | 说明                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **createContext(defaultValue)** | 返回 `{ Provider, useContext, registerProviderAlias }`；Provider 在树中注入 value，useContext 在子组件中读取 |
| **registerProviderAlias**       | 注册别名组件（如 RouterProvider）直接注入同一 context                                                        |

### Stream `jsr:@dreamer/view/stream`

流式 SSR。

| 导出                             | 说明                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **renderToStream(fn, options?)** | 将根组件渲染为逐块输出的 Generator&lt;string&gt;；options 可含 allowRawHtml。可 `for (const chunk of renderToStream(fn))` 或 `ReadableStream.from(renderToStream(fn))` |

### Router `jsr:@dreamer/view/router`

内置 SPA 路由（基于 History API）。

| 导出                      | 说明                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| **createRouter(options)** | 创建路由器；需调用 **start()** 后才监听 popstate 与拦截链接                                        |
| **Router 方法**           | getCurrentRoute、href、navigate、replace、back、forward、go、subscribe、start、stop                |
| **类型**                  | RouteConfig、RouteMatch、RouteMatchWithRouter、RouteGuard、RouteGuardAfter、CreateRouterOptions 等 |

路由配置：path 支持动态参数 `:param`；component 接收 match；可选 meta。支持
beforeRoute/afterRoute、notFound。**scroll**：`'top'` 在导航完成后滚动到
(0,0)；`'restore'` 恢复该路径上次滚动位置；`false`（默认）不处理。

**链接拦截（interceptLinks）：** 当 `interceptLinks: true`（默认）且已调用
**start()** 时，路由器会监听 `<a>` 的点击，对同源链接做客户端导航。以下情况
**不拦截**（交给浏览器默认行为）：

| 条件                                                               | 不拦截（浏览器默认）     |
| ------------------------------------------------------------------ | ------------------------ |
| `target="_blank"` 或任意 `target` ≠ `_self`                        | 新标签/新窗口打开        |
| 存在 `download` 属性                                               | 下载资源                 |
| 存在 `data-native` 属性                                            | 显式不拦截，使用原生导航 |
| History 模式：pathname+search 相同且链接仅带 hash（如 `#section`） | 页内锚点滚动             |
| Hash 模式：链接为 `#section`（单个 `#`，非 `#/path`）              | 页内锚点                 |
| 修饰键（Ctrl、Meta、Shift）或非左键点击                            | 如新标签打开等           |
| 跨域或非 `http:`/`https:` 的 URL                                   | 外链                     |
| `href` 无效或为空                                                  | 不导航                   |

仅当**左键**点击同源 `http:`/`https:` 链接且不满足上表任一条件时才会拦截并 触发
`navigate()`（及守卫）。在 createRouter 的 options 中设置
`interceptLinks: false` 可完全关闭链接拦截。

**路由文件与 `export metadata`（view-cli）：** 使用 `view-cli dev` 时，会按
`src/views` 递归扫描（最多 5 层）自动生成
`src/router/routers.tsx`。约定文件（_app、_layout、_loading、_404、_error）、路径映射与
view.config 的完整说明见上文 **项目结构与约定（view-cli）**。路由文件可导出
**`metadata`** 对象，生成时会合并进该路由的 metadata 配置：

```tsx
// src/views/home/index.tsx（或任意路由文件）
export const metadata = {
  title: "首页",
  description: "首页描述",
  keywords: "首页, 描述, 关键词",
  author: "作者",
  og: {
    title: "首页",
    description: "首页描述",
    image: "https://example.com/image.jpg",
  },
};
```

**路由页面组件：** 每个路由文件必须**默认导出**页面组件（例如
`export default function Home() { ... }`）。若仅使用命名导出再
`export default Home`，运行时加载该路由时可能报错「data.default
不是一个函数」。请使用单一、直接的默认导出。

支持的字段：`title`、`description`、`keywords`、`author`，以及 `og`（含
`title`、`description`、`image`）。未写 `export metadata` 时，`title`
由文件路径推断。生成的 `src/router/routers.tsx` 已加入 .gitignore，无需提交。

---

## 📚 API 速查表

| 模块       | 主要 API                                                                                                                                                    | 导入                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 核心       | createSignal, createEffect, createMemo, onCleanup, untrack, createRef, createRoot, render, mount, insert*, mergeProps, generateHydrationScript, getDocument | `jsr:@dreamer/view`            |
| 编译运行时 | insert, hydrate, renderToString, renderToStream, getActiveDocument, createSSRDocument（与上表部分重叠）                                                     | `jsr:@dreamer/view/compiler`   |
| 编译优化   | optimize, createOptimizePlugin                                                                                                                              | `jsr:@dreamer/view/optimize`   |
| SSR        | renderToString, renderToStream, getActiveDocument, createSSRDocument                                                                                        | `jsr:@dreamer/view/ssr`        |
| Store      | createStore, unregisterStore, withGetters, withActions                                                                                                      | `jsr:@dreamer/view/store`      |
| Reactive   | createReactive                                                                                                                                              | `jsr:@dreamer/view/reactive`   |
| Context    | createContext                                                                                                                                               | `jsr:@dreamer/view/context`    |
| Resource   | createResource                                                                                                                                              | `jsr:@dreamer/view/resource`   |
| Router     | createRouter（scroll: top/restore/false）                                                                                                                   | `jsr:@dreamer/view/router`     |
| Portal     | createPortal(children, container)                                                                                                                           | `jsr:@dreamer/view/portal`     |
| Transition | Transition（show、enter、leave、duration）                                                                                                                  | `jsr:@dreamer/view/transition` |
| Boundary   | Suspense, ErrorBoundary                                                                                                                                     | `jsr:@dreamer/view/boundary`   |
| 指令       | registerDirective, hasDirective, getDirective, …                                                                                                            | `jsr:@dreamer/view/directive`  |
| Stream     | renderToStream                                                                                                                                              | `jsr:@dreamer/view/stream`     |

更完整说明见上文 **Store 详解** 与 **模块与导出**。

---

## 📋 变更日志

**v1.3.4**（2026-03-22）：**修复** — JSX 编译器：布尔 DOM 属性使用**无参
getter** （如 **`disabled={() => loading.value}`**）时改为 **`createEffect`** +
**`!!getter()`**，避免控件永久禁用；**新增** 对应 **`jsx-compiler`** 单测。
**v1.3.3**（2026-03-21）：**破坏性** — **`SignalRef`**、移除
**`v-for`/`v-show`** 编译等；完整历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 📊 测试报告

| 项目     | 值                                  |
| -------- | ----------------------------------- |
| 测试日期 | 2026-03-21                          |
| 总用例数 | 509 (Deno) / 465 (Bun)              |
| 通过     | 509 ✅ / 465 ✅                     |
| 失败     | 0                                   |
| 通过率   | 100%                                |
| 耗时     | ~1m55s (Deno) / ~85s (Bun，45 文件) |

含单元、集成、E2E（CLI/浏览器）及 **SSR document shim**（组件内访问 document
不抛错）。详见 [TEST_REPORT.md](./TEST_REPORT.md)。

---

## Effect 作用域与渲染 thunk

根在构建整棵树时（例如
**`createRoot((el) => { insert(el, () => <App />); }, container)`**），**本次运行过程中读到的所有
signal 都会由根 effect 追踪**。因此若子组件直接返回带有响应式指令的 JSX（例如
`vIf={() => isOpen.value}`），**根**会订阅 `isOpen`。之后该 signal
变化（例如弹窗打开）时，根 effect 会重跑、整棵树重建，**父组件里的
`createEffect` 会再次执行**，可能造成副作用重复（例如布局逻辑执行两次）。

**解决办法：渲染 thunk。** 当组件**返回一个函数**，由该函数再返回 VNode（例如
`return () => ( <div vIf={() => isOpen.value}>...</div> )`）时，该槽位会在**独立
effect** 中渲染（见 CHANGELOG [1.0.4]）。此时 signal 只在这个内部 effect
里被读取，**只有该 effect**
会订阅，根不会订阅。弹窗打开时只会重跑弹窗子树，根和布局等 effect 不会重跑。

**何时使用：**

- **弹窗、Toast、抽屉**：建议使用
  `return () => ( ... )`，这样打开/关闭不会触发根或父级 effect 重跑。
- **重量级条件 UI**：由组件内部 signal
  控制显隐或内容、且挂在公共根（如布局）下的组件，返回 thunk
  可避免根订阅，减少整树重跑。

**提醒**：指令请使用**函数**读取响应式值（例如
`vIf={() => isOpen.value}`，不要用静态的
`vIf={isOpen.value}`）。使用函数时，订阅会挂在执行该指令的 effect
上；使用普通值会让根订阅并在更新时重跑整棵树（见 CHANGELOG [1.0.4]）。

---

## 📝 注意事项

- **无虚拟 DOM**：更新由 signal/store/reactive 的订阅驱动；根以细粒度 patch
  重跑。
- **JSX 响应式**：文本可用 `{count}`（`SignalRef` 解包）；指令用函数（如
  `vIf={() => visible.value}`）；effect/事件内用 `.value`。
- **JSX 配置**：在 deno.json 中设置 `compilerOptions.jsx: "react-jsx"` 与
  `compilerOptions.jsxImportSource: "jsr:@dreamer/view"`。
- **Effect 作用域**：对使用本地 signal 的弹窗/Toast/条件块（如
  `vIf={() => isOpen.value}`），建议组件**返回
  thunk**（`return () => ( ... )`）， 这样根不会订阅、父级 effect 不会重跑；见
  [Effect 作用域与渲染 thunk](#effect-作用域与渲染-thunk)。
- **类型安全**：完整 TypeScript 支持；导出 VNode、Root 及 effect/signal
  相关类型。

---

## 🔒 安全

- **dangerouslySetInnerHTML / innerHTML**：凡使用 `dangerouslySetInnerHTML` 或
  `innerHTML`（在 DOM props 或 SSR stringify
  中），必须**仅传入受信任或已消毒的内容**。禁止插入未消毒的用户输入，否则存在
  XSS 风险。
- **SSR**：建议在调用 `renderToString` 或 `renderToStream` 时使用
  **`allowRawHtml: false`**（或等效选项），使原始 HTML
  默认被转义，服务端输出更安全。仅在内容完全由你控制时再使用原始 HTML。

---

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。

---

## 📄 许可证

Apache License 2.0 - 见 [LICENSE](../../LICENSE)。

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
