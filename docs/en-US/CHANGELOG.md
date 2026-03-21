# Changelog

All notable changes to @dreamer/view are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] - 2026-03-21

### Refactored

- **Root APIs unified on `fn(container)` + `insert`**: `createRoot`, `render`,
  and `hydrate` all take **`(container: Element) => void`**. **`fn` runs only
  once** for that root; inside `fn`, DOM and reactive sites are built with
  **`insert` / `insertReactive` / `createElement` + `appendChild`**, and all
  later updates are driven by **effects on insert points**, not by re-running
  the whole root `fn`. This matches **view-cli `compileSource` output** so
  hand-written and compiled code share the same model.
- **Same `fn` for SSR and client**: Server **`renderToString(fn)`** (or
  streaming SSR) and client **`hydrate(fn, container)`** (exported from
  **`@dreamer/view/compiler`**) use the **same** compiled `fn`. Hydration
  **reuses existing DOM** in insert order and **binds effects only**, avoiding
  full-container `innerHTML`-style replacement.
- **`mount` narrowed**: **`mount(selector | Element, fn, options?)`** only
  resolves the target and calls **`render(fn, el)`**; it **does not**
  auto-hydrate when the container already has children. Hybrid apps must call
  **`hydrate`** explicitly on the client.
- **Removed `createReactiveRoot`**: The API that re-ran a tree from an external
  state getter on each change is **gone**. Use
  **`createRoot((container) => { … insert(…, getter) … }, el)`** with
  **`createSignal` / `createStore` / `createEffect`**, or **`mountWithRouter`**
  and similar integrations, aligned with fine-grained `insert` instead of a
  root-level full-tree rerun.

### Changed

- **Public API JSDoc and module documentation** All exported entry points and
  public APIs now have full JSDoc. Every export path has `@module` and
  `@packageDocumentation` with a clear description and export list; exported
  functions and types have `@param`, `@returns`, and where useful `@example`.
  Internal architecture codenames have been removed from user-facing module
  descriptions in favor of plain language (e.g. JSX via compileSource, insert /
  createRoot).
- **compiler/mod.ts** The module tag was corrected from `@dreamer/view/runtime`
  to `@dreamer/view/compiler`, and the full export list (insert, createRoot,
  hydrate, SSR, props, signal/effect re-exports, types) is documented.
- **Main and subpath entries** `mod.ts`, `mod-ssr.ts`, `mod-csr.ts`,
  `mod-hybrid.ts` now document all exports and clarify usage (e.g. hybrid/csr do
  not export `insert`; use main or compiler when needed). `dom.ts`,
  `globals.ts`, `ref.ts`, `compiled.ts`, `jsx-compiler/mod.ts`,
  `compiler/insert-replacing.ts`, `optimize.ts`, and
  `compiler/active-document.ts` have consistent module docs.
- **Runtime and compiler** `runtime.ts` file header and `insertReactive`,
  `InsertValueWithMount` JSDoc expanded; `compiler/insert.ts` and
  `jsx-compiler/transform.ts` module descriptions updated and aligned with
  public usage. `compileSource` and `jsxToRuntimeFunction` in the JSX compiler
  have full parameter and return documentation.
- **Examples** `examples/package.json` imports and dependencies are synced with
  `examples/deno.json`: added `@dreamer/view/ssr`, `@dreamer/view/compiler`, and
  `@dreamer/esbuild`; all JSR/npm deps (image, plugins, esbuild, tailwindcss)
  are listed with matching versions.

### Added

- Unit tests: `spread-intrinsic`, `insert-replacing`, `escape`,
  `active-document`, `compiled-contract`, `route-page`, `version-utils`,
  `logger-server`, `vnode-insert-bridge`; extended `boundary` (nested
  ErrorBoundary) and `router-mount` (notFound). `entry-mod-smoke` adds
  `@dreamer/view/ssr` `renderToString` smoke test.
- Test file table and counts aligned with this release: `compiled-runtime`,
  `form-page-compile`, `jsx-compiler`, `ref-dom`, `ref`, `router-mount`,
  `runtime-props`, `ssr-compiled`, `unmount`, etc.; `e2e/view-example-browser`
  has **72** browser E2E cases (Gallery, Layout2, persist, v-once/vCloak,
  routing, 404, and more).

### Fixed

- **`package.json` exports**: added `./ssr` → `./src/mod-ssr.ts` to match
  `deno.json` so Bun resolves `@dreamer/view/ssr`.

