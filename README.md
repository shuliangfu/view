# @dreamer/view

> A lightweight, fine-grained reactive view engine. No virtual DOM: signals and
> effects drive precise DOM updates. Supports CSR, SSR, streaming SSR, and
> hydration.

English | [中文 (Chinese)](./docs/zh-CN/README.md)

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-252%20passed-brightgreen)](./docs/en-US/TEST_REPORT.md)

---

## 🎯 Features

A reactive view engine with fine-grained updates: no virtual DOM, dependency
tracking via signals and effects, and optional store, router, context, resource,
and boundaries. Use JSX with built-in directives (v-if, v-for, v-show, etc.) for
CSR, SSR, streaming SSR, and hydration.

---

## 📦 Installation

### Install view-cli globally

To use `view-cli` commands (e.g. `view-cli init`, `view-cli dev`) from any
directory, run the setup script:

```bash
deno run -A jsr:@dreamer/view/setup
```

After installation, run `view-cli upgrade` to get the latest version.

After installation, you can run:

```bash
view-cli init [dir]     # Initialize project from example structure
view-cli dev           # Build then start static server (dev)
view-cli build         # Build only (output to dist/)
view-cli start         # Start static server only (requires prior build)
view-cli upgrade       # Upgrade @dreamer/view to latest (use --beta for beta)
view-cli update        # Update project dependencies and lockfile (use --latest for latest)
view-cli version       # Show version (alias: v)
view-cli --version     # Show version (alias: -v)
view-cli --help        # Full help
```

### Add to existing project (library only)

If you only need the library in an existing Deno/Bun project without the CLI:

**Deno**

```bash
deno add jsr:@dreamer/view
```

**Bun**

```bash
bunx jsr add @dreamer/view
```

**Optional subpaths** (for on-demand imports in either Deno or Bun; use
`deno add` or `bunx jsr add` with the same subpath):

```bash
# Main entry: signal/effect/memo, createRoot, render, renderToString, hydrate
deno add jsr:@dreamer/view
# CSR-only: smaller bundle, no renderToString/hydrate/generateHydrationScript
deno add jsr:@dreamer/view/csr
# Hybrid: createRoot, render, hydrate (for client-side activation after SSR)
deno add jsr:@dreamer/view/hybrid
# Store: reactive state, getters, actions, optional persist (e.g. localStorage)
deno add jsr:@dreamer/view/store
# Reactive: createReactive for forms, value + onInput two-way binding
deno add jsr:@dreamer/view/reactive
# Context: createContext, Provider, useContext for cross-tree injection
deno add jsr:@dreamer/view/context
# Resource: createResource for async data, use with Suspense
deno add jsr:@dreamer/view/resource
# Router: createRouter for SPA routing (History, routes, navigate)
deno add jsr:@dreamer/view/router
# Boundary: Suspense, ErrorBoundary
deno add jsr:@dreamer/view/boundary
# Directive: built-in vIf/vFor/vShow and registerDirective for custom
deno add jsr:@dreamer/view/directive
# Stream: renderToStream for streaming SSR
deno add jsr:@dreamer/view/stream
# Compiler: optimize, createOptimizePlugin for build-time optimizations (optional)
deno add jsr:@dreamer/view/compiler
```

---

## 🌍 Environment Compatibility

| Environment      | Version          | Status                                                          |
| ---------------- | ---------------- | --------------------------------------------------------------- |
| **Deno**         | 2.5+             | ✅ Full support                                                 |
| **Bun**          | 1.0+             | ✅ Full support                                                 |
| **Browser**      | Modern (ES2020+) | ✅ CSR, Hydration                                               |
| **Server**       | -                | ✅ SSR, streaming SSR (no DOM)                                  |
| **Dependencies** | -                | 📦 Optional: happy-dom for tests; @dreamer/test for test runner |

---

## 📁 Project structure and conventions (view-cli)

