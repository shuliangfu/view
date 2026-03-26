# @dreamer/view Test Report

## Test Overview

| Item            | Description                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package         | @dreamer/view                                                                                                                                           |
| Version         | 1.3.3                                                                                                                                                   |
| Test framework  | @dreamer/test ^1.0.15                                                                                                                                   |
| Test date       | 2026-03-26                                                                                                                                              |
| DOM environment | happy-dom 20.4.0 (unit/integration), browser (E2E)                                                                                                      |
| Command         | **Deno**: `deno test -A --no-check tests`; **Bun**: `bun test` from package root (use `--preload ./tests/dom-setup.ts` when no DOM to inject happy-dom) |

## Test Results

### Deno

- **Total tests**: 892
- **Passed**: 892
- **Failed**: 0
- **Pass rate**: 100%
- **Duration**: ~3m 14s

### Bun

- **Total tests**: 826
- **Passed**: 826
- **Failed**: 0
- **Pass rate**: 100%
- **Duration**: ~139.6s (**67** test files, including E2E browser and CLI)
- **Note**: Use `--preload ./tests/dom-setup.ts` when no DOM is present so
  unit/integration tests that need `document` do not fail (SSR guard or missing
  document).

> **Deno** and **Bun** report different totals because of runner counting (e.g.
> `describe`/`it` vs `Deno.test`). Both runs cover the same `tests/` tree; this
> report records all passing.

### Test File Summary

(Aligned with `deno test -A --no-check tests` per-file counts; **67** test
files, **892** tests total.)

| Test file                                            | Tests | Status        |
| ---------------------------------------------------- | ----- | ------------- |
| e2e/cli.test.ts                                      | 6     | ✅ All passed |
| e2e/view-example-browser.test.ts                     | 75    | ✅ All passed |
| integration/integration.test.ts                      | 5     | ✅ All passed |
| unit/active-document.test.ts                         | 3     | ✅ All passed |
| unit/boundary.test.ts                                | 22    | ✅ All passed |
| unit/build-hmr.test.ts                               | 5     | ✅ All passed |
| unit/build-jsx-mode.test.ts                          | 5     | ✅ All passed |
| unit/compiled-contract.test.ts                       | 3     | ✅ All passed |
| unit/compiled-runtime.test.ts                        | 26    | ✅ All passed |
| unit/compiler.test.ts                                | 13    | ✅ All passed |
| unit/context.test.ts                                 | 7     | ✅ All passed |
| unit/dev-runtime-warn.test.ts                        | 4     | ✅ All passed |
| unit/directive.test.ts                               | 19    | ✅ All passed |
| unit/dynamic.test.ts                                 | 5     | ✅ All passed |
| unit/effect.test.ts                                  | 50    | ✅ All passed |
| unit/entry-mod-smoke.test.ts                         | 4     | ✅ All passed |
| unit/escape.test.ts                                  | 6     | ✅ All passed |
| unit/for.test.ts                                     | 5     | ✅ All passed |
| unit/form-page-compile.test.ts                       | 3     | ✅ All passed |
| unit/globals.test.ts                                 | 6     | ✅ All passed |
| unit/hmr.test.ts                                     | 3     | ✅ All passed |
| unit/insert-reactive-array-coerce.test.ts            | 8     | ✅ All passed |
| unit/insert-reactive-cleanup-single-to-array.test.ts | 3     | ✅ All passed |
| unit/insert-reactive-intrinsic-ruler.test.ts         | 4     | ✅ All passed |
| unit/insert-reactive-keyed-patch-isolated.test.ts    | 10    | ✅ All passed |
| unit/insert-reactive-metrics.test.ts                 | 4     | ✅ All passed |
| unit/insert-reactive-mountfn-untrack.test.ts         | 3     | ✅ All passed |
| unit/insert-reactive-nested-dispose.test.ts          | 3     | ✅ All passed |
| unit/insert-replacing.test.ts                        | 4     | ✅ All passed |
| unit/jsx-compiler-dependency-graph.test.ts           | 4     | ✅ All passed |
| unit/jsx-compiler.test.ts                            | 112   | ✅ All passed |
| unit/jsx-handoff.test.ts                             | 6     | ✅ All passed |
| unit/jsx-runtime.test.ts                             | 14    | ✅ All passed |
| unit/logger-server.test.ts                           | 4     | ✅ All passed |
| unit/meta.test.ts                                    | 21    | ✅ All passed |
| unit/portal.test.ts                                  | 6     | ✅ All passed |
| unit/proxy.test.ts                                   | 5     | ✅ All passed |
| unit/reactive.test.ts                                | 7     | ✅ All passed |
| unit/ref-dom.test.ts                                 | 4     | ✅ All passed |
| unit/ref.test.ts                                     | 4     | ✅ All passed |
| unit/resource.test.ts                                | 14    | ✅ All passed |
| unit/route-mount-bridge.test.ts                      | 5     | ✅ All passed |
| unit/route-page.test.ts                              | 4     | ✅ All passed |
| unit/router-mount.test.ts                            | 4     | ✅ All passed |
| unit/router.test.ts                                  | 40    | ✅ All passed |
| unit/runtime-insert-reactive-vnode-array.test.ts     | 7     | ✅ All passed |
| unit/runtime-props.test.ts                           | 34    | ✅ All passed |
| unit/runtime.test.ts                                 | 22    | ✅ All passed |
| unit/scheduler-focus-restore.test.ts                 | 6     | ✅ All passed |
| unit/scheduler.test.ts                               | 17    | ✅ All passed |
| unit/show.test.ts                                    | 7     | ✅ All passed |
| unit/signal.test.ts                                  | 22    | ✅ All passed |
| unit/spread-intrinsic.test.ts                        | 62    | ✅ All passed |
| unit/ssr-compiled.test.ts                            | 21    | ✅ All passed |
| unit/ssr-document-shim.test.ts                       | 3     | ✅ All passed |
| unit/store.test.ts                                   | 29    | ✅ All passed |
| unit/stream.test.ts                                  | 4     | ✅ All passed |
| unit/switch-match.test.ts                            | 5     | ✅ All passed |
| unit/transition.test.ts                              | 8     | ✅ All passed |
| unit/unmount.test.ts                                 | 6     | ✅ All passed |
| unit/version-utils.test.ts                           | 9     | ✅ All passed |
| unit/vnode-debug.test.ts                             | 4     | ✅ All passed |
| unit/vnode-insert-bridge.test.ts                     | 3     | ✅ All passed |
| unit/vnode-mount-directives.test.ts                  | 3     | ✅ All passed |
| unit/vnode-mount-getter-mountfn.test.ts              | 6     | ✅ All passed |
| unit/vnode-mount-runtime-props.test.ts               | 30    | ✅ All passed |
| unit/vnode-reconcile.test.ts                         | 16    | ✅ All passed |

