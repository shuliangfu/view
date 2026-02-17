# Changelog

All notable changes to @dreamer/view are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.17] - 2026-02-17

### Fixed

- **Setup:** Use `stdin: "null"` for deno install spawn so the child does not
  wait for terminal input; call `child.unref()` right after spawn so the setup
  process can exit. Entry point calls `exit(0)` when `installGlobalCli()`
  resolves so the process exits (Deno keeps refs otherwise).
- **Upgrade:** Spawn setup with `stdin: "null"`, call `child.unref()` after
  spawn, and call `exit(0)` on success / `exit(1)` on failure so the CLI process
  exits when the command finishes.

---

## [1.0.16] - 2026-02-17

### Fixed

- **Upgrade command (Deno):** Call `child.unref()` after awaiting spawn status
  so the CLI process exits after the install child finishes (same as dweb;
  avoids hang on Deno).

---

## [1.0.15] - 2026-02-17

### Added

- **Docs – Link interception:** README (en/zh) and router module JSDoc now
  document which `<a>` clicks are intercepted when `interceptLinks: true` and
  which are not: not intercepted are `target` ≠ `_self`, `download`,
  `data-native`, same-page hash (pathname+search equal + hash only), hash mode
  `#section` (vs `#/path`), modifier keys or non-left click, cross-origin or
  non-http(s) URL, invalid or empty `href`. Table and summary added in both
  READMEs.

### Changed

- **Test report & README:** Updated to 435 tests (router 40, integration 14);
  test badge and summary tables in README and zh-CN README set to 435 passed.
  Test date 2026-02-17; report version 1.0.15.

---

## [1.0.14] - 2026-02-16

### Changed

- **Store:** Refactored `createStore` implementation: extracted
  `makeActionContextProxy` and `makeStoreObjectProxy` to share Proxy logic
  across getters/actions/asObject branches; all overloads and API unchanged.
- **Version:** Inlined `getVersionCachePath` into `readVersionCache` and
  `writeVersionCache`; removed the helper to reduce source size.
- **Router:** Added `buildMatch` helper to construct `RouteMatch` in
  `matchPath`, removing duplicated object literals for matched and notFound
  cases.
- **DOM (element):** Added `registerPlaceholderEffect` and `getItemKey`;
  `reconcileKeyedChildren` now accepts `oldItems` and patches the wrapper’s
  child in place when the same key exists (via `patchNode`) instead of replacing
  inner content, reducing DOM churn for keyed lists.
- **DOM (props):** In `applySingleProp`, skip DOM write when value is unchanged
  for className, style (string and object), form value, checked/selected, and
  generic attributes.
- **Directive:** Custom directive `mounted` hook now runs via `queueMicrotask`
  when available (fallback: `setTimeout(..., 0)`) so it runs earlier after the
  element is in the document.
- **Runtime:** Root effect skips expand and patch when the root VNode reference
  is unchanged (e.g. memo or stable ref), avoiding redundant work.

---

## [1.0.13] - 2026-02-16

### Added

- **RoutePage match.getState(key, initial):** Path-stable page state so
  components can use state inside the component body and clicks still trigger
  updates (without caching page VNode). When the route path changes, the
  previous path’s state is cleared.
- **Router types:** Exported `GetState` and `RoutePageMatch` from
  `@dreamer/view/router` for page components that use `match.getState`.
- **Portal & Transition:** Documented and highlighted Portal (render into a
  container) and Transition (show/hide with enter/leave classes and duration).
- **CSS import in view files:** View and component files can import CSS (e.g.
  `import "../../assets/index.css"`); build inlines styles by default or
  extracts to `.css` when `cssImport.extract: true`.

### Fixed

- **Docs:** createContext example in README (en/zh) changed `theme()` to
  `themeValue()` so Tailwind tooling does not report “'' does not exist in your
  theme config” when parsing the snippet.

---

## [1.0.12] - 2026-02-16

### Fixed

- **view-cli upgrade and setup:** The upgrade command and setup script ran
  subprocesses (e.g. `deno install`) with `stdout`/`stderr` set to `"piped"` but
  did not read the pipes, so the child could block when the pipe buffer filled
  and the CLI appeared stuck. Both now use `stdout`/`stderr` `"null"` so output
  is discarded and the process exits after installation without blocking.

---

## [1.0.11] - 2026-02-15

### Fixed

- **Child nodes:** Boolean `false` and empty string `""` in JSX children were
  rendered as text ("false" or empty DOM text). They are now treated as empty
  and skipped (no DOM output) in both client and SSR.

### Added

- **isEmptyChild(value):** Helper in `dom/shared.ts`; returns true for `null`,
  `undefined`, `false`, and `""`. Used by `normalizeChildren` (element.ts) and
  `normalizeChildrenForSSR` (stringify.ts) so these values are not turned into
  text nodes.

---

## [1.0.10] - 2026-02-15

### Changed

- **Dependencies:** Bump `@dreamer/esbuild` to `^1.0.24` (Windows CI resolver
  fix: relative entry path and native cwd for `deno info`).

---

## [1.0.9] - 2026-02-15

### Fixed

- **Input/textarea value issue caused by vIf/vShow directives.** In
  `applySingleProp` (props.ts), form `value` is now applied before the generic
  `value == null` branch. When vIf/vShow toggles and patch passes `undefined` or
  `null`, the DOM input value is correctly cleared instead of skipping the value
  branch and leaving the old value on the element.

### Added