When you use **view-cli init [dir]** to create a project, the following
structure and conventions apply. Reading this section helps you understand what
each file does and how to add routes or change layout.

### What view init creates

After running `view-cli init`, you get (among others):

- **view.config.ts** — Project config for dev/build/start (see
  [view.config](#viewconfig) below).
- **deno.json** — Compiler options (jsx, jsxImportSource), imports
  (@dreamer/view), tasks (dev, build, start).
- **jsx.d.ts** — TypeScript types for JSX (referenced in deno.json); required
  for TSX type-checking.
- **src/main.tsx** — Entry: creates router, mounts `<App />` into `#root`.
- **src/views/** — File-based routes and convention files.
- **src/router/router.ts** — Router factory (createAppRouter).
- **src/router/routers.tsx** — **Auto-generated** from `src/views`; do not edit
  by hand; it is gitignored.

### Convention files in src/views (underscore prefix)

Files whose name starts with `_` are **special** and are **excluded from normal
route scanning**. Only one of them becomes a route: `_404.tsx` is used as the
notFound route (path `*`).

| File             | Purpose                                                                                         | Route?  |
| ---------------- | ----------------------------------------------------------------------------------------------- | ------- |
| **_app.tsx**     | Root component: uses router, renders Layout + current page.                                     | No      |
| **_layout.tsx**  | Layout wrapper (e.g. nav + main). Can export `inheritLayout = false`.                           | No      |
| **_loading.tsx** | Loading placeholder for lazy route; **scoped to current directory** (not inherited by subdirs). | No      |
| **_404.tsx**     | 404 page; used as the single notFound route (path `*`).                                         | Yes (*) |
| **_error.tsx**   | Error fallback (e.g. for ErrorBoundary).                                                        | No      |

- **_layout and inheritLayout**: In any `_layout.tsx` you can export
  `export const inheritLayout = false` so that route under this directory **does
  not** inherit the parent layout. Layouts can be nested to any depth.
- **_loading scope**: A `_loading.tsx` in a directory only applies to routes in
  **that directory**; subdirectories do not inherit it (they can have their own
  `_loading.tsx`).

### Route files (no underscore)

- **Path mapping**: Files under `src/views` (recursive, max 5 levels) become
  routes. Path is inferred: `home.tsx` or `index.tsx` or `home/index.tsx` → `/`;
  `about.tsx` → `/about`; `blog/post.tsx` → `/blog/post`. Special names
  `not-found` / `404` (with optional `/index`) → path `*` (notFound).
- **Default export**: Every route file **must default-export** the page
  component (e.g. `export default function Home() { ... }`). Using only a named
  export and then `export default Home` can cause runtime error "data.default is
  not a function"; use a single direct default export.
- **export meta**: You can export a `meta` object (title, description, keywords,
  author, og) from a route file; it is merged into that route’s config when
  `routers.tsx` is generated. If `meta` is absent, `title` is inferred from the
  file path.

### view.config

The CLI (dev / build / start) reads **view.config.ts** or **view.config.json**
from the project root.

| Section         | Fields (main)                                        | Description                                                        |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| **server.dev**  | port, host, dev.hmr, dev.watch                       | Dev server and HMR / watch options.                                |
| **server.prod** | port, host                                           | Production server (start command).                                 |
| **build**       | entry, outDir, outFile, minify, sourcemap, splitting | Build entry and output; splitting enables route chunks.            |
| **build.dev**   | same as build                                        | Overrides for dev mode only (e.g. minify: false, sourcemap: true). |
| **build.prod**  | same as build                                        | Overrides for prod mode only.                                      |

- **server.dev.port** / **server.prod.port**: Default 8787; can be overridden by
  environment variable `PORT`.
- **server.dev.dev.hmr**: e.g. `{ enabled: true, path: "/__hmr" }`.
- **build.entry**: Default `"src/main.tsx"`. **build.outDir**: Default `"dist"`.
  **build.outFile**: Default `"main.js"`.
- **build.dev** / **build.prod**: Same shape as **build**; the CLI merges
  **build** with **build.dev** in dev mode (or **build.prod** in prod), so you
  can e.g. set `dev: { minify: false, sourcemap: true }` for debugging and
  `prod: { minify: true }` for production.

The generated `src/router/routers.tsx` is re-generated on each dev build from
`src/views`; do not commit it (it is in .gitignore).

---

## ✨ Characteristics

- **Core**
  - `createSignal` / `createEffect` / `createMemo` — reactive primitives;
    effects re-run when tracked signals change (microtask).
  - `createRoot` / `render` — mount reactive root; fine-grained DOM patch, no
    full tree replace.
  - `createReactiveRoot` — mount a **state-driven** root: you pass
    `(container, getState, buildTree)`; when `getState()` changes (e.g. a
    signal), the tree is rebuilt and patched in place. Use for SPA shells where
    “page state” is owned outside View (e.g. router) and View only renders from
    that state.
  - `renderToString` — SSR/SSG HTML; optional `allowRawHtml: false` for
    dangerouslySetInnerHTML escaping.
  - `hydrate` — activate server-rendered markup; `generateHydrationScript` for
    hybrid apps.
- **Store** (`@dreamer/view/store`)
  - `createStore` — reactive store with state, getters, actions, and optional
    persist (e.g. localStorage).
- **Reactive** (`@dreamer/view/reactive`)
  - `createReactive` — proxy for form models; reads in effects are tracked,
    writes trigger updates.
- **Context** (`@dreamer/view/context`)
  - `createContext` — Provider / useContext / registerProviderAlias for
    cross-tree injection.
- **Resource** (`@dreamer/view/resource`)
  - `createResource(fetcher)` or `createResource(source, fetcher)` — async data
    with `{ data, loading, error, refetch }`.
- **Router** (`@dreamer/view/router`)
  - `createRouter` — History-based SPA routing: routes, basePath,
    beforeRoute/afterRoute, notFound, back/forward/go.
- **Boundary** (`@dreamer/view/boundary`)
  - `Suspense` — fallback until Promise or getter-resolved children.
  - `ErrorBoundary` — catch subtree errors and render fallback(error).
- **Directives** (`@dreamer/view/directive`)
  - Built-in: vIf, vElse, vElseIf, vFor, vShow, vOnce, vCloak; custom via
    `registerDirective`.
- **Stream SSR** (`@dreamer/view/stream`)
  - `renderToStream` — generator of HTML chunks for streaming responses.
- **JSX**
  - `jsx` / `jsxs` / `Fragment` via jsx-runtime; reactive content via getters in
    JSX.

---

## 🎯 Use Cases

- **CSR**: Interactive SPAs with fine-grained updates.
- **SSR / SSG**: Server-render or pre-render to HTML.
- **Streaming SSR**: Stream HTML chunks for faster first paint.
- **Hydration**: Activate SSR HTML in the browser.
- **Forms**: createReactive (or createSignal) + value + onInput/onChange for
  two-way binding.
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

Use **getters** in JSX for reactive content (`{count}`). Forms: **value** +
**onInput** / **onChange** with createSignal or createReactive. Events:
`onClick`, `onInput`, `onChange` (camelCase). Ref: `ref={(el) => { ... }}` or
`ref={refObj}`. Fragment: `<>...</>` or `<Fragment>...</Fragment>`.

---

## 🎨 Examples

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

// Default return is a single object: store.count read, store.count = 1 write, store.increment() call
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
store.count; // read
store.count = 1; // direct assignment
store.setState({ count: 2 }); // or setState
store.double; // getter
store.increment(); // action
```

### createReactive + value + onInput

```tsx
import { createReactive } from "jsr:@dreamer/view/reactive";

const form = createReactive({ name: "" });
// In JSX:
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
// In JSX: use user() in effect or wrap async child in <Suspense fallback={...}>...</Suspense>
```

### Directive usage (built-in + custom)

Use **camelCase** in JSX; use **getters** for reactive directives (vIf, vFor,
vShow). Register custom directives with `registerDirective`, then use them in
JSX.

**All built-in: vIf, vElse, vElseIf, vFor, vShow, vOnce, vCloak**

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
  const [staticText] = createSignal("Rendered once, no effect");
  return (
    <div>
      {/* Conditional: vIf / vElse / vElseIf */}
      <div vIf={() => show()}>Shown when show is true</div>
      <div vElseIf={() => false}>Optional: another condition</div>
      <div vElse>Otherwise this</div>

      {/* List: vFor value is () => array; child is factory (item, index) => VNode; put key on child */}
      <ul>
        <li vFor={() => list()}>
          {(item, index) => <span key={item.id}>{index + 1}. {item.name}</span>}
        </li>
      </ul>

      {/* Toggle display (CSS only, node kept): vShow */}
      <p vShow={() => visible()}>Shown when visible is true</p>

      {/* Render once: vOnce. Getters evaluated once and frozen, no effect; good for static content */}
      <div vOnce>{staticText}</div>

      {/* Hide until hydrated: vCloak. Element gets data-view-cloak; use CSS [data-view-cloak]{ display:none }, removed after hydrate */}
      <div vCloak>Hidden during SSR, shown after client hydrate</div>
    </div>
  );
}
```

**Custom: registerDirective + use in JSX**

```tsx
// Register once at app entry or before root
import { registerDirective } from "jsr:@dreamer/view/directive";