## Feature Test Details

### 1. Boundary (unit/boundary.test.ts) - 22 tests

- ✅ isErrorBoundary returns true for ErrorBoundary and false for other
  functions
- ✅ getErrorBoundaryFallback: function, VNode, undefined, null fallbacks
- ✅ ErrorBoundary returns children; returns null when no children; VNode child
  sync throw; getter with signal; MountFn throw paths; mountVNodeTree + compiled
  child
- ✅ Suspense: sync VNode, Promise with fallback then resolve,
  Promise&lt;MountFn&gt;, reject without unhandled rejection, null fallback edge
  case
- ✅ **Nested ErrorBoundary**: inner error shows inner fallback only; error does
  not bubble to outer boundary

### 2. E2E CLI (e2e/cli.test.ts) - 6 tests

- ✅ view init &lt;dir&gt;: generates view.config.ts, deno.json, src, views,
  router, etc.
- ✅ view build in examples: produces dist/ with main.js
- ✅ view start after build: serves and browser opens home with multi-page
  example

### 3. E2E Browser Examples (e2e/view-example-browser.test.ts) - 75 tests

- ✅ Home mount and multi-page entry; cards to
  Signal/Store/Boundary/Directive/Reactive/Resource/Context/Form/Runtime/Router
  and **control-flow**, **list-insert**, etc.
- ✅ Signal page: count/double, name input and greeting
- ✅ Store page: count, greeting and name input; **persist**: clear storage key,
  increment, localStorage write, reload still restores count