### Docs

- **TEST_REPORT (en/zh)** and **README (en/zh)**: **500** tests (Deno) / **457**
  (Bun), **44** test files, date **2026-03-21**, duration ~**1m38s** (Deno) /
  **~85s** (Bun); badges and test summary sections updated; E2E and file table
  match the above.
- **README (en/zh)** migration notes for **`fn(container)`**, explicit
  **`hydrate`**, **`mount` does not auto-hydrate**, and **`createReactiveRoot`**
  removal, aligned with the 1.3.0 refactor.
- **`docs/测试覆盖缺口.md`** updated to reflect filled gaps and remaining work.

---

## [1.2.0] - 2026-03-19

### Fixed

- **Dynamic getter single-node component: patch expanded output** When a getter
  returns a single component (e.g. `{ () => ( <Carousel ... /> ) }`),
  `getDynamicChildEffectBody` now uses `expandVNode` to get the component’s
  output (e.g. the carousel root div) and passes that to `patchRoot` instead of
  the component VNode. This makes the runtime patch the same DOM (update
  style/children) instead of replacing the whole block, so carousel slide
  transition works and other page state is not reset when only that slot’s state
  (e.g. `current`) changes.

---

## [1.1.14] - 2026-03-19

### Fixed

- **Component returning getter: single data-view-dynamic** When a function
  component returns a getter (e.g. `return () => ( <div>...</div> )`),
  `createElement` no longer created a placeholder and then called
  `appendDynamicChild`, which created a second dynamic container. It now creates
  one container and registers the effect on it directly, so only one
  `data-view-dynamic` node appears (e.g. under a Carousel or similar
  getter-returning component).

---

## [1.1.13] - 2026-03-18

### Changed

- **SSR and client: support both `class`/`className` and `for`/`htmlFor`** In
  stringify, output HTML attribute `class` for both `class` and `className`, and
  `for` for both `htmlFor` and `for`. In `getStaticPropsFingerprint`, normalize
  to canonical keys so equivalent props share cache. In `props.ts`, treat `for`
  the same as `htmlFor` when setting the attribute.

---

## [1.1.12] - 2026-03-16

### Fixed

- **Dynamic child single-node: keep placeholder and patch instead of replace**
  In `getDynamicChildEffectBody`, when the getter returns a single native
  element (e.g. Form/FormItem root), the placeholder container is no longer
  replaced; the single node is rendered inside the placeholder and subsequent
  runs use `patchRoot` to update in place. This fully fixes input focus loss in
  Form + FormItem + Password when typing. After patch, `singleMountedNode` is
  synced so ContextScope or other replaced children remain correct.
- **E2E Boundary/Portal** Use `waitForMainToContain` to poll for main content
  (up to 3s) so route change and render complete before assertions; avoids flaky
  empty main on slow load.
- **SSR document shim test** One test now uses `sanitizeOps: false` to avoid
  timer-leak false positives.

### Added

- **Form example page** New `examples/src/views/form/` with Form + FormItem +
  password input (same structure as ui-view) for focus retention verification.
- **Home Form card** Form entry on examples home with link to `/form`.
- **E2E: Form page and password focus** Tests for navigating to Form page and
  asserting that after typing in the password field, `document.activeElement` is
  still the input (focus retained).
- **Unit test: password focus** New case in `reconcile-focus-reuse.test.ts`:
  getter returns single root div wrapping input; after signal update, same input
  node is reused (proves patch path, focus retained in real browser).

### Docs

- Changelog (en/zh) and README changelog section updated for 1.1.12.

---

## [1.1.11] - 2026-03-16

### Fixed

- **patchNode: reuse container when same component returns getter** When the
  existing DOM is a dynamic container (`data-view-dynamic`) and old/new VNodes
  are the same component (e.g. `<Password />`), the reconciler now calls
  `getComponentGetter` and `updateDynamicChild` instead of replacing the node.
  Fixes input focus loss in components like Password when the parent re-renders
  (component slot was previously always replaced in patchNode).

### Added

- **zh-TW locale** CLI and server i18n now support Traditional Chinese
  (`zh-TW`). New `src/server/locales/zh-TW.json`; `Locale` and `VIEW_LOCALES`
  (10 locales).
