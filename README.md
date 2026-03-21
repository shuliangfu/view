# @dreamer/view

> A lightweight, fine-grained reactive view engine. No virtual DOM: signals and
> effects drive precise DOM updates. Supports CSR, SSR, streaming SSR, and
> hydration.

English | [中文 (Chinese)](./docs/zh-CN/README.md)

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-509%20passed-brightgreen)](./docs/en-US/TEST_REPORT.md)

---

## 🎯 Features

A reactive view engine with fine-grained updates: no virtual DOM, dependency
tracking via signals and effects, and optional store, router, context, resource,
and boundaries. Use JSX with built-in directives (v-if, v-once, v-cloak, etc.)
for CSR, SSR, streaming SSR, and hydration.

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
# Main entry: signal/effect/memo, createRoot, render, mount, generateHydrationScript
deno add jsr:@dreamer/view
# SSR: renderToString, renderToStream, getActiveDocument, createSSRDocument (use when doing SSR)
deno add jsr:@dreamer/view/ssr
# CSR-only: smaller bundle, no renderToString/hydrate/generateHydrationScript
deno add jsr:@dreamer/view/csr
# Hybrid: createRoot, render, mount (no generateHydrationScript; use compiler's hydrate for activation)
deno add jsr:@dreamer/view/hybrid
# Store: reactive state, getters, actions, optional persist (e.g. localStorage)
deno add jsr:@dreamer/view/store
# Reactive: createReactive for forms, value + onInput two-way binding
deno add jsr:@dreamer/view/reactive
# Context: createContext, Provider, useContext for cross-tree injection
deno add jsr:@dreamer/view/context
# Resource: createResource for async data, use with Suspense
deno add jsr:@dreamer/view/resource
# Router: createRouter for SPA routing (History, routes, navigate, scroll: top/restore)
deno add jsr:@dreamer/view/router
# Portal: createPortal(children, container) for modals/toast outside parent DOM
deno add jsr:@dreamer/view/portal
# Transition: light enter/leave class toggling for show/hide animations
deno add jsr:@dreamer/view/transition
# Boundary: Suspense, ErrorBoundary
deno add jsr:@dreamer/view/boundary
# Directive: built-in vIf/vElse chain, vOnce, vCloak and registerDirective for custom
deno add jsr:@dreamer/view/directive
# Stream: renderToStream for streaming SSR (also available from /ssr)
deno add jsr:@dreamer/view/stream
# Compiler: insert, hydrate, renderToString, etc. (aligned with view-cli full compile)
deno add jsr:@dreamer/view/compiler
# Optimize: build-time optimize / createOptimizePlugin (optional, uses TypeScript API)
deno add jsr:@dreamer/view/optimize
```

---

## Entry points and subpaths

Exports are split by **bundle size and responsibility**. Choose the right entry
for your use case so you don’t pull SSR code when building CSR-only.

### Main entry `jsr:@dreamer/view`

For **CSR / hybrid client**: signals, effects, **insert** family, `createRoot` /
`render` / **mount**, `generateHydrationScript`, `getDocument`, `mergeProps` /
`spreadIntrinsicProps` / `scheduleFunctionRef`, etc.

**No longer exported from main** (moved to subpaths to keep default bundle
small):

| Former main usage                        | Import from                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `renderToString`, `renderToStream`       | `jsr:@dreamer/view/ssr` or `jsr:@dreamer/view/stream` (stream only)                         |
| `getActiveDocument`, `createSSRDocument` | `jsr:@dreamer/view/ssr` (or `jsr:@dreamer/view/compiler` when hand-writing compiled output) |

**Standalone `hydrate(fn, container)`**: Exported from
**`jsr:@dreamer/view/compiler`**. The `fn` must be the **same** compiled
`(container) => void` used with **`renderToString(fn)`** (or streaming SSR);
client calls it on a container that already has server HTML to reuse DOM by
insert points and bind effects.

**`mount(container, fn, options?)`** (main / csr / hybrid): Current behavior is
to resolve the container then call **`render(fn, el)`**; it **does not**
auto-switch to hydrate based on whether the container has children. For hybrid
apps, call **`hydrate`** explicitly on the client (import from **compiler**).

**Removed API**: **`createReactiveRoot`** is no longer provided. Use
**createRoot** + **signal** or **mountWithRouter** instead (see examples below).

### SSR subpath `jsr:@dreamer/view/ssr`

Aggregates server-side APIs: **renderToString**, **renderToStream**,
**getActiveDocument**, **setSSRShadowDocument**, **createSSRDocument**, and
types SSROptions, SSRElement, etc. Add this subpath only when doing SSR or build
scripts.

### Compiler / full runtime `jsr:@dreamer/view/compiler`

Aligns with **view-cli** output: **`(container) => void` + insert**. Exports
**insert**, **insertReactive**, **createRoot**, **render**, **hydrate**,
**renderToString**, **renderToStream**, **getActiveDocument**,
**createSSRDocument**, etc. Use for full-compile apps or when the toolchain uses
`insertImportPath: "@dreamer/view/compiler"`.

**view-cli build**: For `.tsx`, `compileSource` with
`insertImportPath: "@dreamer/view"` will **automatically add**
`import { getActiveDocument } from "@dreamer/view/compiler"` when the output
needs `getActiveDocument()` (main entry no longer exports it).
**init**-generated `deno.json` only needs to map `jsr:@dreamer/view@^…`;
subpaths are resolved via JSR **exports**.

### Other subpaths

`csr`, `hybrid`, `router`, `store`, `directive`, etc. are unchanged; see
**Optional subpaths** and **Modules and exports** below.

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
- **export metadata**: You can export a **`metadata`** object (title,
  description, keywords, author, og) from a route file; it is merged into that
  route’s metadata when `routers.tsx` is generated. If `export metadata` is
  absent, `title` is inferred from the file path.

### view.config

The CLI (dev / build / start) reads **view.config.ts** or **view.config.json**
from the project root.

| Section         | Fields (main)                                                                     | Description                                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **server.dev**  | port, host, dev.hmr, dev.watch                                                    | Dev server and HMR / watch options.                                                                                                                                                                                                                              |
| **server.prod** | port, host                                                                        | Production server (start command).                                                                                                                                                                                                                               |
| **build**       | entry, outDir, outFile, minify, sourcemap, splitting, **optimize**, **cssImport** | Build entry and output; splitting enables route chunks. **optimize** (default true for prod): enable `createOptimizePlugin` for .tsx. **cssImport**: CSS import handling (see [CSS imports](#css-imports-styling)); default inline (styles injected at runtime). |
| **build.dev**   | same as build                                                                     | Overrides for dev mode only (e.g. minify: false, sourcemap: true).                                                                                                                                                                                               |
| **build.prod**  | same as build                                                                     | Overrides for prod mode only.                                                                                                                                                                                                                                    |

- **server.dev.port** / **server.prod.port**: Default 8787; can be overridden by
  environment variable `PORT`.
- **server.dev.dev.hmr**: e.g. `{ enabled: true, path: "/__hmr" }`.
- **build.entry**: Default `"src/main.tsx"`. **build.outDir**: Default `"dist"`.
  **build.outFile**: Default `"main.js"`. **build.optimize**: Default true for
  prod build; enables `createOptimizePlugin` for `.tsx`. Set to `false` to
  disable.
- **build.dev** / **build.prod**: Same shape as **build**; the CLI merges
  **build** with **build.dev** in dev mode (or **build.prod** in prod), so you
  can e.g. set `dev: { minify: false, sourcemap: true }` for debugging and
  `prod: { minify: true }` for production.

### CSS imports (styling)

You can import CSS files in any view or component. The build (via
@dreamer/esbuild) compiles them and injects styles into the page.

- **Default (inline mode)**: Use a normal ES module import; the CSS is bundled
  into JS and a `<style>` tag is injected into `document.head` when the module
  loads. No change to `index.html` is required.

  ```tsx
  // e.g. in src/views/home/index.tsx
  import "../../assets/index.css";

  export default function Home() {
    return <div class="page">...</div>;
  }
  ```

- **Extract mode**: To emit separate `.css` files and have `<link>` tags
  injected into `index.html` (e.g. for cache-friendly assets), set in
  **view.config.ts**:

  ```ts
  build: {
    cssImport: { enabled: true, extract: true },
    // ... rest of build
  },
  ```

  In dev, the CLI automatically injects the built CSS links into the served
  `index.html`.

The path in the import is relative to the current file (e.g.
`../../assets/index.css` from `src/views/home/index.tsx`).

The generated `src/router/routers.tsx` is re-generated on each dev build from
`src/views`; do not commit it (it is in .gitignore).

---

## ✨ Characteristics

- **Core**
  - `createSignal` / `createEffect` / `createMemo` — reactive primitives;
    effects re-run when tracked signals change (microtask).
  - `insert` / `insertReactive` / `insertStatic` / `insertMount` — insert-point
    primitives; shared by compiled output and hand-written CSR (main entry).
  - `createRoot` / `render` — mount reactive root; updates driven by insert +
    effect, no full-tree virtual DOM diff.
  - `mount(container, fn, options?)` — resolves container then
    **`render(fn, el)`**; **`options.noopIfNotFound`** applies (return empty
    Root when selector not found). **Client hydration** use
    **`hydrate(fn, container)`** from **`jsr:@dreamer/view/compiler`** (same
    `fn` as SSR). `MountOptions.hydrate` may not match implementation; refer to
    source.
  - `generateHydrationScript` — inject activation script (hybrid apps; main
    entry).
  - **`renderToString`** / **`renderToStream`** / **`getActiveDocument`** —
    moved to **`jsr:@dreamer/view/ssr`** (stream also at
    `jsr:@dreamer/view/stream`); optional `allowRawHtml: false` (see
    [Security](#-security)).
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
  - Built-in: vIf, vElse, vElseIf, vOnce, vCloak; custom via
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
// main.tsx: root function is (container) => void, use insert inside to attach UI
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

Use **`SignalRef`** in JSX for reactive text (`{count}` unwraps automatically).
In **effects** and **handlers**, read/write with **`count.value`**. Forms:
**value** + **onInput** / **onChange** with createSignal or createReactive.
Events: `onClick`, `onInput`, `onChange` (camelCase). Ref:
`ref={(el) => { ... }}` or `ref={refObj}`. For reactive DOM refs (e.g.
`createEffect` must re-run when the node mounts), use `createRef()` and
`ref={myRef}` so the compiler’s `ref.current = el` updates an internal signal;
plain `{ current: null }` does not trigger effects. Fragment: `<>...</>` or
`<Fragment>...</Fragment>`.

---

## 🎨 Examples

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

Use `createReactive` for form state and bind each field with
`value={form.field}` and `onInput`/`onChange` to update the model. No v-model
directive is required.

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

**Per-field errors:** Keep validation errors in reactive state (e.g.
`createReactive({ name: "", errors: {} as Record<string, string> })`) and show
them next to each field (e.g.
`{form.errors.name && <span class="error">{form.errors.name}</span>}`). Validate
on submit or on blur and assign `form.errors.fieldName = "message"` so the UI
updates reactively.

### Resource + Suspense

```tsx
import { createResource } from "jsr:@dreamer/view/resource";
import { Suspense } from "jsr:@dreamer/view/boundary";

