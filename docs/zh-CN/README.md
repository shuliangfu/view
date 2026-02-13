# @dreamer/view

> 轻量、细粒度响应式视图引擎。无虚拟 DOM：由 signal 与 effect 驱动精确的 DOM
> 更新。支持 CSR、SSR、流式 SSR 与激活（hydration）。

[English](../../README.md) | 中文

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE.md)
[![Tests](https://img.shields.io/badge/tests-201%20passed-brightgreen)](./TEST_REPORT.md)

---

## 🎯 功能

基于细粒度更新的响应式视图引擎：无虚拟 DOM，通过 signal 与 effect
做依赖追踪，可选 store、router、context、resource 与边界组件。使用 JSX
与内置指令（v-if、v-for、v-show 等）实现 CSR、SSR、流式 SSR 与 hydration。

---

## 📦 安装

### Deno

```bash
deno add jsr:@dreamer/view
```

按需添加子路径（与 deno.json exports 对应）：

```bash
deno add jsr:@dreamer/view          # 主入口（核心 + 渲染）
deno add jsr:@dreamer/view/csr      # 仅 CSR 轻量入口
deno add jsr:@dreamer/view/hybrid   # 客户端混合入口（hydrate）
deno add jsr:@dreamer/view/store
deno add jsr:@dreamer/view/reactive
deno add jsr:@dreamer/view/context
deno add jsr:@dreamer/view/resource
deno add jsr:@dreamer/view/router
deno add jsr:@dreamer/view/boundary
deno add jsr:@dreamer/view/directive
deno add jsr:@dreamer/view/stream
deno add jsr:@dreamer/view/compiler # 编译优化（可选）
```

**JSX：** 在 `deno.json` 中设置 `compilerOptions.jsx: "react-jsx"` 与
`compilerOptions.jsxImportSource: "jsr:@dreamer/view"`。

### Bun

```bash
bunx jsr add @dreamer/view
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

## ✨ 特性

- **核心**
  - `createSignal` / `createEffect` / `createMemo` — 响应式基础；依赖的 signal
    变化后 effect 在微任务中重跑。
  - `createRoot` / `render` — 挂载响应式根；细粒度 DOM patch，不整树替换。
  - `renderToString` — SSR/SSG 输出 HTML；可选 `allowRawHtml: false` 对
    dangerouslySetInnerHTML 转义 转义。
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

**CSR 入口（仅客户端、更小 bundle）**

不需要 SSR 或 hydrate 时，从 `view/csr` 引入可减少打包体积（不含
renderToString、hydrate、generateHydrationScript）：

```tsx
import { createSignal, render } from "jsr:@dreamer/view/csr";
import type { VNode } from "jsr:@dreamer/view";

function App(): VNode {
  const [count, setCount] = createSignal(0);
  return <div onClick={() => setCount(count() + 1)}>Count: {count}</div>;
}
render(() => <App />, document.getElementById("root")!);
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
```

**createContext（Provider / useContext）**

```tsx
import { createContext } from "jsr:@dreamer/view/context";

const ThemeContext = createContext<"light" | "dark">("light");
// 根或父级
<ThemeContext.Provider value={theme()}>
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

**ErrorBoundary（错误边界）**

```tsx
import { ErrorBoundary } from "jsr:@dreamer/view/boundary";

<ErrorBoundary fallback={(err) => <div>错误：{String(err?.message)}</div>}>
  <MaybeThrow />
</ErrorBoundary>;
```

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

核心响应式与渲染 API。

| 导出                                        | 说明                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **createSignal**                            | 创建 signal，返回 `[getter, setter]`；在 effect 中调用 getter 会登记依赖                    |
| **createEffect**                            | 创建 effect，先执行一次，依赖的 signal 变化后在微任务中重跑，返回 dispose                   |
| **createMemo**                              | 创建带缓存的派生 getter                                                                     |
| **onCleanup**                               | 在 effect/memo 内注册清理函数（当前 effect 重跑或 dispose 时执行）                          |
| **getCurrentEffect** / **setCurrentEffect** | 当前运行的 effect（内部/高级用法）                                                          |
| **isSignalGetter**                          | 判断是否为 signal getter                                                                    |
| **createRoot**                              | 创建响应式根（接收根组件函数）                                                              |
| **render**                                  | 挂载根到 DOM：`render(() => <App />, container)`                                            |
| **renderToString**                          | SSR：将根组件渲染为 HTML 字符串                                                             |
| **hydrate**                                 | 在浏览器中激活服务端 HTML                                                                   |
| **generateHydrationScript**                 | 生成激活脚本标签（用于混合应用）                                                            |
| **类型**                                    | VNode、Root、SignalGetter、SignalSetter、SignalTuple、EffectDispose、HydrationScriptOptions |
| **isDOMEnvironment**                        | 当前是否为 DOM 环境                                                                         |

### CSR 入口 `jsr:@dreamer/view/csr`

仅客户端渲染的轻量入口：不含
`renderToString`、`hydrate`、`generateHydrationScript`，bundle 更小。

导出：createSignal、createEffect、createMemo、onCleanup、createRoot、**render**，以及相关类型。不需要
SSR 或 hydrate 时从此入口引入。

### Hybrid 入口 `jsr:@dreamer/view/hybrid`

客户端混合渲染入口：含 **createRoot**、**render**、**hydrate**，不含
renderToString、generateHydrationScript。服务端用主包或 stream 出
HTML，客户端用本入口 `hydrate()` 激活。

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
详解**。导出：**createStore**、**withGetters**、**withActions**，以及
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

| 导出                      | 说明                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **createRouter(options)** | 创建路由器；需调用 **start()** 后才监听 popstate 与拦截链接                         |
| **Router 方法**           | getCurrentRoute、href、navigate、replace、back、forward、go、subscribe、start、stop |
| **类型**                  | RouteConfig、RouteMatch、RouteGuard、RouteGuardAfter、CreateRouterOptions 等        |

路由配置：path 支持动态参数 `:param`；component 接收 match；可选 meta。支持
beforeRoute/afterRoute、notFound。

---

## 📚 API 速查表

| 模块     | 主要 API                                                                                                                | 导入                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 核心     | createSignal, createEffect, createMemo, onCleanup, createRoot, render, renderToString, hydrate, generateHydrationScript | `jsr:@dreamer/view`           |
| Store    | createStore, withGetters, withActions                                                                                   | `jsr:@dreamer/view/store`     |
| Reactive | createReactive                                                                                                          | `jsr:@dreamer/view/reactive`  |
| Context  | createContext                                                                                                           | `jsr:@dreamer/view/context`   |
| Resource | createResource                                                                                                          | `jsr:@dreamer/view/resource`  |
| Router   | createRouter                                                                                                            | `jsr:@dreamer/view/router`    |
| Boundary | Suspense, ErrorBoundary                                                                                                 | `jsr:@dreamer/view/boundary`  |
| 指令     | registerDirective, hasDirective, getDirective, …                                                                        | `jsr:@dreamer/view/directive` |
| Stream   | renderToStream                                                                                                          | `jsr:@dreamer/view/stream`    |

更完整说明见上文 **Store 详解** 与 **模块与导出**。

---

## 📋 变更日志

**v1.0.0**（2026-02-12）—
首次发布：核心（signal、effect、memo、createRoot、render、renderToString、hydrate、generateHydrationScript）、store、reactive、context、resource、router、boundary（Suspense、ErrorBoundary）、指令（vIf/vElse/vElseIf/vFor/vShow/vOnce/vCloak、自定义）、流式
SSR、JSX 运行时。

完整历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 📊 测试报告

| 项目     | 值         |
| -------- | ---------- |
| 测试日期 | 2026-02-12 |
| 总用例数 | 201        |
| 通过     | 201 ✅     |
| 失败     | 0          |
| 通过率   | 100%       |
| 耗时     | ~1m 15s    |

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

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。

---

## 📄 许可证

MIT License - 见 [LICENSE.md](../../LICENSE.md)。

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