- **Reconcile focus/container reuse tests** New unit tests in
  `tests/unit/reconcile-focus-reuse.test.ts` (10 tests): same-slot getter reuse,
  same-component patch reuse, getter/static edges, getter returns null.

### Docs

- TEST_REPORT (en/zh) updated: 454 tests (Deno), 427 (Bun), reconcile
  focus/container reuse coverage.

---

## [1.1.10] - 2026-03-16

### Fixed

- **Reconcile: reuse container when same slot has two getters (different
  reference)** When both old and new slot items are component getters but the
  getter reference changed (e.g. parent re-render with `() => <Password />`),
  the reconciler no longer replaces the whole dynamic child container. It now
  reuses the existing container and calls
  `updateDynamicChild(container,
  newGetter, ...)` so the new getter’s result
  is patched in place. This avoids input focus loss in components like Password
  that use `return () => ( ...
  )` while keeping the getter pattern.

---

## [1.1.9] - 2026-03-16

### Added

- **SSR document shim** During `renderToString` and `renderToStream`, the
  runtime temporarily replaces `globalThis.document` with a shim so that
  component code can access `document` (e.g. `document.body.style.overflow`)
  without throwing. The shim provides `body`, `head`, `createElement`,
  `getElementById` (null), `querySelector` (null), `querySelectorAll` (empty
  array), etc. After render, the original `document` is restored.
- **SSR document shim tests** New unit tests in
  `tests/unit/ssr-document-shim.test.ts` (9 tests) covering component access to
  document during SSR and restoration after `renderToString` / `renderToStream`.

### Docs

- TEST_REPORT (en/zh) and README (en/zh) updated: 444 tests (Deno), 418 (Bun),
  test date 2026-03-16, and SSR document shim coverage.

---

## [1.1.8] - 2026-03-15

### Fixed

- **appendDynamicChild replaceChild NotFoundError** When switching from
  single-node mode back to multi-node (or when switching to single-node), the
  code now checks `container.parentNode === parent` before calling
  `parent.replaceChild(...)`. If the container was already removed (e.g. by a
  sibling effect or keyed reconcile), it uses `appendChild` instead so the DOM
  update does not throw.

---

## [1.1.7] - 2026-03-15

### Changed

- **SSR/keyed: no wrapper node** Keyed children are no longer wrapped in a
  `<span data-view-keyed>`. The `data-key` attribute is injected on the first
  element of each keyed item in SSR and set on the content root on the client.
  Reconcile uses the content root directly (patch or range replace), avoiding
  extra DOM and layout issues (e.g. Grid/Flex).
- **SSR/dynamic: no wrapper div** Dynamic children (getter/function) no longer
  emit a wrapping `<div data-view-dynamic>`. The first element of each dynamic
  block gets `data-view-dynamic` and `data-view-dynamic-index`; when the block
  is pure text, a single `<span>` wrapper is emitted so the marker can be
  placed.
- **Dynamic placeholder is a div** `createDynamicContainer(doc)` now creates an
  unstyled `div` (replacing the previous span). `createDynamicSpan` has been
  removed; all call sites use `createDynamicContainer`.

### Fixed

- Tests updated for the new SSR output (no `data-view-keyed`; `<span>` may have
  attributes). E2E checkbox assertion allows newline between "checked：" and
  "true".

---

## [1.1.6] - 2026-03-15

### Fixed

- **SSR when component returns a getter function**: In `walkVNodeForSSR`, when a
  component returns a function (e.g. `return () => <div>...</div>`), the server
  now invokes that function once and walks the resolved VNode(s) so the content
  is rendered instead of being skipped. Previously such components produced no
  HTML on the server and could cause blank areas (e.g. in apps using
  component-return-getter patterns like ui-view). No extra wrapper node is
  emitted.

---

## [1.1.5] - 2026-03-14

### Changed

- **vIf single-element optimization**: When reactive `vIf` content (getter or
  signal) renders to a single DOM element (e.g. a root `<div>`), the framework
  now uses that element as the root and toggles visibility via `style.display`
  in an effect instead of wrapping it in a `<span data-view-v-if>`. This removes
  the extra wrapper span for modals, toasts, or any component that returns a
  single element with `vIf`. Multi-root or non-element content still uses the
  span placeholder.

---

## [1.1.4] - 2026-03-14

### Added

- **Unified escape module (`src/escape.ts`)**: Centralized `escapeForText`,
  `escapeForAttr`, and `escapeForAttrHtml` for stringify, meta, and runtime.
  Replaces per-file escape logic to ensure consistent XSS-safe output and a
  single place to maintain.