const user = createResource(() => fetch("/api/user").then((r) => r.json()));
// In JSX: use user() in effect or wrap async child in <Suspense fallback={...}>...</Suspense>
```

### Directive usage (built-in + custom)

Use **camelCase** in JSX; use **functions that read `.value`** (or
markSignalGetter) for reactive directives (e.g. `vIf={() => show.value}`).
Register custom directives with `registerDirective`, then use them in JSX.

**All built-in: vIf, vElse, vElseIf, vOnce, vCloak**

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
  const staticText = createSignal("Rendered once, no effect");
  return (
    <div>
      {/* Conditional: vIf / vElse / vElseIf */}
      <div vIf={() => show.value}>Shown when show is true</div>
      <div vElseIf={() => false}>Optional: another condition</div>
      <div vElse>Otherwise this</div>

      {/* List */}
      <ul>
        {() =>
          list.value.map((item, index) => (
            <li key={item.id}>
              {index + 1}. {item.name}
            </li>
          ))}
      </ul>

      {/* Toggle mount with vIf (false unmounts the node) */}
      <p vIf={() => visible.value}>Shown when visible is true</p>

      {/* Render once: vOnce. Values evaluated once and frozen, no effect; good for static content */}
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

**createRoot / render (external router / external state)**

Root API is **`createRoot(fn, container)`** / **`render(fn, container)`**:
**`fn`** is **`(container: Element) => void`**; use **`insert(container, …)`**
inside to attach UI (same shape as **view-cli** compiled output).

- **view-cli + file-based routes**: Root uses `router.getCurrentRouteSignal()()`
  to drive `<RoutePage />`; framework and signals handle updates.
- **Custom SPA + `@dreamer/view/router`**: Use **`mountWithRouter`** so the
  router signal drives the tree.
- **State in View signals**: Read signals in the root **insert** getter or in
  children for fine-grained updates; see
  [Effect scope and render thunk](#effect-scope-and-render-thunk).
- **External non-reactive navigation**: **`root.unmount()`** then **`mount`** /
  **`render`** again, or put “current page” in a **signal** and switch subtree
  inside the same root.

```ts
import { createRoot, createSignal, insert } from "jsr:@dreamer/view";