- **Tests:** Extended unit tests for **applyProps** (ref, vShow/vCloak,
  value/checked reactive, events, class, style, attributes, custom directives —
  55 tests), **store** (persist edge cases, getters/actions, same-key instance,
  setState updater, Proxy ownKeys — 29 tests), **meta** (getMetaHeadFragment and
  applyMetaToHead edge cases — 21 tests), **compiler** (constant folding
  divisor/modulo zero, unary plus, .tsx, onLoad catch — 13 tests). Integration
  count 14, E2E browser 52. Total **381 tests**, all passing (~2m).

### Changed

- **props.ts:** Removed debug logs and unused `_isFocusedFormElement`. Test
  report and README updated to 381 tests.

---

## [1.0.8] - 2026-02-13

### Fixed

- **SSR: plain function as child.** In `normalizeChildrenForSSR` (stringify.ts),
  when a child is a plain function (not a signal getter), it is now invoked and
  the return value is normalized instead of being stringified. This fixes
  hybrid/SSR output where JS function source code was rendered as HTML on first
  paint.
- **Input focus when getter returns single Fragment.** In `appendDynamicChild`
  (element.ts), when the normalized dynamic children contain exactly one
  Fragment, that Fragment’s children are expanded into `items` so that
  `lastItems` matches the actual DOM slots. Reconcile no longer removes or
  replaces the wrong nodes, so inputs inside such a getter (e.g.
  `() => ( <> <input /> ... </> )`) keep focus when other signals update.

### Added

- **Tests:** Extended `renderToString` and `renderToStream` for SSR branch
  coverage (null/undefined/function/signal getter children, keyed, void,
  ErrorBoundary, etc.). Integration test: getter returning Fragment with input
  preserves same DOM node (no focus loss). Test report and README updated for
  290 tests (~1m 37s).

---

## [1.0.7] - 2026-02-13

### Fixed

- **appendDynamicChild (unkeyed):** Uses reconcile with `lastItems` instead of
  full `replaceChildren` on every getter run. Controlled inputs (e.g.
  `value={input()}`) inside dynamic getters no longer lose focus when typing.
- **patchNode:** Fragment-vs-Fragment now reconciles children on the parent.
  Component (function type) nodes are replaced so they re-run and read latest
  context/signals. ContextScope nodes are replaced so Provider value updates
  (e.g. theme switch) correctly update consumer DOM.

---

## [1.0.6] - 2026-02-13

### Fixed

- **Hydrate when component returns a function:** When a component returns a
  function (e.g. `() => ( <> ... </> )` for fine-grained updates), hydrate now
  treats it as a dynamic slot: creates a placeholder, replaces the corresponding
  DOM node, and calls `appendDynamicChild`, instead of recursing into it as a
  VNode. This prevents "Cannot use 'in' operator to search for 'vIf' in
  undefined" during HYDRATE render.
- **hasStructuralDirective:** Safely handles `null` or non-object `props` (e.g.
  when passed from hydrate path with a function "vnode"); returns `null` instead
  of throwing.

---

## [1.0.5] - 2026-02-14

### Added

- **Init template (home.tsx):** v-if demo section — conditional blocks (count ≤
  2 → AAA, 3–5 → BBB, else → CCC) with getter-based `vIf`/`vElseIf`/`vElse` and
  styled badges (emerald / amber / slate) for clearer UX.

---

## [1.0.4] - 2026-02-14

### Changed

- **Init template (home.tsx):** Counter uses module-level `createSignal` and
  `{count}` for display (same as example project), so the root effect does not
  subscribe to count and the counter works correctly.
- **Component returning function:** When a component returns `() => VNode`, the
  slot is rendered in its own effect (expandVNode + createElement); component
  body runs once so local state (e.g. createSignal inside component) is
  preserved.
- **Reactive v-if:** Use a getter for conditions, e.g.
  `vIf={() => count() <= 2}`, so only the v-if effect subscribes to the signal;
  using `vIf={count() <= 2}` would subscribe the root and can reset component
  state on update.

---

## [1.0.3] - 2026-02-13

### Added

- **mount(container, fn, options?)** — Unified mount API for CSR, hybrid, and
  full entry. `container` may be a CSS selector (e.g. `"#root"`) or an
  `Element`. In hybrid/full: if container has child nodes → hydrate, else →
  render. Options: `hydrate` (force hydrate or render), `noopIfNotFound` (return
  empty Root when selector does not match). Exported from main,
  `@dreamer/view/csr`, and `@dreamer/view/hybrid`. Reduces branching and mental
  load for client entry.
- **MountOptions** type — `hydrate?: boolean`, `noopIfNotFound?: boolean`.
- **resolveMountContainer** (internal) — Resolve selector to Element; throw or
  return null when not found per `noopIfNotFound`.
- **forceRender** on Root — `Root` returned by `createRoot`/`render` (and from
  `mount`) now exposes **forceRender()** to force one re-run of the root effect
  and re-render the tree; for use with external routers or other non-reactive
  state sources.

### Changed

- **createRoot / render:** After first append, `removeCloak(container)` is
  called so that `data-view-cloak` is removed automatically; no need to remove
  it in app code. Same behavior for hydrate path (already did removeCloak).
- **Tests:** Added 6 unit tests for mount (Element, selector, noopIfNotFound,
  throw when selector missing, hydrate path, render path). Total tests: 262.
- **Docs:** README (en/zh) and TEST_REPORT (en/zh) updated with mount API,
  MountOptions, and 262-test summary.

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