registerDirective("v-focus", {
  mounted(el) {
    (el as HTMLInputElement).focus();
  },
});

// Use in JSX (camelCase vFocus or kebab v-focus)
function Form(): VNode {
  return <input type="text" vFocus />;
}
```

See **registerDirective** in “More API code examples” and **Modules and exports
→ Directive** for more.

### More API code examples

Short examples for APIs not yet shown in the sections above.

**createReactiveRoot (state-driven root)**

Use when the “page” or “route” state is owned outside View (e.g. router). View
only renders from that state and patches when it changes:

```ts
import { createReactiveRoot, createSignal } from "jsr:@dreamer/view";

const [pageState, setPageState] = createSignal({ route: "home", id: null });
const container = document.getElementById("root")!;

const root = createReactiveRoot(container, pageState, (state) => {
  if (state.route === "home") return <Home />;
  if (state.route === "user") return <User id={state.id} />;
  return <NotFound />;
});
// When setPageState({ route: "user", id: "1" }) runs, the tree is patched in place.
// root.unmount() when tearing down.
```

**CSR entry (client-only, smaller bundle)**

When you don't need SSR or hydrate, import from `view/csr` for a smaller bundle
(no renderToString, hydrate, generateHydrationScript):

```tsx
import { createSignal, render } from "jsr:@dreamer/view/csr";
import type { VNode } from "jsr:@dreamer/view";