const container = document.getElementById("root")!;

// Switch page inside root with a signal (recommended)
const route = createSignal<"home" | "user">("home");
createRoot(
  (el) => {
    insert(el, () => (route.value === "home" ? <Home /> : <User />));
  },
  container,
);
```

**CSR entry (client-only, smaller bundle)**

When you don't need SSR or hydrate, import from `view/csr` for a smaller bundle
(no renderToString, hydrate, generateHydrationScript). **Does not export
insert**: when using **mount**, import **insert** from the main entry or
**compiler** (see CSR example below).

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
// mount: resolve container then render; fn must be (el) => void + insert
mount("#root", (el) => {
  insert(el, () => <App />);
});
// Optional: noop when selector not found instead of throwing
mount(
  "#maybe-missing",
  (el) => {
    insert(el, () => <App />);
  },
  { noopIfNotFound: true },
);
```

**onCleanup (cleanup inside effect)**

```ts
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view";

const id = createSignal(1);
createEffect(() => {
  const currentId = id.value;
  const timer = setInterval(() => console.log(currentId), 1000);
  onCleanup(() => clearInterval(timer));
});
```

**renderToString (SSR)**

```ts
import { insert } from "jsr:@dreamer/view";
import { renderToString } from "jsr:@dreamer/view/ssr";

const html = renderToString((el) => {
  insert(el, () => "Hello SSR");
});
// optional: allowRawHtml: false to escape dangerouslySetInnerHTML
const safe = renderToString((el) => {
  insert(el, () => <App />);
}, { allowRawHtml: false });
```