- ✅ Boundary page: error display, Suspense async content
- ✅ Directive page: vIf/vElse chain, form `value`/`checked` (`SignalRef`) with
  onInput/onChange, v-focus; **main text includes v-once / vCloak sections**
- ✅ Reactive page: createReactive form, multi-field summary, select and options
- ✅ Resource page: refetch, id switch, Suspense and Promise blocks
- ✅ Context page: light/dark theme toggle
- ✅ **Form page**: password input keeps focus after reactive patch (no replace)
- ✅ Runtime page: input then generate HTML (renderToString); **page shows
  generateHydrationScript, renderToStream / `@dreamer/view/stream` doc blocks**
- ✅ **Control-flow page**: /control-flow documents For, Show, etc.
- ✅ **List-insert page**: /list-insert API copy; null fallback; row clicks
- ✅ **Layout page**: /layout shows layout example and _layout、inheritLayout
  copy
- ✅ **Layout 2 page**: /layout/layout2 nested route and copy; **document.title
  accepts Layout2 / Layout 2**
- ✅ **Loading page**: /loading lazy-loads then shows loading-state example and
  _loading copy
- ✅ **Gallery**: /gallery grid, /images assets load; first thumbnail opens
  viewer, zoom, close; **top “示例 / Examples” dropdown → gallery** (nav label
  zh/en: 相册 / Gallery)
- ✅ **Globals / Portal / Transition** and top nav; Layout theme, 404 and back
  to home

### 4. Context (unit/context.test.ts) - 7 tests

- ✅ createContext returns Provider and useContext; useContext returns
  defaultValue when no Provider
- ✅ Edge: useContext() returns undefined when defaultValue is undefined and no
  Provider
- ✅ With Provider, pushContext then useContext returns value; Provider value
  null edge case

### 5. Directive (unit/directive.test.ts) - 19 tests

- ✅ directiveNameToCamel / directiveNameToKebab (v-if, vElseIf, etc.)
- ✅ getDirectiveValue, getVIfValue, getVElseShow, getVElseIfValue
- ✅ hasDirective / hasStructuralDirective / isDirectiveProp
- ✅ registerDirective / getDirective, createBinding

### 6. Effect (unit/effect.test.ts) - 50 tests

- ✅ runWithScope / EffectScope, Owner aliases; **on** explicit deps,
  **createReaction**, **createRenderEffect**, **catchError**, **onMount**
- ✅ createEffect: non-function throws, runs once immediately, re-runs after
  signal change, dispose, cleanup and onCleanup; callback throw propagates
- ✅ createMemo / **children** / **createDeferred**: cache, equals, deferred
  commits

### 7. Integration (integration/integration.test.ts) - 5 tests

- ✅ createRoot(fn(container)) + signal: button onClick updates signal; insert
  getter updates DOM with signal; unmount clears container
- ✅ Multiple event types: onClick and change handlers bind correctly
- ✅ insert(getter) reads signal; external `.value` assignment updates view
- ✅ After unmount, setting signal does not throw and DOM is not updated

### 8. JSX Runtime (unit/jsx-runtime.test.ts) - 14 tests

- ✅ jsx / jsxs / jsxDEV: type/props/children, key extraction and third-arg
  override, Fragment as Symbol
- ✅ jsxMerge / jsxMerges equivalence with mergeProps + jsx/jsxs

### 9. Meta (unit/meta.test.ts) - 21 tests

- ✅ getMetaHeadFragment: title, titleSuffix, fallbackTitle, name meta, og meta,
  HTML escaping; edge: meta null, empty title, value null/empty/non-string, og
  array or key without prefix
- ✅ applyMetaToHead: document.title and meta, fallbackTitle, titleSuffix, og
  property; edge: undefined meta, empty/whitespace name values

### 10. Reactive (unit/reactive.test.ts) - 7 tests

- ✅ createReactive: proxy initial props, does not mutate initial, get after set
  returns new value
- ✅ Reading reactive in createEffect re-runs effect on property change (after
  microtask)
- ✅ Nested proxy, multi-field set triggers effects that read those fields

### 11. Resource (unit/resource.test.ts) - 14 tests

- ✅ createResource (no source): loading/data/error, refetch, fetcher throw and
  non-Promise edge
- ✅ createResource (with source): re-request when source changes
- ✅ **lazy**, **mapArray** list mapping and caching

