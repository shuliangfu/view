# Changelog

All notable changes to @dreamer/view are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.6] - 2026-07-22

### Security

- **`setProperty` / URL props**: `href` / `src` / `action` (and related) go
  through `sanitizeUrl`; blocks `javascript:` / `vbscript:` / `data:text/html`
  (including zero-width and whitespace obfuscation).
- **Event handlers**: functions only; string handlers like `onClick="..."` are
  ignored.
- **`on*` detection**: third character must be uppercase (`onClick`), so
  attributes such as `open` / `once` are not treated as events.
- **Inline `style`**: strips `expression(` / `javascript:`.
- **Props**: direct `innerHTML` / `outerHTML` via props is rejected (console
  warn).

### Changed (perf / slim — public API unchanged)

- **Keyed `For` reorder**: **LIS**-based minimal moves from current DOM order;
  no-op when order is already correct; safe full fallback if needed.
- **`insert`**: dedicated Signal effect fast path; array path uses shared
  `isDomNode`.
- **escape / SSR**: single-pass `escapeForText` / `escapeForAttr`; `ssr-dom`
  reuses shared escape helpers.
- **Compiler**: wider static lifting (`void`, `typeof` literals, `satisfies`, …)
  so more props land in templates with fewer Effects; shared
  `isStaticExpression`.
- **Deps**: align `@dreamer/runtime-adapter` ^1.1.0, `@dreamer/test` ^1.1.10,
  etc.

### Tests / tooling

- Bun: `bunfig.toml` preloads `tests/unit/dom-setup.ts` by default (matches
  `package.json` test script; avoids missing DOM under isolation).
- Added coverage: For reverse/shuffle + mid-insert, props security, escape URL
  obfuscation, compiler `typeof`/`void`, `for.bench.ts`, etc.
- **Deno** unit+integration **384** / **Bun** unit+integration **317**, 0
  failed.

### Notes

- **No** public API / `exports` breaking changes; intentional **patch**.
- Additive tree-shake subpaths are planned for **2.1.0**.

---

## [2.0.5] - 2026-07-10

### Fixed

- **SSR pseudo-DOM (no browser `document` on Deno/Bun)**: `SsrElement` now
  implements **`hasAttribute`** / **`toggleAttribute`**; `style` supports
  **`removeProperty` / `setProperty` / `getPropertyValue`**; **`id`**
  getter/setter. Fixes dweb hybrid SSR crashing with
  `TypeError: el.hasAttribute is not a function` when props are `null` /
  `undefined`.
- **`setProperty`**: attribute branch falls back to `getAttribute` when
  `hasAttribute` is missing.

### Changed (SSR DOM completeness)

- Node: `nodeName`, `parentElement`, `isConnected`, `contains`, `lastChild`, …
- Element: `classList`, `dataset`, `matches`/`closest`, `querySelector(All)`,
  `append`/`prepend`/`before`/`after`/`replaceWith`, common reflected props.
- Document: lazy `head`/`body`, `querySelector(All)`, `importNode`.
- Simple selectors: tag/`#id`/`.class`/`[attr]`/descendant/comma.

### Tests

- `tests/unit/runtime/ssr-dom-element-api.test.ts` (Element API +
  `renderToString` + classList/matches/query/meta).

---

## [2.0.4] - 2026-07-10

### Added

- **Router SSR**: `CreateRouterOptions.url` / `ssr`, `parseRouterUrl`,
  `matchRoute`; `renderRouterToString` on `@dreamer/view/ssr` for isomorphic
  route HTML.
- **Router render**: synchronous page components with `params`/`query` props no
  longer fall through to async Resource (empty SSR HTML).
- **Compiler**: wider static expression lifting (ternary, template literals,
  `as` / non-null); module-level `walk` path constants (`_path$N`); fewer
  unnecessary Effects for clearly static props.
- **Controlled inputs**: IME composition guards; string-normalized `value`
  compare; best-effort selection restore when a write is required.
- **Bench**: `tests/bench/signal.bench.ts` and `deno task bench`.
- **Tests**: router SSR suite, focus/IME cases, escape utils, For keyed no-shell
  cases, static compiler cases.

### Changed

- **For + key**: comment range anchors instead of `span[data-view-for-keyed]`
  shells; skip DOM reorder when order already correct; track item only so pure
  reorders reuse nodes.
- **Signal**: anonymous signals skip global registry in production; register
  under `VIEW_DEV` for HMR state continuity.
- **Store**: anonymous ids without `Error().stack`; `Object.is` on proxy set.
- **Runtime micro-opts**: mount clear via `textContent` where safe; template
  SSR/client caches (bounded LRU); className/cssText same-value skip; priority
  drain buffer; `pathToParts` without extra filter; form error-map init; SSR
  `stringify` fewer allocations; `cleanNode` / list loops without forEach
  spreads where safe.