- **`getCreateRootDeps(deps)` in runtime-shared**: Returns the createRoot
  dependency object so runtime, runtime-csr, and runtime-hybrid all pass their
  implementations through one contract. Reduces duplicate key lists and prevents
  missing updates when adding or changing deps.
- **Directive name normalization module (`src/directive-name.ts`)**: Extracted
  `directiveNameToCamel` and `directiveNameToKebab` into a dedicated module;
  `directive.ts` imports and re-exports them so the public API is unchanged and
  only one file needs to be maintained for name conversion rules.
- **Optimization analysis doc (`docs/OPTIMIZATION_ANALYSIS.md`)**: Documents
  performance, security, and code-reuse opportunities with completion status
  (e.g. escape, removeCloak, reconcileKeyedChildren, applyProps,
  getStaticPropsFingerprint, flushQueue, getCreateRootDeps, directive-name).
- **Memory leak analysis doc (`docs/MEMORY_LEAK_ANALYSIS.md`)**: Describes
  lifecycle and cleanup for effects, roots, signals, directives, caches, and
  router; documents the store/proxy subscriber fix and low-risk items
  (getterWarnedKeys, router.stop(), refs).

### Changed

- **Performance – removeCloak**: Handle container’s own `data-view-cloak` first,
  then iterate over `querySelectorAll("[data-view-cloak]")` result with a
  for-loop instead of `Array.from(…)` and `unshift(container)` to avoid extra
  array allocation.
- **Performance – reconcileKeyedChildren**: Build `keyToWrapper` by iterating
  `container.children` with an index-based for-loop instead of
  `Array.from(container.children)` to avoid one array allocation per reconcile.
- **Performance – applyProps**: Replaced `Object.entries(props)` and
  style-object `Object.entries(value)` with `for-in` plus
  `Object.prototype.hasOwnProperty.call` so the hot path does not allocate
  iterator or entry arrays.
- **Performance – getStaticPropsFingerprint**: Use `for-in` to collect entries;
  replace `JSON.stringify(entries)` with a deterministic key built from sorted
  entries (`k1\0v1\0…`) to avoid large string allocation; style branch uses
  for-in and single-string concatenation instead of
  `Object.entries(…).map(…).join`.
- **Performance – flushQueue**: Use an index-based for-loop over
  `state.queueCopy` instead of for-of to avoid iterator allocation; same
  semantics, slightly friendlier for some engines.
- **generateHydrationScript**: Nonce and scriptSrc now use `escapeForAttr` from
  the shared escape module for consistent attribute escaping.

### Fixed

- **Memory leak – store and proxy subscribers**: When an effect that read from a
  store (or from `createNestedProxy` / reactive state) was disposed, it was
  never removed from the store’s or proxy’s `subscribers` Set, so disposed
  effects were retained and the Sets could grow. Both `store.ts`
  (createRootStoreProxy get trap) and `proxy.ts` (createNestedProxy get trap)
  now call `onCleanup(() => subscribers.delete(effect))` when adding the current
  effect to subscribers, so cleanup or re-run of the effect removes it from the
  Set, matching signal subscription behavior.

---

## [1.1.3] - 2026-03-12

### Fixed

- **Dynamic child (no wrapper span):** When a dynamic child (signal getter or
  function) returns a single non-Fragment VNode that renders to one DOM element
  (e.g. a button), the framework now uses that element as the mount point with
  `data-view-dynamic` instead of wrapping it in an extra `<span>`. This avoids
  an extra DOM node and prevents the wrapper from affecting layout or styles
  (e.g. flex/grid). Multi-child or Fragment results still use the inner span as
  before.

---

## [1.1.2] - 2026-02-25

### Added

- **init .vscode**: Generated project now includes `.vscode/settings.json` (Deno
  or Bun format: formatter, editor, i18n-ally) and
  `.vscode/i18n-ally-custom-framework.yml` for `$t`/`$tr` recognition.

### Changed

- **version -v output**: `setVersion()` string ends with `\n\n` so a blank line
  appears before the shell prompt (handled by root Command in @dreamer/console).

### Fixed

- **e2e CLI start afterAll**: Use SIGKILL and cap cleanup wait so afterAll
  finishes within 5s on Bun macOS (avoids test timeout).

---