**hydrate + generateHydrationScript (hybrid)**

```ts
// Server: output HTML + inject hydration script (fn must match client hydrate)
import { generateHydrationScript, insert } from "jsr:@dreamer/view";
import { renderToString } from "jsr:@dreamer/view/ssr";

function rootFn(el: Element) {
  insert(el, () => <App />);
}

const html = renderToString(rootFn);
const script = generateHydrationScript({ scriptSrc: "/client.js" });
// return html + script

// Client: explicit hydrate (from compiler; hybrid entry does not export hydrate)
import { hydrate } from "jsr:@dreamer/view/compiler";

hydrate(rootFn, document.getElementById("root")!);

// If only CSR (empty container), use hybrid or main mount with same (el)=>void shape
import { mount } from "jsr:@dreamer/view/hybrid";

mount("#root", (el) => {
  insert(el, () => <App />);
});
```

**SSR: safe document access**

In code that may run on the server, avoid using `document` directly. Use
`getDocument()` from the main entry instead: it returns `document` in the
browser, **`null`** when there is no DOM or during SSR without a shadow
document, and prefers the SSR shadow document when `KEY_VIEW_SSR_DOCUMENT` is
set.

**Developer experience (development only)**

In development builds, the runtime can warn you about common mistakes (these are
disabled in production):

- **Hydration mismatch**: If the structure or keys of server-rendered HTML and
  the first client render differ, a `console.warn` is emitted with context (e.g.
  node path or selector) to help fix layout shifts or white flashes.
- **Reactive text**: If you stringify a `SignalRef` by mistake (e.g. outside
  supported JSX interpolation), a one-time warning may remind you to use
  `{signal}` or `signal.value` so the UI stays reactive.

**createContext (Provider / useContext)**

```tsx
import { createContext } from "jsr:@dreamer/view/context";

const ThemeContext = createContext<"light" | "dark">("light");
// Root: <ThemeContext.Provider value={themeValue()}><App /></ThemeContext.Provider>
// Child: const theme = ThemeContext.useContext();
```

**createResource(source, fetcher)**

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
const match = createSignal(router.getCurrentRoute());
router.subscribe(() => (match.value = router.getCurrentRoute()));
router.start();
// router.navigate("/user/1"); router.back(); router.forward();
```

**Portal (createPortal)**

Render a subtree into a different DOM container (e.g. `document.body`) so
modals, drawers, and toasts are not clipped by parent `overflow` or `z-index`.
Import from `jsr:@dreamer/view/portal`.

```tsx
import { createPortal } from "jsr:@dreamer/view/portal";

// Mount to document.body (default)
const root = createPortal(() => <Modal />);
// Or specify container: createPortal(() => <Modal />, document.getElementById("modal-root")!);
// When closing: root.unmount();
```

**Transition**

Lightweight enter/leave transitions: the component toggles CSS classes only; you
provide the animation via CSS. Import from `jsr:@dreamer/view/transition`.

```tsx
import { createSignal } from "jsr:@dreamer/view";
import { Transition } from "jsr:@dreamer/view/transition";

