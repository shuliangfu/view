# @dreamer/view

> 轻量、细粒度响应式视图引擎。无虚拟 DOM：由 signal 与 effect 驱动精确的 DOM 更新。支持 CSR、SSR、流式 SSR 与激活（hydration）。

[English](../../README.md) | 中文

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE.md)
[![Tests](https://img.shields.io/badge/tests-208%20passed-brightgreen)](./TEST_REPORT.md)

---

## 🎯 功能

基于细粒度更新的响应式视图引擎：无虚拟 DOM，通过 signal 与 effect 做依赖追踪，可选 store、router、context、resource 与边界组件。使用 JSX 与内置指令（v-if、v-for、v-model 等）实现 CSR、SSR、流式 SSR 与 hydration。

---

## 📦 安装

### Deno

```bash
deno add jsr:@dreamer/view
```

按需添加子路径：

```bash
deno add jsr:@dreamer/view/store
deno add jsr:@dreamer/view/reactive
deno add jsr:@dreamer/view/context
deno add jsr:@dreamer/view/resource
deno add jsr:@dreamer/view/router
deno add jsr:@dreamer/view/boundary
deno add jsr:@dreamer/view/directive
deno add jsr:@dreamer/view/stream
```

**JSX：** 在 `deno.json` 中设置 `compilerOptions.jsx: "react-jsx"` 与 `compilerOptions.jsxImportSource: "jsr:@dreamer/view"`。

### Bun

```bash
bunx jsr add @dreamer/view
```

---

## 🌍 环境兼容性

| 环境         | 版本           | 状态 |
| ------------ | -------------- | ---- |
| **Deno**     | 2.5+          | ✅ 完全支持 |
| **Bun**      | 1.0+          | ✅ 完全支持 |
| **浏览器**   | 现代 (ES2020+) | ✅ CSR、Hydration |
| **服务端**   | -             | ✅ SSR、流式 SSR（无 DOM） |
| **依赖**     | -             | 📦 可选：happy-dom 用于测试；@dreamer/test 用于测试运行 |

---

## ✨ 特性

- **核心**
  - `createSignal` / `createEffect` / `createMemo` — 响应式基础；依赖的 signal 变化后 effect 在微任务中重跑。
  - `createRoot` / `render` — 挂载响应式根；细粒度 DOM patch，不整树替换。
  - `renderToString` — SSR/SSG 输出 HTML；可选 `allowRawHtml: false` 对 v-html 转义。
  - `hydrate` — 激活服务端 HTML；`generateHydrationScript` 用于混合应用。
- **Store**（`@dreamer/view/store`）
  - `createStore` — 响应式 store：state、getters、actions，可选 persist（如 localStorage）。
- **Reactive**（`@dreamer/view/reactive`）
  - `createReactive` — 表单 model 代理；在 effect 中读取会被追踪，写入会触发更新。
- **Context**（`@dreamer/view/context`）
  - `createContext` — Provider / useContext / registerProviderAlias，跨树注入。
- **Resource**（`@dreamer/view/resource`）
  - `createResource(fetcher)` 或 `createResource(source, fetcher)` — 异步数据，返回 `{ data, loading, error, refetch }`。
- **Router**（`@dreamer/view/router`）
  - `createRouter` — 基于 History 的 SPA 路由：routes、basePath、beforeRoute/afterRoute、notFound、back/forward/go。
- **Boundary**（`@dreamer/view/boundary`）
  - `Suspense` — 在 Promise 或 getter 解析前显示 fallback。
  - `ErrorBoundary` — 捕获子树错误并渲染 fallback(error)。
- **指令**（`@dreamer/view/directive`）
  - 内置：vIf、vElse、vElseIf、vFor、vShow、vText、vHtml、vModel；自定义通过 `registerDirective`。
- **流式 SSR**（`@dreamer/view/stream`）
  - `renderToStream` — 返回 HTML 分片生成器，用于流式响应。
- **JSX**
  - 通过 jsx-runtime 提供 `jsx` / `jsxs` / `Fragment`；在 JSX 中用 getter 表示响应式内容。

---

## 🎯 使用场景

- **CSR**：细粒度更新的交互式 SPA。
- **SSR / SSG**：服务端渲染或预渲染为 HTML。
- **流式 SSR**：以 HTML 分片流式输出，加快首屏。
- **Hydration**：在浏览器中激活服务端 HTML。
- **表单**：createReactive + vModel 双向绑定。
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

在 JSX 中用 **getter** 表示响应式内容（如 `{count}`）。双向绑定使用 **vModel**（见 API）。事件：`onClick`、`onInput`、`onChange`（驼峰）。Ref：`ref={(el) => { ... }}` 或 `ref={refObj}`。Fragment：`<>...</>` 或 `<Fragment>...</Fragment>`。

---

## 🎨 使用示例

### Signal + effect

```ts
import { createSignal, createEffect, createMemo } from "jsr:@dreamer/view";

const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);
createEffect(() => console.log("count:", count()));
setCount(1);
```

### Store

```ts
import { createStore } from "jsr:@dreamer/view/store";

const [get, set, getters, actions] = createStore({
  state: { count: 0 },
  getters: { double: (get) => get().count * 2 },
  actions: { increment: (get, set) => set({ ...get(), count: get().count + 1 }) },
  persist: { key: "app" },
});
get().count;
actions.increment();
```

### createReactive + vModel

```tsx
import { createReactive } from "jsr:@dreamer/view/reactive";

const form = createReactive({ name: "" });
// JSX 中：
<input type="text" vModel={[() => form.name, (v) => (form.name = v)]} />
```

### Resource + Suspense

```tsx
import { createResource } from "jsr:@dreamer/view/resource";
import { Suspense } from "jsr:@dreamer/view/boundary";

const user = createResource(() => fetch("/api/user").then((r) => r.json()));
// JSX 中：在 effect 里使用 user()，或将异步子节点包在 <Suspense fallback={...}>...</Suspense>
```

---

## 📚 API 文档

| 模块     | API                                                                                                                     | 导入 |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ---- |
| 核心     | createSignal, createEffect, createMemo, onCleanup, createRoot, render, renderToString, hydrate, generateHydrationScript | `jsr:@dreamer/view` |
| Store    | createStore                                                                                                             | `jsr:@dreamer/view/store` |
| Reactive | createReactive                                                                                                          | `jsr:@dreamer/view/reactive` |
| Context  | createContext                                                                                                           | `jsr:@dreamer/view/context` |
| Resource | createResource                                                                                                          | `jsr:@dreamer/view/resource` |
| Router   | createRouter                                                                                                             | `jsr:@dreamer/view/router` |
| Boundary | Suspense, ErrorBoundary                                                                                                  | `jsr:@dreamer/view/boundary` |
| 指令     | registerDirective, hasDirective, getDirective, …                                                                        | `jsr:@dreamer/view/directive` |
| Stream   | renderToStream                                                                                                           | `jsr:@dreamer/view/stream` |

**核心：** createSignal 返回 `[getter, setter]`；createEffect 先执行一次，依赖变化后在微任务中重跑，返回 dispose；createMemo 返回带缓存的 getter。**渲染：** createRoot/render 挂载响应式根；renderToString 用于 SSR；hydrate + generateHydrationScript 用于混合。**指令：** vIf、vElse、vElseIf、vFor、vShow、vText、vHtml、vModel（JSX 中驼峰）；值可为 getter。**类型：** VNode、Root、SignalGetter、SignalSetter、EffectDispose。

更详细的 API 与示例见本目录下各文档及仓库 `examples/`。

---

## 📋 变更日志

**v1.0.0**（2026-02-12）— 首次发布：核心（signal、effect、memo、createRoot、render、renderToString、hydrate、generateHydrationScript）、store、reactive、context、resource、router、boundary（Suspense、ErrorBoundary）、指令（vIf/vFor/vShow/vText/vHtml/vModel、自定义）、流式 SSR、JSX 运行时。

完整历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 📊 测试报告

| 项目       | 值        |
| ---------- | --------- |
| 测试日期   | 2026-02-12 |
| 总用例数   | 208       |
| 通过       | 208 ✅    |
| 失败       | 0         |
| 通过率     | 100%      |
| 耗时       | ~1m 28s   |

详见 [TEST_REPORT.md](./TEST_REPORT.md)。

---

## 📝 注意事项

- **无虚拟 DOM**：更新由 signal/store/reactive 的订阅驱动；根以细粒度 patch 重跑。
- **JSX 中用 getter**：使用 getter（如 `{count}`、`value={() => name()}`、`vShow={() => visible()}`）以便引擎追踪并更新。
- **JSX 配置**：在 deno.json 中设置 `compilerOptions.jsx: "react-jsx"` 与 `compilerOptions.jsxImportSource: "jsr:@dreamer/view"`。
- **类型安全**：完整 TypeScript 支持；导出 VNode、Root 及 effect/signal 相关类型。

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