### 12. Router (unit/router.test.ts) - 40 tests

- ✅ createRouter: getCurrentRoute, navigate, replace, subscribe, start, stop,
  back/forward/go
- ✅ No location/history does not throw, empty routes array edge
- ✅ Path matching: basePath, dynamic :id; beforeRoute: false cancels, redirect
  path, true continues
- ✅ afterRoute, notFound and metadata; scroll: top / false / restore
- ✅ mode (history / hash): pathname+search, hash path+query, href with #,
  navigate/replace
- ✅ buildPath and navigate/href/replace with params and query;
  encodeURIComponent
- ✅ interceptLinks: same-origin &lt;a&gt; intercept,
  target=_blank/download/data-native skip, hash anchor, modifier/right-click
  skip, interceptLinks: false

### 13. Runtime (unit/runtime.test.ts) - 22 tests

- ✅ generateHydrationScript: no args, data, scriptSrc
- ✅ createRoot / render: mount, insert(getter) and SignalRef, empty fn,
  container with existing children, set after unmount does not throw
- ✅ **mount**: selector, noopIfNotFound, fn runs once; insertReactive edges
  with MountFn, DocumentFragment, VNode

### 14. Scheduler (unit/scheduler.test.ts) - 17 tests

- ✅ schedule / flushScheduler / batch / unschedule: microtasks, nested batch,
  composition and DEFER paths

### 15. Signal (unit/signal.test.ts) - 22 tests

- ✅ createSignal: returns `SignalRef` (`.value` read/write), updater fn, same
  value (Object.is) no update; tuple `[get, set]`
- ✅ Edge: initial undefined/null
- ✅ isSignalGetter, isSignalRef, `unwrapSignalGetterValue`, markSignalGetter

### 16. SSR document shim (unit/ssr-document-shim.test.ts) - 3 tests

- ✅ `globalThis.document` is restored after `renderToString` / `renderToStream`
  finishes

### 17. Store (unit/store.test.ts) - 29 tests

- ✅ createStore: [get, set] for state only, empty state, get() reactive, set
  updater, nested props
- ✅ Default asObject true returns object (direct read of state); default object
  supports direct assignment store.xxx = value to update state
- ✅ actions, persist custom storage, persist.key empty string edge
- ✅ getters derived and state update, getters return undefined, action throw
  edge
- ✅ withGetters / withActions helpers; getters-only or actions-only asObject
  true/false; getters + actions asObject false
- ✅ Persist: storage null, custom serialize/deserialize, getItem null/empty,
  deserialize throw, setItem throw
- ✅ Same key returns existing instance (state shared); setState updater;
  getters/actions non-function entries skipped; Proxy ownKeys / spread

### 18. Stream (unit/stream.test.ts) - 4 tests

- ✅ renderToStream: async generator; root child order yields HTML chunks

### 19. Build & HMR (unit/build-hmr.test.ts, unit/hmr.test.ts) - 8 tests

- ✅ getRoutePathForChangedPath: /views/home → "/", /views/{segment} →
  "/{segment}", Windows path
- ✅ getHmrVersionGetter / **VIEW_HMR_BUMP**: version getter and bump

### 20. Compiler (unit/compiler.test.ts) - 13 tests

- ✅ optimize: constant folding (numeric, comparison, string concat),
  empty/invalid code; edge: divide/modulo by zero (no fold), unary plus fold,
  multiply/divide fold, fileName .tsx parsing
- ✅ createOptimizePlugin: name and setup, custom filter and readFile; onLoad
  readFile failure catch returns empty string

### 20b. JSX compiler & spread (unit/jsx-compiler.test.ts,

unit/spread-intrinsic.test.ts)

- ✅ **jsx-compiler (112)**: compileSource, static branch folding, Suspense/vIf,
  ref, controlled input, dynamic `target` / `className`, list coalesce,
  For/Show/Switch/Dynamic, etc.
- ✅ **spread-intrinsic (62)**: `spreadIntrinsicProps`;
  **`setIntrinsicDomAttribute`** uses `removeAttribute` for `null` / `undefined`
  (no literal `"undefined"`)

### 21. Proxy (unit/proxy.test.ts) - 5 tests