function App(): VNode {
  const [count, setCount] = createSignal(0);
  return <div onClick={() => setCount(count() + 1)}>Count: {count}</div>;
}
render(() => <App />, document.getElementById("root")!);
```

**onCleanup (cleanup inside effect)**

```ts
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view";

const [id, setId] = createSignal(1);
createEffect(() => {
  const currentId = id();
  const timer = setInterval(() => console.log(currentId), 1000);
  onCleanup(() => clearInterval(timer));
});
```

**renderToString (SSR)**

```ts
import { renderToString } from "jsr:@dreamer/view";

const html = renderToString(() => <div>Hello SSR</div>);
// optional: allowRawHtml: false to escape dangerouslySetInnerHTML
const safe = renderToString(() => <App />, { allowRawHtml: false });
```

**hydrate + generateHydrationScript (hybrid)**

```ts
// Server: output HTML + inject hydration script
import { generateHydrationScript, renderToString } from "jsr:@dreamer/view";
const html = renderToString(() => <App />);
const script = generateHydrationScript({ scriptSrc: "/client.js" });
// return html + script

// Client (e.g. from jsr:@dreamer/view/hybrid): activate
import { hydrate } from "jsr:@dreamer/view/hybrid";
hydrate(() => <App />, document.getElementById("root")!);
```

**createContext (Provider / useContext)**

```tsx
import { createContext } from "jsr:@dreamer/view/context";