const visible = createSignal(false);
// CSS: .enter { opacity: 0; } .enter-active { transition: opacity 0.2s; opacity: 1; }
//      .leave { opacity: 1; } .leave-active { transition: opacity 0.2s; opacity: 0; }
<Transition
  show={() => visible.value}
  enter="enter enter-active"
  leave="leave leave-active"
  duration={200}
>
  <div>Content</div>
</Transition>;
```

**ErrorBoundary**

```tsx
import { ErrorBoundary } from "jsr:@dreamer/view/boundary";

<ErrorBoundary fallback={(err) => <div>Error: {String(err?.message)}</div>}>
  <MaybeThrow />
</ErrorBoundary>;
```

**ErrorBoundary placement:** Prefer wrapping at **route or layout** level so one
failing page or section does not break the whole app. Put a global ErrorBoundary
around the root tree and optional inner ones around heavy or third-party
sections.

**Accessibility (a11y):** For dynamic content that changes after load (e.g. live
regions), add `aria-live="polite"` or `aria-live="assertive"` on the container
so screen readers announce updates. Manage focus explicitly when opening modals
or dialogs (e.g. move focus to the first focusable element and trap focus inside
until close). Use `aria-label` or visible labels on controls; decorative-only
elements can use `aria-hidden="true"`.

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
import { insert } from "jsr:@dreamer/view";
import { renderToStream } from "jsr:@dreamer/view/stream";

const stream = renderToStream((el) => {
  insert(el, () => <App />);
});
for (const chunk of stream) response.write(chunk);
// or ReadableStream.from(renderToStream((el) => { insert(el, () => <App />); }))
```

**Optimize: optimize / createOptimizePlugin**

`view-cli build` enables the optimize plugin by default for `.tsx` (constant
folding and static hoisting). Use `build.optimize: false` in view.config to
disable. With a custom bundler, import from **`jsr:@dreamer/view/optimize`**
(not compiler):