## [1.1.1] - 2026-02-25

### Added

- **CLI i18n (9 locales)**: Same locale set as dweb: de-DE, en-US, es-ES, fr-FR,
  id-ID, ja-JP, ko-KR, pt-BR, zh-CN. New locale JSON files and `Locale` type
  updates in `src/server/utils/i18n.ts`.
- **init template i18n**: UnoCSS `view.config.ts` content comment and `uno.css`
  header/reset/body/custom comments use i18n keys (`unocssContentComment`,
  `unoCssHeaderComment`, `unoCssResetComment`, `unoCssBodyComment`,
  `unoCssCustomComment`) in all 9 locales.
- **init deno.json template**: Generated project `deno.json` now includes
  `version: "1.0.0"`, `description` (project name + scaffold note), `author`
  (from `USER` / `USERNAME`), `license: "MIT"`, `keywords`, and
  `nodeModulesDir: "auto"`.
- **init UnoCSS**: `unocssPlugin` in `view.config.ts` gets `content` array (e.g.
  `./src/**/*.{ts,tsx}`, `./src/**/*.html`, `./src/assets/index.html`) with i18n
  multi-line JSDoc comment; generated UnoCSS dependency is `@unocss/core`
  (replacing `unocss`).
- **init uno.css template**: Replaced minimal `@unocss` entry with full base
  styles: reset (box-sizing, html/body/a), default body and `.dark body`
  gradients/colors for above-the-fold, plus optional custom-layer comment; all
  section comments i18n.
- **setup install success**: Prints installed @dreamer/view version in success
  message (e.g. `view-cli  v1.1.1  installed successfully.`); message template
  uses `{version}` placeholder and i18n.

### Changed

- **init plugins template**: Extracted shared `staticPlugin` block so
  tailwind/unocss/none branches reuse one snippet.
- **init layout**: Header title shows `@dreamer/view` when app name is view-app;
  nav `<ul>` uses `list-none`; theme toggle and GitHub link buttons use
  `border-0 bg-transparent outline-none` to remove default button border and
  focus outline.
- **init theme icon**: Theme toggle shows moon icon when theme is dark and sun
  icon when light (icon matches current theme).
- **Logger config type**: `AppConfig.logger` and `setLoggerConfig()` now use
  `LoggerConfig` from `@dreamer/logger` directly; removed local
  `AppLoggerConfig` from `src/server/types.ts`.
- **examples/view.config.ts**: Logger section comments moved above each field
  (JSDoc style); `color` and `output.console` comments document
  `true | false |
  "auto"` and auto behaviour.
- **init template**: Generated `view.config.ts` logger block uncommented and
  aligned with examples (comments above fields, `color: "auto"`,
  `console:
  "auto"`, `path: "logs/app.log"`). Logger comment i18n updated in
  all 9 locales (`viewConfigLoggerComment`, `loggerColorComment`,
  `loggerOutputConsoleComment` with "auto" descriptions).

### Fixed

- **zh-CN init template**: Added missing `notFoundRouteTitle` key for 404 page
  title.
- **e2e CLI start afterAll**: Use SIGKILL and cap cleanup wait so afterAll
  finishes within 5s on Bun macOS (avoids test timeout).

### Dependencies

- `@dreamer/runtime-adapter`: ^1.0.17 → ^1.0.18
- `@dreamer/plugins`: ^1.0.7 → ^1.0.8

---

## [1.1.0] - 2026-02-25

### Added

- **init style choice**: Interactive style selection (Tailwind CSS / UnoCSS /
  None); dependencies and `view.config.ts` plugins are written accordingly.
  Supports non-interactive `options.style` (e.g. CI: `style: "none"`).
- **init template improvements**: Generated project includes
  `src/assets/index.html`, `favicon.svg`, and `global.css` / `index.css`
  placeholders; `view.config.ts` gets top-level `name`, `version`, `language`
  (auto-detected) and a fully commented `logger` block (level, format, showTime,
  showLevel, color, output.file, etc.) with default log path
  `runtime/logs/app.log`; logger field comments use i18n (en/zh).
- **Version utilities**: Version logic moved to `src/server/utils/version.ts`;
  generic `getPackageVersion(packageName, useBeta)`; `getViewVersion` and
  `getPluginsVersion` use it. init and setup fetch latest @dreamer/view and
  @dreamer/plugins from JSR (supports --beta).

### Changed

