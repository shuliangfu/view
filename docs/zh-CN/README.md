# @dreamer/view

> 轻量、细粒度响应式视图引擎。无虚拟 DOM：由 signal 与 effect 驱动精确的 DOM
> 更新。支持 CSR、SSR、流式 SSR 与激活（hydration）。

[English](../../README.md) | 中文

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-412%20passed-brightgreen)](./TEST_REPORT.md)

---

## 🎯 功能

基于细粒度更新的响应式视图引擎：无虚拟 DOM，通过 signal 与 effect
做依赖追踪，可选 store、router、context、resource 与边界组件。使用 JSX
与内置指令（v-if、v-for、v-show 等）实现 CSR、SSR、流式 SSR 与 hydration。

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
# 主入口：signal/effect/memo、createRoot、render、mount、renderToString、hydrate 等
deno add jsr:@dreamer/view
# 仅 CSR：更小体积，无 renderToString/hydrate/generateHydrationScript
deno add jsr:@dreamer/view/csr
# 客户端混合入口：createRoot、render、mount、hydrate（配合服务端 SSR 激活）
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
# Directive：内置 vIf/vFor/vShow 等与 registerDirective 自定义指令
deno add jsr:@dreamer/view/directive
# Stream：renderToStream 流式 SSR
deno add jsr:@dreamer/view/stream
# Compiler：optimize、createOptimizePlugin 编译时优化（可选）
deno add jsr:@dreamer/view/compiler
```

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
- **export meta**：可在路由文件中导出 `meta`
  对象（title、description、keywords、author、og）；生成 `routers.tsx`
  时会合并进该路由的 meta。未写 `export meta` 时，`title` 由文件路径推断。

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
  - `createRoot` / `render` — 挂载响应式根；细粒度 DOM patch，不整树替换。
  - `mount(container, fn, options?)` — 统一挂载入口：`container` 可为选择器（如
    `"#root"`）或 `Element`；有子节点则 **hydrate**（hybrid/全量），否则
    **render**。选项：`hydrate`（强制）、`noopIfNotFound`（选择器查不到时返回空
    Root）。一步到位减少分支与心智负担。
  - `createReactiveRoot` — 挂载**由外部状态驱动**的根：传入
    `(container, getState, buildTree)`；当 `getState()` 的返回值变化（如 signal
    更新）时，会按新状态重新建树并在原地 patch，不整树卸载。适用于 SPA
    外壳由外部维护「页面状态」（如路由），View 只根据该状态渲染的场景。
  - `renderToString` — SSR/SSG 输出 HTML；可选 `allowRawHtml: false` 对 原始
    HTML 转义（见 [安全](#-安全)）。
  - `hydrate` — 激活服务端 HTML；`generateHydrationScript` 用于混合应用。
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
  - 内置：vIf、vElse、vElseIf、vFor、vShow、vOnce、vCloak；自定义通过
    `registerDirective`。
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
// main.tsx
import { createRoot, createSignal } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

function App(): VNode {
  const [count, setCount] = createSignal(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button type="button" onClick={() => setCount(count() + 1)}>+1</button>
    </div>
  );
}

const container = document.getElementById("root")!;
createRoot(() => <App />, container);
```

在 JSX 中用 **getter** 表示响应式内容（如 `{count}`）。表单：**value** +
**onInput** / **onChange** 配合 createSignal 或
createReactive。事件：`onClick`、
`onInput`、`onChange`（驼峰）。Ref：`ref={(el) => { ... }}` 或 `ref={refObj}`。
Fragment：`<>...</>` 或 `<Fragment>...</Fragment>`。

---

## 🎨 使用示例

### Signal + effect

```ts
import { createEffect, createMemo, createSignal } from "jsr:@dreamer/view";

const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);
createEffect(() => console.log("count:", count()));
setCount(1);
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
vIf、vFor、vShow）。自定义指令需先 `registerDirective`，再在 JSX 中使用。

**全部内置：vIf、vElse、vElseIf、vFor、vShow、vOnce、vCloak**

```tsx
import { createSignal } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