- **Docs**: zh-CN / en-US `TEST_REPORT.md` refreshed (Deno unit+integration 359
  passed).

### Fixed

- **Focus loss**: number Signal vs DOM string `value` no longer forces
  reassignment every keystroke; composition periods do not clobber input value.

---

## [2.0.3] - 2026-07-06

### Changed

- **Dependencies**: bump `@dreamer/esbuild` from `^1.1.9` to `^1.2.0` in
  `deno.json` and `package.json` (jsr: runtime fallback + dynamic `import()`
  cache coverage).

### Added

- **Reactivity (`signal.ts`)**: `hasObservers` flag on `Observer` replaces
  runtime `"observers" in` checks in `notify` / `notifyCheck`, avoiding
  prototype-chain traversal overhead.
- **Reactivity (`signal.ts`)**: `cleanupObserver` now clears cross-references on
  `Subscription` nodes (source/observer/prev/next pointers) to aid GC.
- **Reactivity (`owner.ts`)**: `adoptChild` uses a backing `Set` for O(1)
  contains-check instead of `Array.includes` O(n); `cleanNode` syncs the Set on
  removal.
- **Scheduler (`batch.ts`)**: `runPendingSlice` swaps the pending array in place
  instead of `[...core.pending]` spread, avoiding a new array allocation per
  flush.
- **Tests**: `cycle-detection`, `signal-optimization`, `insert-reactive` unit
  tests added.

### Fixed

- **Reactivity (`effect.ts`, `memo.ts`)**: Memo upstream detection changed from
  `"run" in sub.source` to `typeof run === 'function'`, avoiding false positives
  when non-Memo sources happen to have a `run` property.

---

## [2.0.2] - 2026-04-18

### Changed

- **Dependencies**: bump JSR ranges in `deno.json` — `@dreamer/server` to
  `^1.1.2`, `@dreamer/test` to `^1.1.3`, `@dreamer/plugins` to `^1.1.0`; align
  `package.json` npm aliases to the same.
- **Examples**: bump `@dreamer/plugins` to `^1.1.0` and `@dreamer/esbuild` to
  `^1.1.6` in `examples/package.json` and `examples/deno.json`.

## [2.0.1] - 2026-04-10

### Added

- **`RefObject<T>`** type: ref object with required **`current`** (initial
  `null`); **`createRef`** now returns **`RefObject<T>`** (narrowing-friendly).
- **`MaybeAccessor<T>`** and **`readAccessor`**: control-flow props can be a
  plain value, a zero-arg getter, or a **`createSignal`** tuple getter; used by
  **`Show`**, **`For`**, **`Index`**, **`Match`**, and
  **`ErrorBoundary.resetKeys`**.
- **`isSignal`**, **`readAccessor`**, **`unwrap`** exported from the main
  package (alongside existing runtime use) for libraries that mirror `insert`’s
  signal/function rules.
- **`createRef`** and **`getDocument`** re-exported from
  **`@dreamer/view/jsx-runtime`** next to **`jsx`**, so JSX-only bundles can use
  ref objects without importing the full barrel.
- **`createRef` / `getDocument` JSDoc** and **`mod.ts`** architecture notes
  updated.

### Fixed

- **`insert` (arrays)**: insert array children **directly under the parent**
  instead of staging in a **DocumentFragment** that becomes empty once moved to
  the document—effects no longer target a detached fragment (fixes multi-line /
  multi-node cases such as password fields).
- **Array blocks**: trailing **`<!--view:array-end-->`** comment anchor plus
  **`WeakMap`** bookkeeping so reactive re-runs remove/replace the whole
  segment; documents **`display:contents` shell** anti-pattern for Tailwind
  **`space-y-*`** / **`:first-child`**; special path for **`<details>`** so
  **`summary`** stays the first element child (valid content model).
- **Delegated events**: **`onMouseEnter`**, **`onMouseLeave`**,
  **`onPointerEnter`**, **`onPointerLeave`** use **direct `addEventListener`**
  on the element (these events do not bubble to `document`).
- **DOM props**: **`id`**, **`name`**, **`for`**, etc.—when the prop is
  **`undefined`** or **`null`**, remove the attribute instead of coercing to the
  literal string **`"undefined"`** (label association and form semantics).

### Changed

- **`ViewRefObject`**: documented as the loose shape (`current` optional);
  **`RefObject`** is the strict **`createRef`** return type.

### Tests

- More **unit coverage** for **`insert`** (arrays, **`<details>`**), **`props`**
  (non-bubbling handlers, attribute removal), **`dom` / refs**, and
  **control-flow** **`MaybeAccessor`** behaviour.

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