- **Dev server refactor**: Server and CLI layout rewritten. `src/cmd/` was split
  into `src/server/` (with `core/`: app, serve, build, config, routers,
  route-css, etc.) and top-level `src/cli.ts`. CLI entry remains
  `@dreamer/view/cli` (now pointing to `src/cli.ts`). In dev, `ViewServer` and
  pathHandlers serve in-memory build outputs; static and SPA fallback are
  provided by plugins (e.g. staticPlugin) via middlewares; index.html is served
  from `src/assets` by the plugin.
- **init flow**: Project directories and files are created only after runtime
  and style choices; success message uses `logger.info` (green) and blank lines
  use `console.log`.
- **Route CSS cleanup**: On route change, styles injected by esbuild for the
  previous route (`style[data-dweb-css-id]`) are removed using
  `data-view-route-path` marking, so pages without CSS no longer keep the
  previous page’s styles; global styles from the main bundle (entry CSS imports)
  are not marked or removed.
- **Image compression and hashing**: Build config `build.assets` supports
  compressing and hashing images in production; compiled output (HTML/CSS/JS) is
  updated with hashed asset paths so no runtime asset-manifest is needed. Aligns
  with @dreamer/esbuild AssetsProcessor behavior.
- **Plugin config**: Config supports a `plugins` array to register Tailwind,
  UnoCSS, or custom plugins; plugins run in registration order (e.g. tailwind
  then static) and participate in request/response via onRequest/onResponse.

### Fixed

- **init dependencies**: When user selects Tailwind or UnoCSS, generated
  `deno.json` / `package.json` now include `tailwindcss` or `unocss` so the
  generated project builds without missing deps.
- **CI (Deno Mac)**: E2E CLI tests pass `stdin: "null"` to build/start
  subprocesses and use longer timeouts (build 45s, start 120s) so tests pass in
  CI without TTY. Requires @dreamer/esbuild ^1.0.40 (buildModuleCache passes
  stdin to deno info/eval).

---

## [1.0.32] - 2026-02-24

### Added

- **Router / layout**: `KEY_VIEW_ROUTER` constant and `getGlobal` / `setGlobal`
  exported from `@dreamer/view/router` so root _layout (or other code) can read
  the router from global when needed.
- **init (non-interactive)**: `main(options)` accepts optional `options.runtime`
  (`"deno"` or `"bun"`). When set, the runtime selection menu is skipped so CI
  and tests can run init without stdin (e.g.
  `initMain({ dir: "...", runtime: "deno" })`).

### Changed

- **Layout inheritance**: Decided entirely in codegen (layout chain in
  `layout.ts` + `routers.ts`). _app no longer checks `inheritLayout`; it sets
  the router on global and always renders `RoutePage`, which applies the route’s
  `layouts` array (root _layout included when inheriting). Root _layout is the
  default export of `_layout.tsx`; `Layout` accepts optional `routes` /
  `currentPath` (no global fallback for currentPath).
- **Layout chain in generated routes**: Full `layoutImportPaths` (including
  root) are emitted when inheriting; when page sets `inheritLayout = false`,
  only the root path is filtered out so the current directory’s _layout still
  wraps the page.
- **RoutePage layout order**: Layouts are applied in reverse order so the first
  entry (root) is outermost and nesting is correct (root > child layout > page).
- **layout.ts**: `readInheritLayoutFromLayoutFile` and
  `readInheritLayoutFromPageFile` now use dynamic `import(pathToFileUrl(path))`
  to read `inheritLayout` from the module instead of regex on file content.

### Fixed

- **Page `inheritLayout = false`**: When the page (or directory _layout) sets
  `inheritLayout = false`, only the root layout is removed from the chain; the
  current directory’s _layout is no longer dropped, so the local layout (e.g.
  dashed box) still renders.

---

## [1.0.31] - 2026-02-22

### Fixed

- **renderToString (Bun / no-DOM)**: When running in an environment without
  `document` (e.g. Bun test runner), the `finally` block now sets
  `globalThis.document` back to `undefined` when it was originally absent,
  instead of leaving the SSR guard in place. This prevents later code (e.g.
  `getDocument()`) from seeing the guard and throwing "document is not available
  during server-side rendering", so Bun tests that run SSR then DOM-dependent
  tests in the same process pass.

### Changed