const ThemeContext = createContext<"light" | "dark">("light");
// Root: <ThemeContext.Provider value={theme()}><App /></ThemeContext.Provider>
// Child: const theme = ThemeContext.useContext();
```

**createResource(source, fetcher)**

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

**createRouter (start / subscribe / navigate)**

```ts
import { createRouter } from "jsr:@dreamer/view/router";
import { createSignal } from "jsr:@dreamer/view";

const router = createRouter({
  routes: [
    { path: "/", component: () => <Home /> },
    { path: "/user/:id", component: (match) => <User id={match.params.id} /> },
  ],
  notFound: () => <div>Not found</div>,
});
const [match, setMatch] = createSignal(router.getCurrentRoute());
router.subscribe(() => setMatch(router.getCurrentRoute()));
router.start();
// router.navigate("/user/1"); router.back(); router.forward();
```

**ErrorBoundary**

```tsx
import { ErrorBoundary } from "jsr:@dreamer/view/boundary";

<ErrorBoundary fallback={(err) => <div>Error: {String(err?.message)}</div>}>
  <MaybeThrow />
</ErrorBoundary>;
```

**registerDirective (custom directive)**

```ts
import { registerDirective } from "jsr:@dreamer/view/directive";

registerDirective("v-focus", {
  mounted(el) {
    (el as HTMLInputElement).focus();
  },
});
// In JSX: <input vFocus /> or vFocus={true}
```

**renderToStream**

```ts
import { renderToStream } from "jsr:@dreamer/view/stream";

const stream = renderToStream(() => <App />);
for (const chunk of stream) response.write(chunk);
// or ReadableStream.from(renderToStream(() => <App />))
```

**Compiler: optimize / createOptimizePlugin**

```ts
import { createOptimizePlugin, optimize } from "jsr:@dreamer/view/compiler";

const out = optimize(sourceCode, "App.tsx");
// esbuild plugin
import { build } from "esbuild";
await build({
  plugins: [createOptimizePlugin(/\.tsx$/)],
  // ...
});
```

**Store tuple form (asObject: false)**

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

## 📚 Store (detailed) — `jsr:@dreamer/view/store`

Store provides a reactive state tree plus getters, actions, and optional
persistence (e.g. localStorage). It works with createEffect for global state
(user, theme, cart).

### Import and create

```ts
import { createStore, withActions, withGetters } from "jsr:@dreamer/view/store";
```

### Config: CreateStoreConfig

| Field      | Type                | Required | Description                                                                                                                                                               |
| ---------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`    | `T`                 | ✅       | Initial state (shallow-copied); must extend `Record<string, unknown>`                                                                                                     |
| `getters`  | `G`                 | No       | Derived read-only: methods use `this` to read state (e.g. `double() { return this.count * 2 }`); updates reactively in effects                                            |
| `actions`  | `A`                 | No       | Methods: read/write state via `this`, call `this.setState(...)`, or other actions (e.g. `this.increment()`)                                                               |
| `persist`  | `PersistOptions<T>` | No       | Persistence: `key` required; `storage` defaults to localStorage; optional `serialize`/`deserialize`                                                                       |
| `asObject` | `boolean`           | No       | **Default `true`**: return a single object (`store.xxx` read, `store.xxx = value` write, `store.actionName()`). Use `false` to get tuple `[get, set, getters?, actions?]` |

### Return shape

