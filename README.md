# @dreamer/view

> A lightweight, fine-grained reactive view engine. No virtual DOM: signals and effects drive precise DOM updates. Supports CSR, SSR, streaming SSR, and hydration.

English | [中文 (Chinese)](./docs/zh-CN/README.md)

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE.md)
[![Tests](https://img.shields.io/badge/tests-208%20passed-brightgreen)](./docs/en-US/TEST_REPORT.md)

---

## 🎯 Features

A reactive view engine with fine-grained updates: no virtual DOM, dependency tracking via signals and effects, and optional store, router, context, resource, and boundaries. Use JSX with built-in directives (v-if, v-for, v-model, etc.) for CSR, SSR, streaming SSR, and hydration.

---

## 📦 Installation

### Deno

```bash
deno add jsr:@dreamer/view
```

Optional subpaths (add as needed):

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

**JSX:** In `deno.json` set `compilerOptions.jsx: "react-jsx"` and `compilerOptions.jsxImportSource: "jsr:@dreamer/view"`.

### Bun

```bash
bunx jsr add @dreamer/view
```

---

## 🌍 Environment Compatibility

| Environment   | Version       | Status |
| ------------- | ------------- | ------ |
| **Deno**      | 2.5+          | ✅ Full support |
| **Bun**       | 1.0+          | ✅ Full support |
| **Browser**   | Modern (ES2020+) | ✅ CSR, Hydration |
| **Server**    | -             | ✅ SSR, streaming SSR (no DOM) |
| **Dependencies** | -          | 📦 Optional: happy-dom for tests; @dreamer/test for test runner |

---

## ✨ Characteristics

- **Core**
  - `createSignal` / `createEffect` / `createMemo` — reactive primitives; effects re-run when tracked signals change (microtask).
  - `createRoot` / `render` — mount reactive root; fine-grained DOM patch, no full tree replace.
  - `renderToString` — SSR/SSG HTML; optional `allowRawHtml: false` for v-html escaping.
  - `hydrate` — activate server-rendered markup; `generateHydrationScript` for hybrid apps.
- **Store** (`@dreamer/view/store`)
  - `createStore` — reactive store with state, getters, actions, and optional persist (e.g. localStorage).
- **Reactive** (`@dreamer/view/reactive`)
  - `createReactive` — proxy for form models; reads in effects are tracked, writes trigger updates.
- **Context** (`@dreamer/view/context`)
  - `createContext` — Provider / useContext / registerProviderAlias for cross-tree injection.
- **Resource** (`@dreamer/view/resource`)
  - `createResource(fetcher)` or `createResource(source, fetcher)` — async data with `{ data, loading, error, refetch }`.
- **Router** (`@dreamer/view/router`)
  - `createRouter` — History-based SPA routing: routes, basePath, beforeRoute/afterRoute, notFound, back/forward/go.
- **Boundary** (`@dreamer/view/boundary`)
  - `Suspense` — fallback until Promise or getter-resolved children.
  - `ErrorBoundary` — catch subtree errors and render fallback(error).
- **Directives** (`@dreamer/view/directive`)
  - Built-in: vIf, vElse, vElseIf, vFor, vShow, vText, vHtml, vModel; custom via `registerDirective`.
- **Stream SSR** (`@dreamer/view/stream`)
  - `renderToStream` — generator of HTML chunks for streaming responses.
- **JSX**
  - `jsx` / `jsxs` / `Fragment` via jsx-runtime; reactive content via getters in JSX.

---

## 🎯 Use Cases

- **CSR**: Interactive SPAs with fine-grained updates.
- **SSR / SSG**: Server-render or pre-render to HTML.
- **Streaming SSR**: Stream HTML chunks for faster first paint.
- **Hydration**: Activate SSR HTML in the browser.
- **Forms**: createReactive + vModel for two-way binding.
- **Global state**: createStore with getters/actions/persist.
- **Async UI**: createResource + Suspense.
- **Routing**: createRouter for SPA navigation.
- **Theming / injection**: createContext.

---

## 🚀 Quick Start

Minimal client-side app:

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

Use **getters** in JSX for reactive content (`{count}`). Two-way binding: **vModel** (see API). Events: `onClick`, `onInput`, `onChange` (camelCase). Ref: `ref={(el) => { ... }}` or `ref={refObj}`. Fragment: `<>...</>` or `<Fragment>...</Fragment>`.

---

## 🎨 Examples

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
// In JSX:
<input type="text" vModel={[() => form.name, (v) => (form.name = v)]} />
```

### Resource + Suspense

```tsx
import { createResource } from "jsr:@dreamer/view/resource";
import { Suspense } from "jsr:@dreamer/view/boundary";

const user = createResource(() => fetch("/api/user").then((r) => r.json()));
// In JSX: use user() in effect or wrap async child in <Suspense fallback={...}>...</Suspense>
```

---

## 📚 API Documentation

| Area    | API | Import |
| ------- | --- | ------ |
| Core    | createSignal, createEffect, createMemo, onCleanup, createRoot, render, renderToString, hydrate, generateHydrationScript | `jsr:@dreamer/view` |
| Store   | createStore | `jsr:@dreamer/view/store` |
| Reactive| createReactive | `jsr:@dreamer/view/reactive` |
| Context | createContext | `jsr:@dreamer/view/context` |
| Resource| createResource | `jsr:@dreamer/view/resource` |
| Router  | createRouter | `jsr:@dreamer/view/router` |
| Boundary| Suspense, ErrorBoundary | `jsr:@dreamer/view/boundary` |
| Directives | registerDirective, hasDirective, getDirective, … | `jsr:@dreamer/view/directive` |
| Stream  | renderToStream | `jsr:@dreamer/view/stream` |

**Core:** createSignal returns `[getter, setter]`; createEffect runs once then re-runs when dependencies change (microtask), returns dispose; createMemo returns a getter with cached value. **Rendering:** createRoot/render mount reactive root; renderToString for SSR; hydrate + generateHydrationScript for hybrid. **Directives:** vIf, vElse, vElseIf, vFor, vShow, vText, vHtml, vModel (camelCase in JSX); values can be getters. **Types:** VNode, Root, SignalGetter, SignalSetter, EffectDispose.

Full API and examples: [docs/en-US](./docs/en-US/) (English) / [docs/zh-CN](./docs/zh-CN/README.md) (中文).

---

## 📋 Changelog

**v1.0.0** (2026-02-12) — Initial release: core (signal, effect, memo, createRoot, render, renderToString, hydrate, generateHydrationScript), store, reactive, context, resource, router, boundary (Suspense, ErrorBoundary), directives (vIf/vFor/vShow/vText/vHtml/vModel, custom), stream SSR, JSX runtime.

See [CHANGELOG.md](./docs/en-US/CHANGELOG.md) for full details.

---

## 📊 Test Report

| Metric      | Value        |
| ----------- | ------------ |
| Test date   | 2026-02-12   |
| Total tests | 208          |
| Passed      | 208 ✅       |
| Failed      | 0            |
| Pass rate   | 100%         |
| Duration    | ~1m 28s      |

See [TEST_REPORT.md](./docs/en-US/TEST_REPORT.md) for details.

---

## 📝 Notes

- **No virtual DOM**: Updates are driven by signal/store/reactive subscriptions; root re-runs with fine-grained patch.
- **Getters in JSX**: Use getters (e.g. `{count}`, `value={() => name()}`, `vShow={() => visible()}`) so the engine can track and update.
- **JSX config**: `compilerOptions.jsx: "react-jsx"` and `compilerOptions.jsxImportSource: "jsr:@dreamer/view"` in deno.json.
- **Type safety**: Full TypeScript support; VNode, Root, and effect/signal types exported.

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📄 License

MIT License - see [LICENSE.md](./LICENSE.md)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