- **TEST_REPORT**: Bun command updated to
  `bun test --preload ./tests/dom-setup.ts tests/`; duration and note added
  (preload injects happy-dom when no DOM is present). Applied in both en-US and
  zh-CN reports.
- **Publish**: `publish.include` now has `src/**/*.tsx` so `route-page.tsx`
  (used by `router.ts`) is included in the JSR package.

---

## [1.0.30] - 2026-02-21

### Added

- **SSR stringify**: Unified string and stream SSR behind a single traversal.
  `walkVNodeForSSR` drives both `createElementToString` and
  `createElementToStream`; `collectWalk` and `walkElementChildrenStream` handle
  concatenation and element children. Reduces duplicate logic and keeps SSR
  behavior in one place.
- **runtime-shared**: Shared root effect loop `createRootEffectLoop` for
  `createRoot` and `hydrate`. Common handling of disposed check, time/scope,
  debounce placeholder, and strategy callbacks (`readDeps`, `shouldSkip`,
  `runBody`, `onBeforeRun`). Root state (`RootEffectState`) and `getNow()` are
  shared; each root supplies its own run body and skip logic.
- **dom/reconcile**: New `reconcile.ts` with `createReconcile(deps)` returning
  `reconcileKeyedChildren`, `reconcileChildren`, and `patchRoot`. Reconcile and
  patch logic moved out of `element.ts`; element injects deps and delegates
  `patchRoot` to the reconcile module. Exports `hasAnyKey` and `collectVIfGroup`
  for use by element.
- **element placeholder API**:
  `registerPlaceholderContent(placeholder,
  effectBody, options?: { preserveScroll })`
  unifies v-if group, single v-if, and v-for placeholder behavior (clear, run
  body, bind deferred events; optional scroll preservation). Replaces repeated
  unmount/replaceChildren/bind blocks.

### Changed

- **runtime-shared**: `createRoot` and `hydrate` no longer log to console by
  default. Debug logs are gated by `globalThis.__VIEW_DEBUG__`; set it to `true`
  to restore "[view] createRoot() root created #" and hydrate effect run
  messages.
- **element.ts**: Size reduced by moving reconcile/patch into `reconcile.ts` and
  using `registerPlaceholderContent` for placeholder + effect cases. Public API
  unchanged; `patchRoot` still exported and implemented via `rec.patchRoot`.

### Fixed

- **SSR stringify (vFor)**: When vFor item had `parsed === null` (e.g. props
  with `vFor` cleared), the branch incorrectly returned and produced no HTML.
  Now falls through to normal element output so vFor list items render correctly
  in SSR.

---

## [1.0.29] - 2026-02-20

### Fixed

- **createReactiveRoot (dweb)**: In `createReactiveRootWith`, when state has the
  dweb viewState shape (`page` / `props` / `layouts` / `skipLayouts`) and is
  equivalent to the previous state (same page, same props, same layouts), the
  root no longer re-runs `buildTree`. This avoids the root effect running
  multiple times when `setViewState` is called repeatedly with the same logical
  page (e.g. after hydrate and route callback), so child components and their
  `createEffect` run only once instead of three times in hybrid scenarios.

---

## [1.0.28] - 2026-02-20

### Fixed

- **SSR stringify**: Guard against non-string `vnode.type` in
  `createElementToString` and `createElementToStream` to avoid
  `tag.toLowerCase is not a function` when SSR runs under Bun (e.g. dweb
  hybrid). Such nodes are skipped with empty output; set
  `globalThis.__VIEW_SSR_DEBUG__` to log when the guard triggers.

---

## [1.0.27] - 2026-02-19

### Fixed

- **setup (JSR path)**: Add leading and trailing newlines around the install
  success message so blank lines appear when running
  `deno run -A jsr:@dreamer/view/setup` (aligned with local-run output).

---

## [1.0.26] - 2026-02-19

### Fixed

- **CLI locale**: Call `setLocaleFromEnv()` at CLI entry so the globally
  installed view-cli respects `LANGUAGE` / `LC_ALL` / `LANG` (e.g. Chinese
  output when running `view-cli init` in a Chinese environment).
- **init**: Blank line before "Project created successfully" is now part of the
  same `console.log` so it is not dropped when running view-cli from JSR
  install.
- **setup**: Call `child.unref()` after `await child.status` (not before) so the
  setup process does not exit before `deno install` completes when run via
  `deno run -A jsr:@dreamer/view/setup`.