function Demo(): VNode {
  const [show, setShow] = createSignal(true);
  const [list, setList] = createSignal([{ id: 1, name: "a" }, {
    id: 2,
    name: "b",
  }]);
  const [visible, setVisible] = createSignal(true);
  const [staticText] = createSignal("只渲染一次，不随 signal 更新");
  return (
    <div>
      {/* 条件分支：vIf / vElse / vElseIf */}
      <div vIf={() => show()}>当 show 为 true 时显示</div>
      <div vElseIf={() => false}>可选：再判断一档条件</div>
      <div vElse>否则显示这里</div>

      {/* 列表：vFor 值为 getter () => array，子节点为工厂 (item, index) => VNode；key 写在子节点上 */}
      <ul>
        <li vFor={() => list()}>
          {(item, index) => <span key={item.id}>{index + 1}. {item.name}</span>}
        </li>
      </ul>

      {/* 显示/隐藏（仅切换 display，不销毁节点）：vShow */}
      <p vShow={() => visible()}>visible 为 true 时显示</p>

      {/* 只渲染一次：vOnce。内部 getter 求值一次后冻结，不建立 effect，适合静态内容 */}
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

**createReactiveRoot 与 forceRender（外部状态 / 外部路由）**

当「页面/路由」状态**由 View 以 signal 维护**时，使用
**createReactiveRoot**：传入 `(container, getState, buildTree)`，当 `getState()`
变化（如 signal 更新）时，树会按状态重建并原地 patch。适合希望 View
随路由自动更新的 SPA 壳。

当使用 **createRoot** / **render** 但驱动方（如第三方 router）**在 View 外且
不是 signal** 时，根 effect 只会在其追踪的 signal 变化时重跑。在每次路由（或
其他外部）变更后调用 **root.forceRender()** 可强制重跑一次并重渲染整树。
`createRoot`/`render` 返回的 `Root` 上提供 `forceRender` 即用于此场景。

```ts
import {
  createReactiveRoot,
  createRoot,
  createSignal,
  render,
} from "jsr:@dreamer/view";

// 方式 A：路由状态是 signal → createReactiveRoot（状态变化时自动 patch）
const [pageState, setPageState] = createSignal({ route: "home", id: null });
const container = document.getElementById("root")!;

const root = createReactiveRoot(container, pageState, (state) => {
  if (state.route === "home") return <Home />;
  if (state.route === "user") return <User id={state.id} />;
  return <NotFound />;
});
// setPageState({ route: "user", id: "1" }) 后树会原地 patch。拆卸时 root.unmount()。

// 方式 B：外部 router、无 signal → createRoot + 路由变更后调用 forceRender
const root2 = createRoot(() => <App />, container);
externalRouter.onChange(() => root2.forceRender?.());
```

**CSR 入口（仅客户端、更小 bundle）**

不需要 SSR 或 hydrate 时，从 `view/csr` 引入可减少打包体积（不含
renderToString、hydrate、generateHydrationScript）：

```tsx
import { createSignal, mount } from "jsr:@dreamer/view/csr";
import type { VNode } from "jsr:@dreamer/view";

function App(): VNode {
  const [count, setCount] = createSignal(0);
  return <div onClick={() => setCount(count() + 1)}>Count: {count}</div>;
}
// mount 接受选择器或 Element；CSR 下始终 render（无 hydrate）
mount("#root", () => <App />);
// 可选：选择器查不到时静默返回空 Root 而不抛错
mount("#maybe-missing", () => <App />, { noopIfNotFound: true });
```

**onCleanup（effect 内注册清理）**

```ts
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view";

const [id, setId] = createSignal(1);
createEffect(() => {
  const currentId = id();
  const timer = setInterval(() => console.log(currentId), 1000);
  onCleanup(() => clearInterval(timer));
});
```

**renderToString（SSR）**

```ts
import { renderToString } from "jsr:@dreamer/view";

const html = renderToString(() => <div>Hello SSR</div>);
// 可选：allowRawHtml: false 对 dangerouslySetInnerHTML 转义
const safe = renderToString(() => <App />, { allowRawHtml: false });
```

**hydrate + generateHydrationScript（混合应用）**

```ts
// 服务端：输出 HTML + 注入激活脚本
import { generateHydrationScript, renderToString } from "jsr:@dreamer/view";
const html = renderToString(() => <App />);
const script = generateHydrationScript({ scriptSrc: "/client.js" });
// 返回 html + script

// 客户端（如从 jsr:@dreamer/view/hybrid 引入）：激活
import { hydrate } from "jsr:@dreamer/view/hybrid";
hydrate(() => <App />, document.getElementById("root")!);

// 或使用 mount：选择器 + 自动 hydrate/render（有子节点 → hydrate，否则 render）
import { mount } from "jsr:@dreamer/view/hybrid";
mount("#root", () => <App />);
```

**SSR：安全访问 document**

在可能于服务端执行的代码中，不要直接使用 `document`。请从主入口使用
`getDocument()`：在浏览器中返回 `document`，在 SSR（如 `renderToString` /
`renderToStream`）执行时会抛出带说明的错误，便于排查，而不是得到
`document is undefined`。

**开发体验（仅开发环境）**

在开发构建下，运行时会针对常见写法给出提示（生产构建中关闭）：

- **Hydration 不匹配**：若服务端输出的 HTML 与客户端首次渲染的节点结构或 key
  不一致，会 `console.warn` 并附带节点路径或选择器，便于修复错位、白屏或闪烁。
- **忘记 getter**：若在 JSX 中把 signal 的 getter 当作普通值使用（例如写了
  `{count}` 而未写成 `{count()}`），会给出一次性提示，提醒调用 getter
  以保持响应式更新。

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

const [id, setId] = createSignal(1);
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
const [match, setMatch] = createSignal(router.getCurrentRoute());
router.subscribe(() => setMatch(router.getCurrentRoute()));
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

const [visible, setVisible] = createSignal(false);
// CSS 示例：.enter { opacity: 0; } .enter-active { transition: opacity 0.2s; opacity: 1; }
//           .leave { opacity: 1; } .leave-active { transition: opacity 0.2s; opacity: 0; }
<Transition
  show={() => visible()}
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

| 导出                                        | 说明                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **createSignal**                            | 创建 signal，返回 `[getter, setter]`；在 effect 中调用 getter 会登记依赖                                                                   |
| **createEffect**                            | 创建 effect，先执行一次，依赖的 signal 变化后在微任务中重跑，返回 dispose                                                                  |
| **createMemo**                              | 创建带缓存的派生 getter                                                                                                                    |
| **onCleanup**                               | 在 effect/memo 内注册清理函数（当前 effect 重跑或 dispose 时执行）                                                                         |
| **getCurrentEffect** / **setCurrentEffect** | 当前运行的 effect（内部/高级用法）                                                                                                         |
| **isSignalGetter**                          | 判断是否为 signal getter                                                                                                                   |
| **createRoot**                              | 创建响应式根；返回 Root，含 **unmount** 与 **forceRender**（用于外部路由等场景强制重跑）                                                   |
| **createReactiveRoot**                      | 创建由状态驱动的根：`(container, getState, buildTree)`，状态变化时原地 patch                                                               |
| **render**                                  | 挂载根到 DOM：`render(() => <App />, container)`                                                                                           |
| **mount**                                   | 统一挂载：`mount(container, fn, options?)`；container 为选择器或 Element；有子节点→hydrate，否则 render；选项：`hydrate`、`noopIfNotFound` |
| **renderToString**                          | SSR：将根组件渲染为 HTML 字符串                                                                                                            |
| **hydrate**                                 | 在浏览器中激活服务端 HTML                                                                                                                  |
| **generateHydrationScript**                 | 生成激活脚本标签（用于混合应用）                                                                                                           |
| **getDocument**                             | 安全访问 document：在浏览器返回 `document`，在 SSR 下抛出明确错误（用于仅在客户端分支中访问，避免 `document is undefined`）                |
| **类型**                                    | VNode、Root、MountOptions、SignalGetter、SignalSetter、SignalTuple、EffectDispose、HydrationScriptOptions                                  |
| **isDOMEnvironment**                        | 当前是否为 DOM 环境                                                                                                                        |

### CSR 入口 `jsr:@dreamer/view/csr`

仅客户端渲染的轻量入口：不含
`renderToString`、`hydrate`、`generateHydrationScript`，bundle 更小。

导出：createSignal、createEffect、createMemo、onCleanup、createRoot、**render**、**mount**（选择器或
Element，始终 render），以及相关类型。不需要 SSR 或 hydrate 时从此入口引入。

### Hybrid 入口 `jsr:@dreamer/view/hybrid`

客户端混合渲染入口：含 **createRoot**、**render**、**mount**、**hydrate**，不含
renderToString、generateHydrationScript。服务端用主包或 stream 出
HTML，客户端用本入口激活。**mount(container, fn)** 接受选择器或
Element；有子节点→hydrate，否则→render。

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

指令系统：内置 vIf、vElse、vElseIf、vFor、vShow、vOnce、vCloak；自定义通过
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

编译优化（静态提升、常量折叠），依赖 TypeScript 编译器 API，仅在使用时加载。

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

**路由文件与 `export meta`（view-cli）：** 使用 `view-cli dev` 时，会按
`src/views` 递归扫描（最多 5 层）自动生成
`src/router/routers.tsx`。约定文件（_app、_layout、_loading、_404、_error）、路径映射与
view.config 的完整说明见上文 **项目结构与约定（view-cli）**。路由文件可导出
`metadata` 对象，生成时会合并进该路由的 metadata 配置：

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
`title`、 `description`、`image`）。未写 `export meta` 时，`title`
由文件路径推断。生成的 `src/router/routers.tsx` 已加入 .gitignore，无需提交。

---

## 📚 API 速查表

| 模块       | 主要 API                                                                                                                                           | 导入                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 核心       | createSignal, createEffect, createMemo, onCleanup, createRoot, createReactiveRoot, render, mount, renderToString, hydrate, generateHydrationScript | `jsr:@dreamer/view`            |
| Store      | createStore, unregisterStore, withGetters, withActions                                                                                             | `jsr:@dreamer/view/store`      |
| Reactive   | createReactive                                                                                                                                     | `jsr:@dreamer/view/reactive`   |
| Context    | createContext                                                                                                                                      | `jsr:@dreamer/view/context`    |
| Resource   | createResource                                                                                                                                     | `jsr:@dreamer/view/resource`   |
| Router     | createRouter（scroll: top/restore/false）                                                                                                          | `jsr:@dreamer/view/router`     |
| Portal     | createPortal(children, container)                                                                                                                  | `jsr:@dreamer/view/portal`     |
| Transition | Transition（show、enter、leave、duration）                                                                                                         | `jsr:@dreamer/view/transition` |
| Boundary   | Suspense, ErrorBoundary                                                                                                                            | `jsr:@dreamer/view/boundary`   |
| 指令       | registerDirective, hasDirective, getDirective, …                                                                                                   | `jsr:@dreamer/view/directive`  |
| Stream     | renderToStream                                                                                                                                     | `jsr:@dreamer/view/stream`     |

更完整说明见上文 **Store 详解** 与 **模块与导出**。

---

## 📋 变更日志

**v1.0.14**（2026-02-16）— 变更：Store/router/version/DOM
重构与渲染性能优化（keyed 列表原地 patch、props 未变跳过写、指令
queueMicrotask、根 vnode 跳过）。 完整历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 📊 测试报告

| 项目     | 值         |
| -------- | ---------- |
| 测试日期 | 2026-02-16 |
| 总用例数 | 412        |
| 通过     | 412 ✅     |
| 失败     | 0          |
| 通过率   | 100%       |
| 耗时     | ~2m        |

详见 [TEST_REPORT.md](./TEST_REPORT.md)。

---

## 📝 注意事项

- **无虚拟 DOM**：更新由 signal/store/reactive 的订阅驱动；根以细粒度 patch
  重跑。
- **JSX 中用 getter**：使用 getter（如
  `{count}`、`value={() => name()}`、`vShow={() => visible()}`）以便引擎追踪并更新。
- **JSX 配置**：在 deno.json 中设置 `compilerOptions.jsx: "react-jsx"` 与
  `compilerOptions.jsxImportSource: "jsr:@dreamer/view"`。
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