```ts
import { createOptimizePlugin, optimize } from "jsr:@dreamer/view/optimize";

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

**Store key:** Use a **fixed key** (e.g. `"app"`, `"theme"`) so the same
instance is reused across chunks. Avoid **dynamic keys** (e.g.
`` `user-${id}` ``) when the store is created and destroyed over time: the
global registry does not remove entries automatically, so dynamic keys can cause
unbounded memory growth. When a store instance is no longer needed (e.g. a modal
or route-scoped store), call **`unregisterStore(key)`** to remove it from the
registry.

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

Core reactive and rendering API. The main entry does **not** re-export router,
store, stream, boundary, portal, transition, etc.; import those from subpaths
(e.g. `@dreamer/view/router`) so unused modules are not bundled (tree-shake
friendly).

| Export                                                                               | Description                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **createSignal**                                                                     | Returns **`SignalRef<T>`**; use **`.value`** to read/write; reading in effect registers dependency                                                                 |
| **createEffect**                                                                     | Runs once, then re-runs when deps change (microtask); returns dispose                                                                                              |
| **createMemo**                                                                       | Cached derived getter                                                                                                                                              |
| **onCleanup**                                                                        | Register cleanup in effect/memo (runs when effect re-runs or is disposed)                                                                                          |
| **untrack**                                                                          | Read signals in callback without registering deps (advanced)                                                                                                       |
| **getCurrentEffect** / **setCurrentEffect**                                          | Current effect (internal)                                                                                                                                          |
| **isSignalGetter**                                                                   | Detect signal getter                                                                                                                                               |
| **isSignalRef**                                                                      | Detect `SignalRef` from `createSignal`                                                                                                                             |
| **unwrapSignalGetterValue**                                                          | Unwrap getter or `SignalRef` (used by compiler for text / controlled inputs)                                                                                       |
| **createRef**                                                                        | Create ref object; use with `ref={refObj}` so effect re-runs when node mounts/unmounts                                                                             |
| **createRoot**                                                                       | Create root: runs **`fn(container)`** once, use **insert** inside to build UI; returns **Root** (`unmount`, `container`)                                           |
| **render**                                                                           | Same as **`createRoot(fn, container)`**; **`fn`** is **`(container) => void`** (matches compiled output)                                                           |
| **mount**                                                                            | Convenience for **`render(fn, el)`**: `container` = selector or Element; **`options.noopIfNotFound`** returns empty Root when not found; **does not** auto-hydrate |
| **insert** / **insertReactive** / **insertStatic** / **insertMount**                 | Insert-point APIs; aligned with compiler output                                                                                                                    |
| **mergeProps** / **splitProps** / **spreadIntrinsicProps** / **scheduleFunctionRef** | Compile-time props and function ref (re-exported from compiler)                                                                                                    |
| **generateHydrationScript**                                                          | Generate hydration script tag (hybrid apps)                                                                                                                        |
| **hydrate** (explicit API)                                                           | From **`jsr:@dreamer/view/compiler`**; use **`hydrate(fn, container)`** for client hydration (same `fn` as SSR); **mount** does not auto-hydrate                   |
| **getDocument**                                                                      | Safe document access: returns `document` on client, **`null`** without DOM / SSR (unless shadow document is set)                                                   |
| **Types**                                                                            | VNode, Root, MountOptions, SignalRef, SignalGetter, SignalSetter, SignalTuple, EffectDispose, HydrationScriptOptions, ElementRef, InsertParent, InsertValue        |
| **setGlobal**                                                                        | Set global document etc. (internal/advanced)                                                                                                                       |
| **isDOMEnvironment**                                                                 | Whether in DOM environment                                                                                                                                         |

**SSR** (`renderToString`, `renderToStream`, `getActiveDocument`,
`createSSRDocument`) is on **`jsr:@dreamer/view/ssr`**; omit for CSR-only to
keep bundle small.

### SSR subpath `jsr:@dreamer/view/ssr`

Exports: **renderToString**, **renderToStream**, **getActiveDocument**,
**setSSRShadowDocument**, **createSSRDocument**, and types SSROptions,
SSRElement, SSRNode, SSRTextNode. Import when doing server or streaming SSR.

### CSR entry `jsr:@dreamer/view/csr`

Client-only bundle: no renderToString, hydrate, generateHydrationScript. **Does
not export insert**: when using **mount**, import **insert** from main or
**compiler** (see CSR example above). Exports: createSignal, createEffect,
createMemo, onCleanup, createRoot, **render**, **mount** (selector or Element,
always render), and related types.

### Hybrid entry `jsr:@dreamer/view/hybrid`

Client lightweight entry: **createRoot**, **render**, **mount** (same mount
model as csr). **Does not export generateHydrationScript** or
**renderToString**. **Does not export `hydrate`**: when the container already
has server HTML, call **`hydrate(fn, container)`** from
**`jsr:@dreamer/view/compiler`** on the client (`fn` must match SSR). Server
HTML and scripts can still use main entry’s **generateHydrationScript** etc.

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

See **Store (detailed)** above. Exports: **createStore**, **unregisterStore**,
**withGetters**, **withActions**, and StorageLike, PersistOptions, StoreGetters,
StoreActions, CreateStoreConfig, StoreAsObject* types.

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

Built-in vIf, vElse, vElseIf, vOnce, vCloak; custom via **registerDirective**.
**Usage examples:** see **Usage examples → Directive usage** above.

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

### Exports and tree-shaking

The main entry (`jsr:@dreamer/view`) **does not** re-export router, store,
stream, boundary, directive, etc. Import them from subpaths (e.g.
`@dreamer/view/router`). Unused subpaths are not bundled, keeping the main
bundle small.

### Compiler `jsr:@dreamer/view/compiler`

**This subpath exports**: **insert**, **insertReactive**, **insertStatic**,
**createRoot**, **render**, **hydrate**, **renderToString**, **renderToStream**,
**getActiveDocument**, **createSSRDocument**, **mergeProps** / **splitProps** /
**spreadIntrinsicProps**, **scheduleFunctionRef**, and signal/effect types —
aligned with **view-cli** full compile. **view-cli** automatically adds
`import { getActiveDocument } from "@dreamer/view/compiler"` when
`insertImportPath` is main and the output needs **getActiveDocument**.

**Does not include** `optimize` / `createOptimizePlugin` (see
**`jsr:@dreamer/view/optimize`**).

### Optimize `jsr:@dreamer/view/optimize`

Build-time optimization (static hoisting, constant folding); uses **TypeScript
compiler API**, loaded only when used.

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

| Export                    | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| **createRouter(options)** | Create router; call **start()** to listen to popstate and intercept links                       |
| **Router methods**        | getCurrentRoute, href, navigate, replace, back, forward, go, subscribe, start, stop             |
| **Types**                 | RouteConfig, RouteMatch, RouteMatchWithRouter, RouteGuard, RouteGuardAfter, CreateRouterOptions |

Routes: path supports `:param`; component receives match; optional meta.
beforeRoute/afterRoute, notFound supported. **scroll**: `'top'` scrolls to (0,0)
after navigation; `'restore'` restores the previous scroll position for that
path; `false` (default) does nothing.

**Link interception (interceptLinks):** When `interceptLinks: true` (default)
and **start()** is called, the router listens for clicks on `<a>` and performs
client-side navigation for same-origin links. The following are **not**
intercepted (browser handles them normally):

| Condition                                                                | Not intercepted (browser default) |
| ------------------------------------------------------------------------ | --------------------------------- |
| `target="_blank"` or any `target` ≠ `_self`                              | Open in new tab/window            |
| `download` attribute present                                             | Download resource                 |
| `data-native` attribute present                                          | Opt-out: use native navigation    |
| History mode: same pathname+search, link has hash only (e.g. `#section`) | In-page anchor scroll             |
| Hash mode: link is `#section` (single `#`, not `#/path`)                 | In-page anchor                    |
| Modifier keys (Ctrl, Meta, Shift) or non–left mouse button               | e.g. open in new tab              |
| Cross-origin or non-`http:`/`https:` URL                                 | External link                     |
| Invalid or empty `href`                                                  | No navigation                     |