- **upgrade**: Same unref-after-status order as setup for consistency.

---

## [1.0.25] - 2026-02-19

### Changed

- **CLI i18n**: All CLI command and option descriptions in `cli.ts` use i18n
  (`$tr`). Flattened keys from `cli.cli.*` to `cli.*`; init/dev/build/start
  descriptions use `cli.initDesc`, `cli.devDesc`, `cli.buildDesc`,
  `cli.startDesc`.
- **upgrade/update**: All user-facing messages in `upgrade.ts` and `update.ts`
  use `$tr` (cli.upgrade._, cli.update._). HTTP response bodies in `serve.ts`
  remain fixed English (no translation).

---

## [1.0.24] - 2026-02-19

### Changed

- **Dependencies**: Updated @dreamer/server to ^1.0.9.

---

## [1.0.23] - 2026-02-19

### Changed

- **CLI i18n**: i18n now initializes automatically when `cmd/i18n` is loaded;
  `initViewI18n` is no longer exported. Removed explicit `initViewI18n()` calls
  from `cli.ts` and `setup.ts`. `$tr` still ensures init when called.
- **Dependencies**: Bumped @dreamer/runtime-adapter, @dreamer/console,
  @dreamer/esbuild, @dreamer/test.

---

## [1.0.22] - 2026-02-19

### Changed

- **i18n**: Renamed translation method from `$t` to `$tr` to avoid conflict with
  global `$t`. Update existing code to use `$tr` for package messages.

---

## [1.0.21] - 2026-02-18

### Added

- **Bun support**: E2E and CLI tests run under Bun via
  `@dreamer/runtime-adapter` (`createCommand`, `execPath`, `IS_BUN`). Added
  `package.json` exports for `globals`, `stream`, and `jsx-dev-runtime`;
  `tsconfig.json` with `jsxImportSource: "@dreamer/view"`; `jsxDEV` export in
  `jsx-runtime.ts`. Documentation: `BUN_COMPATIBILITY.md`, `JSX_EXPRESSIONS.md`.
- **Test report**: `TEST_REPORT.md` (zh-CN and en-US) now include Bun results
  (410 tests, 26 files) alongside Deno (435 tests); run commands for both
  runtimes documented.

### Changed

- **E2E / CLI tests**: `view-example-browser.test.ts` and `cli.test.ts` use
  `createCommand(execPath(), ...)` with `IS_BUN` for args (Bun omits `-A`).
  Server-ready check accepts both "Server started" and "服务已启动".

---

## [1.0.20] - 2026-02-18

### Fixed

- **e2e init test**: Initialize view i18n and set locale to zh-CN before calling
  initMain in the test so generated view.config.ts contains the translated
  comment ("view 项目配置"). Fixes failure when the test runs without the CLI
  entry (e.g. in CI where initViewI18n was never called).

---

## [1.0.19] - 2026-02-18

### Changed

- **i18n**: Moved under `src/cmd/` (i18n.ts and locales) so client entry
  (`mod.ts`) does not pull in server-only code. Init only at CLI entry points
  (`cli.ts`, `setup.ts`); `initViewI18n()` no longer called from `mod.ts`.
  `$t()` no longer calls `ensureViewI18n()` or sets locale internally.

---

## [1.0.18] - 2026-02-17

### Added

- **CLI i18n:** Server-side i18n for view-cli: `i18n.ts`, `detectLocale()` from
  env (LANGUAGE/LC_ALL/LANG), `ensureViewI18n()`, `$t()`. Locales `en-US.json`
  and `zh-CN.json` for setup, serve, init, build, config, dev, HMR messages.
- **Init template i18n:** All init-generated comments and TSX copy use
  `init.template.*` keys (view.config, main, _app, _layout, _loading, _404,
  _error, home, about, router, routers). Route metadata titles and `routers.ts`
  default home title / router file comments use `$t`.

### Changed

- **Init:** Removed redundant `container.removeAttribute("data-view-cloak")`
  from main.tsx template (runtime already calls `removeCloak` after first
  append). Added blank line before "Project created" message. Escaped
  `countLabelHigh` as `count &gt; 5` in locales for valid TSX.
- **Generate:** `titleFromRelative` and generated routers file comments use
  `$t`; added `routers.tsNocheckComment` locale key.
- **Build/Config:** JSDoc for `getRoutePathForChangedPath` and
  `getBuildConfigForMode` param translated to English.

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