- **Default (asObject true)**: One **object**.
  - Read state: `store.count`, `store.theme` (reactive in effects/components).
  - Write state: `store.count = 1` or `store.setState({ count: 1 })`,
    `store.setState(prev => ({ ...prev, count: prev.count + 1 }))`.
  - With getters: `store.double` etc. (read-only derived).
  - With actions: `store.increment()`, `store.toggleTheme()` etc.
- **asObject: false**: Tuple `[get, set]` or `[get, set, getters]` or
  `[get, set, actions]` or `[get, set, getters, actions]`.

### withGetters / withActions (recommended)

- **withGetters&lt;State, GettersType&gt;()(getters)**: Types getter `this` as
  state for IDE and code navigation (e.g. `this.count`).
- **withActions&lt;State, ActionsType&gt;()(actions)**: Types action `this` to
  include other actions so you can call `this.otherAction()` without type
  assertions.

Define types then pass:

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

### Type exports

- **StorageLike**, **PersistOptions&lt;T&gt;** — persistence.
- **StoreGetters&lt;T&gt;**; **StoreActions&lt;T&gt;**;
  **StoreActionContextBase&lt;T&gt;**; **StoreActionContext&lt;T, A&gt;** —
  getters/actions and action `this`.
- **WithGettersContext&lt;T, G&gt;**; **WithActionsContext&lt;T, A&gt;** —
  withGetters/withActions parameter types.
- **StoreAsObjectStateOnly&lt;T&gt;**; **StoreAsObjectWithGetters&lt;T, G&gt;**;
  **StoreAsObject&lt;T, A&gt;**; **StoreAsObjectWithGettersAndActions&lt;T, G,
  A&gt;** — return object types.
- **CreateStoreConfig&lt;T, G?, A?&gt;** — config type.

---

## 📦 Modules and exports (full)

These match `deno.json` exports; import from the listed subpaths as needed.

### Main entry `jsr:@dreamer/view` (`.`)

Core reactive and rendering API.

| Export                                      | Description                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **createSignal**                            | Returns `[getter, setter]`; getter in effect registers dependency                           |
| **createEffect**                            | Runs once, then re-runs when deps change (microtask); returns dispose                       |
| **createMemo**                              | Cached derived getter                                                                       |
| **onCleanup**                               | Register cleanup in effect/memo (runs when effect re-runs or is disposed)                   |
| **getCurrentEffect** / **setCurrentEffect** | Current effect (internal)                                                                   |
| **isSignalGetter**                          | Detect signal getter                                                                        |
| **createRoot**                              | Create reactive root (root component function)                                              |
| **createReactiveRoot**                      | Create state-driven root: `(container, getState, buildTree)`; state changes trigger patch   |
| **render**                                  | Mount root: `render(() => <App />, container)`                                              |
| **renderToString**                          | SSR: root to HTML string                                                                    |
| **hydrate**                                 | Activate server-rendered HTML in the browser                                                |
| **generateHydrationScript**                 | Generate hydration script tag (hybrid apps)                                                 |
| **Types**                                   | VNode, Root, SignalGetter, SignalSetter, SignalTuple, EffectDispose, HydrationScriptOptions |
| **isDOMEnvironment**                        | Whether in DOM environment                                                                  |

### CSR entry `jsr:@dreamer/view/csr`

Client-only bundle: no renderToString, hydrate, generateHydrationScript.
Exports: createSignal, createEffect, createMemo, onCleanup, createRoot,
**render**, and related types.

### Hybrid entry `jsr:@dreamer/view/hybrid`

Client hybrid entry: **createRoot**, **render**, **hydrate** (no renderToString
/ generateHydrationScript). Use main or stream for server HTML, this entry for
`hydrate()` on the client.

### JSX runtime `jsr:@dreamer/view/jsx-runtime`