Only a **left-click** on a same-origin `http:`/`https:` link that does not match
any row above is intercepted and triggers `navigate()` (and guards). Set
`interceptLinks: false` in options to disable link interception entirely.

**Route files and `export metadata` (view-cli):** When using `view-cli dev`, the
file `src/router/routers.tsx` is auto-generated by scanning `src/views`
(recursive, max 5 levels). For convention files (_app, _layout, _loading, _404,
_error), path mapping, and view.config, see **Project structure and conventions
(view-cli)** above. Route files can export **`metadata`** so it is merged into
the generated route config:

```tsx
// src/views/home/index.tsx (or any route file)
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

**Route page component:** Every route file must **default-export** the page
component (e.g. `export default function Home() { ... }`). If you only use a
named export and then `export default Home`, the runtime can fail with
"data.default is not a function" when loading the route. Use a single direct
default export.

Supported fields: `title`, `description`, `keywords`, `author`, and `og` (with
`title`, `description`, `image`). If no `export metadata` is present, `title` is
inferred from the file path. The generated `src/router/routers.tsx` is
gitignored and should not be committed.

---

## 📚 API quick reference

| Area             | API                                                                                                                                                         | Import                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Core             | createSignal, createEffect, createMemo, onCleanup, untrack, createRef, createRoot, render, mount, insert*, mergeProps, generateHydrationScript, getDocument | `jsr:@dreamer/view`            |
| Compiler runtime | insert, hydrate, renderToString, renderToStream, getActiveDocument, createSSRDocument (overlap with above)                                                  | `jsr:@dreamer/view/compiler`   |
| Optimize         | optimize, createOptimizePlugin                                                                                                                              | `jsr:@dreamer/view/optimize`   |
| SSR              | renderToString, renderToStream, getActiveDocument, createSSRDocument                                                                                        | `jsr:@dreamer/view/ssr`        |
| Store            | createStore, unregisterStore, withGetters, withActions                                                                                                      | `jsr:@dreamer/view/store`      |
| Reactive         | createReactive                                                                                                                                              | `jsr:@dreamer/view/reactive`   |
| Context          | createContext                                                                                                                                               | `jsr:@dreamer/view/context`    |
| Resource         | createResource                                                                                                                                              | `jsr:@dreamer/view/resource`   |
| Router           | createRouter (scroll: top/restore/false)                                                                                                                    | `jsr:@dreamer/view/router`     |
| Portal           | createPortal(children, container)                                                                                                                           | `jsr:@dreamer/view/portal`     |
| Transition       | Transition (show, enter, leave, duration)                                                                                                                   | `jsr:@dreamer/view/transition` |
| Boundary         | Suspense, ErrorBoundary                                                                                                                                     | `jsr:@dreamer/view/boundary`   |
| Directives       | registerDirective, hasDirective, getDirective, …                                                                                                            | `jsr:@dreamer/view/directive`  |
| Stream           | renderToStream                                                                                                                                              | `jsr:@dreamer/view/stream`     |

See **Store (detailed)** and **Modules and exports** above for full
descriptions.

More: [docs/zh-CN/README.md](./docs/zh-CN/README.md) (中文) |
[docs/en-US](./docs/en-US/) (English).

---

## 📋 Changelog

**v1.3.3** (2026-03-21): **Breaking** — **`createSignal` → `SignalRef`**
(`.value` read/write); router **`getState`** / **`createResource`** source /
**`Transition.show`** / Context **`Provider`** support **`SignalRef`**;
**removed** compiler **`v-for` / `v-show`** and directive helpers; **added**
**`isSignalRef`**, handwritten VNode **vIf chain / vOnce / vCloak /
applyDirectives** in **`vnode-mount`**, analysis docs; **fixed**
**`insertReactive`** + controlled input unwrap, directive **`updated`** for
refs, SSR style proxy symbols, HMR getter, stray router line. **v1.3.2**: `vIf`
codegen + **`getDocument()`** null + esbuild **^1.1.5** + CI Node 24. Full
history: [CHANGELOG.md](./docs/en-US/CHANGELOG.md).

---

## 📊 Test Report

| Metric      | Value                                |
| ----------- | ------------------------------------ |
| Test date   | 2026-03-21                           |
| Total tests | 509 (Deno) / 465 (Bun)               |
| Passed      | 509 ✅ / 465 ✅                      |
| Failed      | 0                                    |
| Pass rate   | 100%                                 |
| Duration    | ~1m55s (Deno) / ~85s (Bun, 45 files) |

Includes unit, integration, E2E (CLI/browser), and **SSR document shim**
(component access to document does not throw). See
[TEST_REPORT.md](./docs/en-US/TEST_REPORT.md) for details.

---

## Effect scope and render thunk

When the root builds the tree (e.g.
**`createRoot((el) => { insert(el, () => <App />); }, container)`**), **every
signal read during that single run is tracked by the root effect**. So if a
child component returns JSX that contains a reactive directive like
`vIf={() => isOpen.value}`, the **root** subscribes to `isOpen`. When that
signal later changes (e.g. the modal opens), the root effect re-runs, the whole
tree is re-built, and **parent components’ `createEffect` callbacks run again**
— which can cause duplicate side effects (e.g. layout logic running twice).

**Solution: render thunk.** When a component **returns a function** that returns
the VNode (e.g. `return () => ( <div vIf={() => isOpen.value}>...</div> )`),
that slot is rendered in its **own effect** (see CHANGELOG [1.0.4]). The signal
is then read only inside that inner effect, so **only that effect** subscribes;
the root does not. When the modal opens, only the modal’s subtree re-runs, and
the root (and e.g. layout effects) do not.

**When to use:**

- **Modals, toasts, drawers**: Prefer `return () => ( ... )` so opening/closing
  does not re-run the root or parent effects.
- **Heavy conditional UI**: Any component whose visibility or content is driven
  by a local signal and that sits under a shared root (e.g. layout) benefits
  from returning a thunk to avoid the root subscribing.

**Reminder:** Use **functions that read reactive state** for directives (e.g.
`vIf={() => isOpen.value}` instead of `vIf={isOpen.value}` as a static prop).
With a function, the subscription is attached to the effect that evaluates the
directive; with a plain value the root can subscribe and re-run the whole tree
on update (see CHANGELOG [1.0.4]).

---

## 📝 Notes

- **No virtual DOM**: Updates are driven by signal/store/reactive subscriptions;
  root re-runs with fine-grained patch.
- **Reactive JSX**: Use `SignalRef` in text (`{count}`), `.value` in handlers
  and effects, and functions for directives (e.g. `vIf={() => visible.value}`)
  so the engine can track and update.
- **JSX config**: `compilerOptions.jsx: "react-jsx"` and
  `compilerOptions.jsxImportSource: "jsr:@dreamer/view"` in deno.json.
- **Effect scope**: For modals/toasts/conditionals that use a local signal (e.g.
  `vIf={() => isOpen.value}`), have the component **return a thunk**
  (`return () => ( ... )`) so the root does not subscribe and parent effects do
  not re-run; see
  [Effect scope and render thunk](#effect-scope-and-render-thunk).
- **Type safety**: Full TypeScript support; VNode, Root, and effect/signal types
  exported.

---

## 🔒 Security

- **dangerouslySetInnerHTML / innerHTML**: Any use of `dangerouslySetInnerHTML`
  or `innerHTML` (in DOM props or SSR stringify) must receive **only trusted or
  sanitized content**. Never insert unsanitized user input, or you risk XSS.
- **SSR**: Prefer **`allowRawHtml: false`** when calling `renderToString` or
  `renderToStream` (or equivalent options) so that raw HTML is escaped by
  default and server output is safer. Use raw HTML only when you control the
  source.

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