- ✅ createNestedProxy: get/set consistent with target, nested proxy, proxyCache
  reuse

### 22. Custom directives mount (unit/vnode-mount-directives.test.ts) - 3 tests

- ✅ Hand-written VNode + `applyDirectives`: `mounted` runs in microtask
- ✅ Binding as signal getter: `updated` re-runs when dependencies change;
  `SignalRef` bindings also re-run `updated`

### 23. Other focused suites (summary)

- ✅ **For / Show / Dynamic / Switch** (unit/for, show, dynamic, switch-match):
  lists, conditions, `SignalRef` and accessors
- ✅ **insertReactive** family: array coercion, keyed patch, MountFn untrack,
  metrics, intrinsic ruler, VNode arrays and tail-anchor ordering
- ✅ **vnode-reconcile**: canPatch, controlled input, patch focus
- ✅ **compiled-runtime / compiled-contract / entry-mod-smoke**: main vs
  compiled entry contracts
- ✅ **active-document, globals, escape, logger-server, version-utils, portal,
  transition, unmount, dev-runtime-warn, build-jsx-mode, form-page-compile,
  jsx-handoff, jsx-compiler-dependency-graph, route-mount-bridge, route-page,
  router-mount, runtime-insert-reactive-vnode-array, runtime-props,
  scheduler-focus-restore, vnode-debug, vnode-insert-bridge,
  vnode-mount-getter-mountfn, vnode-mount-runtime-props**, etc. (see table
  above)

## Test Coverage Analysis

| Category          | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API methods       | createSignal (`SignalRef`), `unwrapSignalGetterValue`, createEffect, createMemo, createRoot, mount, createReactive, createStore, createRouter, createResource, createContext, JSX, compiler (incl. **compileSource** + **`setIntrinsicDomAttribute` for dynamic attrs**), directives (incl. custom mount + `SignalRef` updated), Boundary, Runtime/SSR, **SSR document shim**, scheduler, meta, proxy, stream, **spread-intrinsic** (incl. **`setIntrinsicDomAttribute`**), **insert-reactive** family, **For/Show/Dynamic** |
| Edge cases        | Empty array, undefined/null, non-function, no Provider, no location, empty routes, unmount + signal set, etc.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Error handling    | Effect throw, ErrorBoundary, fetcher throw, action throw                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Integration & E2E | createRoot + events + signal + insert, microtask DOM updates, CLI init/build/start, browser multi-page and navigation, **control-flow / list-insert / Form password focus / Gallery / Layout2 / Runtime doc blocks / Store persist**, etc.                                                                                                                                                                                                                                                                                   |

## Advantages

- Unit, integration, and browser E2E coverage
- Dedicated edge and error scenarios
- Verified in both happy-dom and real browser
- **Deno** (`deno test -A --no-check tests`) and **Bun** (`bun test`) both
  passed in this recorded run

## Conclusion

All tests for @dreamer/view pass under **Deno** (**892** tests) and **Bun**
(**826** tests; different runner totals). 100% pass rate. Coverage includes
signals (`SignalRef`, `unwrapSignalGetterValue`), reactivity, scheduler, router,
resource, context, directives (built-in helpers + **vnode-mount-directives**
custom `applyDirectives`), runtime and SSR (createRoot, render, **mount**,
renderToString, renderToStream, **SSR document shim**), **spread-intrinsic**
(incl. **`setIntrinsicDomAttribute`**) / **insert-reactive** / **runtime-props**
(mergeProps, splitProps), store (persist, getters/actions), reactive, boundary,
meta, proxy, compiler (incl. dynamic attrs **`setIntrinsicDomAttribute`**),
stream, build/HMR, **build-jsx-mode**, **dev-runtime-warn**, **compiled vs
compiler contract**, RoutePage, **route-mount-bridge**, router-mount,
**jsx-handoff**, version-utils, logger-server, **vnode-debug**,
**vnode-mount-runtime-props**, subpath entry smoke (csr/hybrid/ssr),
**vnode-insert-bridge**, CLI (init/build/start), **browser E2E** (control-flow,
list-insert, Gallery, Layout2, Form password focus, Store localStorage restore,
v-once/vCloak copy, etc.), and **integration** (createRoot + insert + events +
unmount), suitable for release and documentation.
