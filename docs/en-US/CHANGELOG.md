# Changelog

All notable changes to @dreamer/view are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] - 2026-02-14

### Added

- **createReactiveRoot(container, getState, buildTree)** — Create a state-driven
  root: when `getState()` (e.g. a signal) changes, the tree is rebuilt and
  patched in place without full unmount. Exported from main,
  `@dreamer/view/csr`, and `@dreamer/view/hybrid`. Suited for SPA shells where
  page/route state is owned outside View (e.g. router) and View only renders
  from that state.

### Changed

- **Tests:** Added 5 unit tests for createReactiveRoot (initial mount, reactive
  patch with signal, unmount cleanup, object state patch, set-after-unmount
  edge). Total tests: 252.

- **Docs:** TEST_REPORT (en/zh) and README (en/zh) updated with
  createReactiveRoot description, usage, and examples.

---

## [1.0.1] - 2026-02-14

### Changed

- **Documentation:** License badge and README license section updated from MIT
  to Apache-2.0; links point to LICENSE and NOTICE.

---

## [1.0.0] - 2026-02-12

### Added

- **Core**
  - `createSignal(initialValue)` — reactive signal with getter/setter;
    dependencies tracked in effects.
  - `createEffect(fn)` — side effect that re-runs when tracked signals change
    (microtask); returns dispose; supports `onCleanup`.
  - `createMemo(fn)` — derived value cached until dependencies change.
  - `createRoot(fn, container)` / `render(fn, container)` — mount reactive root;
    fine-grained DOM updates without full tree replace.
  - `renderToString(fn, options?)` — SSR/SSG HTML output; optional
    `allowRawHtml: false` for v-html escaping.
  - `hydrate(fn, container)` — activate server-rendered markup and attach
    listeners/effects.
  - `generateHydrationScript(options?)` — inject initial data and optional
    client script for hybrid apps.
  - `isDOMEnvironment()` — detect DOM availability for SSR/CSR branching.

- **Store** (`@dreamer/view/store`)
  - `createStore(config)` — reactive store with `state`, optional `getters`,
    `actions`, and `persist` (e.g. localStorage).

- **Reactive** (`@dreamer/view/reactive`)
  - `createReactive(initial)` — proxy object for form models; reads in effects
    are tracked, writes trigger updates.

- **Context** (`@dreamer/view/context`)
  - `createContext(defaultValue)` — returns `Provider`, `useContext`, and
    `registerProviderAlias` for cross-tree injection.

- **Resource** (`@dreamer/view/resource`)
  - `createResource(fetcher)` — async data getter with
    `{ data, loading, error, refetch }`.
  - `createResource(source, fetcher)` — re-fetch when source getter changes.

- **Router** (`@dreamer/view/router`)
  - `createRouter(options)` — History-based SPA routing: routes, basePath, link
    interception, `beforeRoute` / `afterRoute`, notFound, `back` / `forward` /
    `go`, meta.

- **Boundary** (`@dreamer/view/boundary`)
  - `Suspense` — fallback until Promise or getter-resolved children.
  - `ErrorBoundary` — catch subtree errors and render fallback(error).

- **Directives** (`@dreamer/view/directive`)
  - Built-in: `vIf`, `vElse`, `vElseIf`, `vFor`, `vShow`, `vOnce`, `vCloak`
    (camelCase in JSX).
  - Custom directives:
    `registerDirective(name, { mounted, updated, unmounted })`.
  - Helpers: `hasDirective`, `getDirective`, `directiveNameToCamel`,
    `directiveNameToKebab`, `getDirectiveValue`, `hasStructuralDirective`,
    `createBinding`, etc.
  - Form two-way binding: use `value` + `onInput`/`onChange` with signal or
    createReactive; no v-model directive.

- **Stream SSR** (`@dreamer/view/stream`)
  - `renderToStream(fn, options?)` — generator of HTML chunks for streaming
    responses.

- **JSX**
  - `jsx` / `jsxs` and `Fragment` via `@dreamer/view` (jsx-runtime);
    configurable via `jsxImportSource`.

- **DOM**
  - Fine-grained updates: dynamic children (getter), keyed reconciliation, vShow
    and other directive getters in effects.
  - Events: `onClick`, `onInput`, `onChange`, etc. bound via addEventListener.
  - Ref: callback or `{ current }` for post-mount DOM reference.
  - SVG namespace and directive application order (vShow and other directives,
    then props).

- **Compiler** (`@dreamer/view/compiler`)
  - Build-time optimizations: `optimize`, `createOptimizePlugin` for esbuild or
    other bundlers (optional).

- **CLI (view-cli)**
  - Global install: `deno run -A jsr:@dreamer/view/setup`; then run `view-cli`
    from any directory.
  - `view-cli init [dir]` — scaffold project (views, view.config.ts, _app,
    _layout, _loading, _404, _error).
  - `view-cli dev` — build then start static server (dev mode).
  - `view-cli build` — build only (output to dist/).
  - `view-cli start` — start static server only (requires prior build).
  - `view-cli upgrade` — upgrade @dreamer/view to latest (use `--beta` for
    beta).
  - `view-cli update` — update project dependencies and lockfile (use `--latest`
    for latest).
  - `view-cli version` / `view-cli --version` — show version.
  - `view-cli --help` — show full help.

### Notes

- No virtual DOM; updates are driven by signal/store/reactive subscriptions.
- Root component is reactive; reading signals in the root function triggers
  re-expand and patch, not full tree replace.
- All APIs support Deno/JSR; examples and tests use `@dreamer/test` and
  happy-dom where applicable.

[1.0.0]: https://github.com/dreamer-jsr/view/releases/tag/v1.0.0