React 17+ automatic runtime. Exports **jsx**, **jsxs**, **Fragment**. Configure
deno.json so the compiler injects from `jsr:@dreamer/view` (or
`jsr:@dreamer/view/jsx-runtime`); no need to import in app code.

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jsr:@dreamer/view"
  }
}
```

### Store `jsr:@dreamer/view/store`

See **Store (detailed)** above. Exports: **createStore**, **withGetters**,
**withActions**, and StorageLike, PersistOptions, StoreGetters, StoreActions,
CreateStoreConfig, StoreAsObject* types.

### Reactive `jsr:@dreamer/view/reactive`

Single reactive object for forms and two-way binding.

| Export                      | Description                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **createReactive(initial)** | Turns object into Proxy; reads in effects are tracked, writes trigger updates. Use with `value={form.name}` + `onInput` |

### Boundary `jsr:@dreamer/view/boundary`

| Export                                    | Description                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| **Suspense**                              | Shows fallback until children (Promise or getter) resolve; use with createResource |
| **ErrorBoundary**                         | Catches sync errors in subtree, renders `fallback(error)`                          |
| isErrorBoundary, getErrorBoundaryFallback | Internal/dom use                                                                   |

### Directive `jsr:@dreamer/view/directive`

Built-in vIf, vElse, vElseIf, vFor, vShow, vOnce, vCloak; custom via
**registerDirective**. **Usage examples:** see **Usage examples → Directive
usage** above.

| Export                                                                                                      | Description                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **registerDirective(name, hooks)**                                                                          | Register custom directive; hooks: mounted, updated, unmounted |
| **getDirective**, **hasDirective**, **directiveNameToCamel**, **directiveNameToKebab**, **isDirectiveProp** | Lookup and naming                                             |
| **DirectiveBinding**, **DirectiveHooks**                                                                    | Types                                                         |

Forms: use createReactive or createSignal with `value={...}` + onInput/onChange;
no v-model.

### Resource `jsr:@dreamer/view/resource`

Async data source.

| Export                              | Description                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| **createResource(fetcher)**         | No source; one-shot or refetch; getter returns `{ data, loading, error, refetch }` |
| **createResource(source, fetcher)** | Refetches when source changes; fetcher receives current source value               |
| **ResourceResult&lt;T&gt;**         | Type: data, loading, error, refetch                                                |

Use with Suspense: fallback while loading, content when data is set.

### Compiler `jsr:@dreamer/view/compiler`

Build-time optimizations (static hoisting, constant folding); uses TypeScript
compiler API.

| Export                                       | Description                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| **optimize(code, fileName?)**                | Optimize source, return optimized string               |
| **createOptimizePlugin(filter?, readFile?)** | esbuild onLoad plugin to run optimize on matched files |

### Context `jsr:@dreamer/view/context`

Cross-tree injection.

| Export                          | Description                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **createContext(defaultValue)** | Returns `{ Provider, useContext, registerProviderAlias }`; Provider injects value, useContext reads in children |
| **registerProviderAlias**       | Alias component (e.g. RouterProvider) to inject same context                                                    |

### Stream `jsr:@dreamer/view/stream`

Streaming SSR.

| Export                           | Description                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **renderToStream(fn, options?)** | Renders root to Generator&lt;string&gt;; options may include allowRawHtml. Use `for (const chunk of renderToStream(fn))` or `ReadableStream.from(renderToStream(fn))` |

### Router `jsr:@dreamer/view/router`

Built-in SPA router (History API).

| Export                    | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **createRouter(options)** | Create router; call **start()** to listen to popstate and intercept links           |
| **Router methods**        | getCurrentRoute, href, navigate, replace, back, forward, go, subscribe, start, stop |
| **Types**                 | RouteConfig, RouteMatch, RouteGuard, RouteGuardAfter, CreateRouterOptions           |

Routes: path supports `:param`; component receives match; optional meta.
beforeRoute/afterRoute, notFound supported.

**Route files and `export meta` (view-cli):** When using `view-cli dev`, the
file `src/router/routers.tsx` is auto-generated by scanning `src/views`
(recursive, max 5 levels). For convention files (_app, _layout, _loading, _404,
_error), path mapping, and view.config, see **Project structure and conventions
(view-cli)** above. Route files can export a `meta` object so it is merged into
the generated route config:

```tsx
// src/views/home/index.tsx (or any route file)
export const meta = {
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

**Route page component:** Every route file must **default-export** the page
component (e.g. `export default function Home() { ... }`). If you only use a
named export and then `export default Home`, the runtime can fail with
"data.default is not a function" when loading the route. Use a single direct
default export.

Supported fields: `title`, `description`, `keywords`, `author`, and `og` (with
`title`, `description`, `image`). If no `export meta` is present, `title` is
inferred from the file path. The generated `src/router/routers.tsx` is
gitignored and should not be committed.

---

## 📚 API quick reference

| Area       | API                                                                                                                                         | Import                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Core       | createSignal, createEffect, createMemo, onCleanup, createRoot, createReactiveRoot, render, renderToString, hydrate, generateHydrationScript | `jsr:@dreamer/view`           |
| Store      | createStore, withGetters, withActions                                                                                                       | `jsr:@dreamer/view/store`     |
| Reactive   | createReactive                                                                                                                              | `jsr:@dreamer/view/reactive`  |
| Context    | createContext                                                                                                                               | `jsr:@dreamer/view/context`   |
| Resource   | createResource                                                                                                                              | `jsr:@dreamer/view/resource`  |
| Router     | createRouter                                                                                                                                | `jsr:@dreamer/view/router`    |
| Boundary   | Suspense, ErrorBoundary                                                                                                                     | `jsr:@dreamer/view/boundary`  |
| Directives | registerDirective, hasDirective, getDirective, …                                                                                            | `jsr:@dreamer/view/directive` |
| Stream     | renderToStream                                                                                                                              | `jsr:@dreamer/view/stream`    |

**Core:** createSignal returns `[getter, setter]`; createEffect runs once then
re-runs when deps change (microtask); createMemo returns cached getter.
**Rendering:** createRoot/render mount root; createReactiveRoot for state-driven
roots (container, getState, buildTree) with patch on state change;
renderToString for SSR; hydrate + generateHydrationScript for hybrid.
**Directives:** vIf, vElse, vElseIf, vFor, vShow, vOnce, vCloak (camelCase in
JSX). **Types:** VNode, Root, SignalGetter, SignalSetter, EffectDispose.

More: [docs/zh-CN/README.md](./docs/zh-CN/README.md) (中文) |
[docs/en-US](./docs/en-US/) (English).

---

## 📋 Changelog

**v1.0.2** (2026-02-13) — Added
`createReactiveRoot(container, getState, buildTree)` for state-driven roots with
in-place patch; tests and docs updated. See
[CHANGELOG.md](./docs/en-US/CHANGELOG.md) for full details.

---

## 📊 Test Report

| Metric      | Value      |
| ----------- | ---------- |
| Test date   | 2026-02-13 |
| Total tests | 252        |
| Passed      | 252 ✅     |
| Failed      | 0          |
| Pass rate   | 100%       |
| Duration    | ~1m 35s    |

See [TEST_REPORT.md](./docs/en-US/TEST_REPORT.md) for details.

---

## 📝 Notes

- **No virtual DOM**: Updates are driven by signal/store/reactive subscriptions;
  root re-runs with fine-grained patch.
- **Getters in JSX**: Use getters (e.g. `{count}`, `value={() => name()}`,
  `vShow={() => visible()}`) so the engine can track and update.
- **JSX config**: `compilerOptions.jsx: "react-jsx"` and
  `compilerOptions.jsxImportSource: "jsr:@dreamer/view"` in deno.json.
- **Type safety**: Full TypeScript support; VNode, Root, and effect/signal types
  exported.

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

## 📄 License

Apache License 2.0 - see [LICENSE](./LICENSE)

---

<div align="center">

**Made with ❤️ by Dreamer Team**

</div>
