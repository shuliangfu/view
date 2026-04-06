# Changelog

All notable changes to @dreamer/view are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-04-06

This release establishes **2.0.0** as the documented baseline. The sections
below summarize **what the framework provides** (features and public surface),
not a delta from prior versions.

### Reactivity and state

- **Signals** with multiple ergonomic styles: `.value`, call form `s()` /
  `s(x)`, and tuple destructuring `const [get, set] = createSignal(initial)` on
  the same return type; optional named signals for debugging/HMR.
- **Effects**: `createEffect`, `createRenderEffect` (sync-biased, used for
  reactive DOM props), dependency tracking and cleanup via Owner.
- **Memoization**: `createMemo` and `memo` alias.
- **Batching and scheduling**: `batch`, `untrack`, priority and
  microtask-friendly flushing (`scheduler/batch`, `scheduler/priority`).
- **Lifecycle and errors**: `onMount`, `onCleanup`, `onError`, `catchError`,
  integration with ErrorBoundary and Owner propagation.
- **Deferred / transitions**: `createDeferred`, `useTransition`,
  `startTransition`.
- **Selectors**: `createSelector` for keyed list selection without full
  recomputation.
- **Context**: `createContext`, `Provider`, `useContext` (transparent Provider,
  no extra Owner).
- **Store**: deep reactive proxy, `setState`, `produce`, `reconcile`, optional
  named singletons and **persist** hooks (`key`, `storage`, `serialize` /
  `deserialize`); array-root stores with dedicated update paths.

### Runtime and DOM

- **No virtual DOM**: JSX returns thunks;
  **`insert(parent, value, current?, before?)`** drives fine-grained DOM updates
  and effect subscriptions.
- **`template` / `walk`**: static HTML cloning and path addressing for compiler
  output and advanced use.
- **Props**: `setProperty`, `spread`, `setAttribute`; delegated events and
  controlled inputs; `getDocument`, `createRef` for safe document access and
  refs.
- **Mounting**: `mount` (clears container, removes `data-view-cloak`) and
  `hydrate` with optional compiler **binding map**; `createRoot` + manual
  `insert` for full disposal control.

### Control flow and async UI

- **Components**: `Show`, `For`, `Index`, `Switch` / `Match`, `Dynamic`, `lazy`
  with `Suspense`.
- **Async data**: `Suspense`, `createResource` (source + fetcher overloads),
  loading/error/mutate/refetch; registration with Suspense boundaries including
  after ErrorBoundary recovery.
- **Errors**: `ErrorBoundary` with fallback renderers, `reset`, and `resetKeys`.
- **Portals**: declarative **`Portal`** and imperative **`createPortal`** (also
  available from `@dreamer/view/portal`).

### Router, config, and CLI

- **SPA router**: `createRouter`, `mountWithRouter`, `Link`, `useRouter`,
  `navigate` / `replace`, dynamic segments, splats, `beforeEach`, basePath,
  scroll behavior, optional same-origin link interception, `router.render()` for
  layout composition.
- **File-based workflow** (via `view-cli init`): `view.config.ts`, `src/views/`
  conventions (`_app`, `_layout`, `_loading`, `_404`, `_error`), generated
  `src/router/routers.tsx` from filesystem scan, `routePath` / `metadata` /
  `inheritLayout` / `loading` extraction without JSX-capable dynamic import in
  scanners.
- **Server-side helpers**: `loadViewConfig`, layout chain resolution,
  `generateRoutersFile`, `createApp`, dev/prod server and build orchestration
  (see `server/core`).
- **Global CLI**:
  `view-cli init | dev | build | start | upgrade | update |
  version` after
  `deno run -A jsr:@dreamer/view/setup`; built-in **i18n** strings for CLI and
  framework messages.
- **CSR client build mapping**: `toClientConfig` forwards `view.config`
  **`build`** **`sourcemap`** (**`boolean` or object**) to
  **`ClientConfig.sourcemap`** for `@dreamer/esbuild`; **`bundle.sourcemap`** is
  set only for booleans or the default, so object-shaped map options are not
  collapsed to **`true`** in production builds (dev still forces sourcemaps for
  HMR).

### Forms

- **`createForm`**: controlled fields via `field(name)` (`value` + `onInput`),
  optional `rules`, `validate` / `validateField`, `validateOn` (`submit` /
  `change` / `blur`), `handleSubmit`, `reset`, Store-backed `data` / `errors`,
  `produce` for immutable-style updates.

### Compiler, optimization, and SSR

- **`@dreamer/view/compiler`**: `compileSource`, `transformJSX`, options for DOM
  vs SSR codegen, hydration markers, HMR proxy injection, analyzer and path-gen
  utilities, directive transforms.
- **`@dreamer/view/optimize`**: `optimize` for shrinking `template("…")`
  literals and `createOptimizePlugin` for esbuild pipelines.
- **`@dreamer/view/ssr`**: `renderToString`, `renderToStringAsync`,
  `renderToStream`, `generateHydrationScript`, minimal SSR `document` install
  with scoped enter/leave, `queueSsrAsyncTask` serialization,
  `registerSSRPromise` for async flush, `isServer` and related helpers.

### Developer experience

- **HMR**: `createHMRProxy` for state-preserving hot replacement when `VIEW_DEV`
  is set (typically wired by CLI/compiler).
- **JSX runtime**: `jsx` / `jsxs` / `Fragment` and dev runtime entry aligned
  with Bun/Deno JSX pipelines (`jsxDEV` where required).
- **Types**: `@dreamer/view/types` for shared public types (`VNode`,
  `JSXRenderable`, etc.).

### Published subpaths (JSR `deno.json`)

`"."`, `./types`, `./cli`, `./setup`, `./jsx-runtime`, `./jsx-dev-runtime`,
`./portal`, `./compiler`, `./optimize`, `./ssr` — all capabilities above are
reachable from the **main** entry unless noted as a dedicated subpath.

### Breaking changes

- **npm `package.json` `exports`**: Removed `./csr` and `./hybrid` (aliases to
  the main entry). Use the main package export. Added `./portal` to match JSR.
