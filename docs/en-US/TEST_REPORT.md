# @dreamer/view Test Report

## Test Overview

| Item            | Description                                        |
| --------------- | -------------------------------------------------- |
| Package         | @dreamer/view                                      |
| Version         | 1.0.13                                             |
| Test framework  | @dreamer/test ^1.0.6                               |
| Test date       | 2026-02-16                                         |
| DOM environment | happy-dom 20.4.0 (unit/integration), browser (E2E) |
| Command         | `deno test -A tests/`                              |

## Test Results

- **Total tests**: 412
- **Passed**: 412
- **Failed**: 0
- **Pass rate**: 100%
- **Duration**: ~2m

### Test File Summary

| Test file                        | Tests | Status        |
| -------------------------------- | ----- | ------------- |
| e2e/cli.test.ts                  | 6     | ✅ All passed |
| e2e/view-example-browser.test.ts | 63    | ✅ All passed |
| integration/integration.test.ts  | 14    | ✅ All passed |
| unit/boundary.test.ts            | 13    | ✅ All passed |
| unit/build-hmr.test.ts           | 5     | ✅ All passed |
| unit/compiler.test.ts            | 13    | ✅ All passed |
| unit/context.test.ts             | 8     | ✅ All passed |
| unit/directive.test.ts           | 25    | ✅ All passed |
| unit/effect.test.ts              | 15    | ✅ All passed |
| unit/globals.test.ts             | 5     | ✅ All passed |
| unit/hmr.test.ts                 | 3     | ✅ All passed |
| unit/jsx-runtime.test.ts         | 6     | ✅ All passed |
| unit/meta.test.ts                | 21    | ✅ All passed |
| unit/portal.test.ts              | 5     | ✅ All passed |
| unit/props.test.ts               | 55    | ✅ All passed |
| unit/proxy.test.ts               | 5     | ✅ All passed |
| unit/reactive.test.ts            | 7     | ✅ All passed |
| unit/resource.test.ts            | 8     | ✅ All passed |
| unit/router.test.ts              | 17    | ✅ All passed |
| unit/runtime.test.ts             | 50    | ✅ All passed |
| unit/scheduler.test.ts           | 5     | ✅ All passed |
| unit/signal.test.ts              | 14    | ✅ All passed |
| unit/ssr-directives.test.ts      | 6     | ✅ All passed |
| unit/store.test.ts               | 29    | ✅ All passed |
| unit/stream.test.ts              | 7     | ✅ All passed |
| unit/transition.test.ts          | 7     | ✅ All passed |

## Feature Test Details

### 1. Boundary (unit/boundary.test.ts) - 13 tests

- ✅ isErrorBoundary returns true for ErrorBoundary and false for other
  functions
- ✅ getErrorBoundaryFallback: function, VNode, undefined, null fallbacks
- ✅ ErrorBoundary returns children; returns null when no children
- ✅ Suspense: sync VNode, Promise with fallback then resolve, null fallback
  edge case

### 2. E2E CLI (e2e/cli.test.ts) - 6 tests

- ✅ view init &lt;dir&gt;: generates view.config.ts, deno.json, src, views,
  router, etc.
- ✅ view build in examples: produces dist/ with main.js
- ✅ view start after build: serves and browser opens home with multi-page
  example

### 3. E2E Browser Examples (e2e/view-example-browser.test.ts) - 63 tests

- ✅ Home mount and multi-page entry; navigation to
  Signal/Store/Boundary/Directive/Reactive/Resource/Context/Runtime/Router
- ✅ Signal page: count/double, name input and greeting
- ✅ Store page: count, greeting and name input
- ✅ Boundary page: error display, Suspense async content
- ✅ Directive page: vIf/vShow/v-for, v-text/v-html, v-model input and checkbox
- ✅ Reactive page: createReactive form, multi-field summary, select and options
- ✅ Resource page: refetch, id switch, Suspense and Promise blocks
- ✅ Context page: light/dark theme toggle
- ✅ Runtime page: input then generate HTML (renderToString)
- ✅ **Layout page**: /layout shows layout example and _layout、inheritLayout
  copy
- ✅ **Loading page**: /loading lazy-loads then shows loading-state example and
  _loading copy
- ✅ Top nav and route changes, Layout theme, 404 and back to home

### 4. Context (unit/context.test.ts) - 8 tests

- ✅ createContext returns Provider and useContext; useContext returns
  defaultValue when no Provider
- ✅ Edge: useContext() returns undefined when defaultValue is undefined and no
  Provider
- ✅ With Provider, pushContext then useContext returns value; Provider value
  null edge case

### 5. Directive (unit/directive.test.ts) - 25 tests

- ✅ directiveNameToCamel / directiveNameToKebab (v-if, vElseIf, etc.)
- ✅ getDirectiveValue, getVIfValue, getVElseShow, getVElseIfValue,
  getVShowValue
- ✅ getVForListAndFactory (array, empty array, non-array edge)
- ✅ hasDirective / hasStructuralDirective / isDirectiveProp
- ✅ registerDirective / getDirective, createBinding

### 6. Effect (unit/effect.test.ts) - 15 tests

- ✅ createEffect: non-function throws, runs once immediately, re-runs after
  signal change, dispose, cleanup and onCleanup
- ✅ Edge: effect callback throw propagates
- ✅ createMemo: non-function throws, getter and cache, recompute on dependency
  change, read in effect, undefined/null return edge

### 7. Integration (integration/integration.test.ts) - 12 tests

- ✅ createRoot + event + signal: button onClick updates signal, DOM updates
  with signal
- ✅ Multiple event types: onClick, onChange binding
- ✅ createEffect and createRoot: root reads signal, external set updates view
- ✅ v-model: input text initial/input/set sync, checkbox checked two-way sync
- ✅ createReactive form: vModel binding, input updates model, multi-field and
  model sync
- ✅ Fine-grained update: patch without full tree replace, DOM node identity
  preserved, input not re-mounted; **getter returning Fragment**: input inside
  Fragment remains same DOM node after signal update (no focus loss)

### 8. JSX Runtime (unit/jsx-runtime.test.ts) - 6 tests

- ✅ jsx / jsxs: type/props/children, key extraction and third-arg override,
  Fragment as Symbol

### 9. Meta (unit/meta.test.ts) - 21 tests

- ✅ getMetaHeadFragment: title, titleSuffix, fallbackTitle, name meta, og meta,
  HTML escaping; edge: meta null, empty title, value null/empty/non-string, og
  array or key without prefix
- ✅ applyMetaToHead: document.title and meta, fallbackTitle, titleSuffix, og
  property; edge: undefined meta, empty/whitespace name values

### 10. Props (unit/props.test.ts) - 55 tests

- ✅ applyProps: form value (clear, new value diff, blur); ref (null, callback,
  { current }, signal getter, no current); vShow/vCloak;
  dangerouslySetInnerHTML; value/checked reactive (getter, function); events
  (onClick, replace, null, onChange); class/className, style, innerHTML; boolean
  and generic attributes, select/textarea; children/key/directive skip; custom
  directives (mounted, unmounted, updated).

### 11. Reactive (unit/reactive.test.ts) - 7 tests

- ✅ createReactive: proxy initial props, does not mutate initial, get after set
  returns new value
- ✅ Reading reactive in createEffect re-runs effect on property change (after
  microtask)
- ✅ Nested proxy, multi-field set triggers effects that read those fields

### 12. Resource (unit/resource.test.ts) - 8 tests

- ✅ createResource (no source): loading/data/error, refetch, fetcher throw and
  non-Promise edge
- ✅ createResource (with source): re-request when source changes

### 13. Router (unit/router.test.ts) - 14 tests

- ✅ createRouter: getCurrentRoute, navigate, replace, subscribe, start, stop,
  back/forward/go
- ✅ No location/history does not throw, empty routes array edge
- ✅ Path matching: basePath, dynamic :id
- ✅ beforeRoute: false cancels, redirect path, true continues
- ✅ afterRoute, notFound and meta

### 14. Runtime (unit/runtime.test.ts) - 50 tests

- ✅ renderToString: root HTML, Fragment and multiple children; **SSR branch
  coverage**: null/undefined children, signal getter as child, plain function as
  child (no function source output), array with function, function returning
  null/array/Fragment, number/string/escape text, keyed children, void elements,
  htmlFor/style/vCloak, options, root null throws, ErrorBoundary fallback;
  **Fragment root** with function child
- ✅ generateHydrationScript: no args, data, scriptSrc
- ✅ createRoot / render: mount, root signal dependency updates DOM, empty
  Fragment, container with existing children, set after unmount does not throw
- ✅ **forceRender**: root.forceRender() triggers root effect re-run (e.g.
  external router integration)
- ✅ **createReactiveRoot**: initial mount and Root return; getState as signal
  triggers patch update (number and object state); unmount clears container;
  edge: set state after unmount does not throw and does not update DOM
- ✅ **mount**: mount(container, fn) with Element same as render;
  mount(selector, fn) resolves and mounts; noopIfNotFound returns empty Root;
  missing selector without noopIfNotFound throws; has children → hydrate path
  (remove cloak); no children → render path
- ✅ hydrate: reuse children and activate, remove cloak; state change after
  hydrate uses patch (same DOM reference for input)

### 15. Scheduler (unit/scheduler.test.ts) - 5 tests

- ✅ schedule: tasks run in microtask; multiple schedules in same tick batch
- ✅ unschedule: before flush cancels task; only specified task removed

### 16. Signal (unit/signal.test.ts) - 14 tests

- ✅ createSignal: [getter, setter], initial value, setter and updater, same
  value (Object.is) no update
- ✅ Edge: initial undefined/null
- ✅ isSignalGetter, markSignalGetter

### 17. SSR Directives (unit/ssr-directives.test.ts) - 6 tests

- ✅ SSR vIf / vElseIf / vElse, vFor, vShow

### 18. Store (unit/store.test.ts) - 29 tests

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

### 19. Stream (unit/stream.test.ts) - 7 tests

- ✅ renderToStream: returns generator; simple div yields HTML; text children
  escaped; **plain function as child** renders return value (no source code);
  keyed children output data-view-keyed; void elements no closing tag

### 20. Build & HMR (unit/build-hmr.test.ts, unit/hmr.test.ts) - 8 tests

- ✅ getRoutePathForChangedPath: /views/home → "/", /views/{segment} →
  "/{segment}", Windows path
- ✅ getHmrVersionGetter / **VIEW_HMR_BUMP**: version getter and bump

### 21. Compiler (unit/compiler.test.ts) - 13 tests

- ✅ optimize: constant folding (numeric, comparison, string concat),
  empty/invalid code; edge: divide/modulo by zero (no fold), unary plus fold,
  multiply/divide fold, fileName .tsx parsing
- ✅ createOptimizePlugin: name and setup, custom filter and readFile; onLoad
  readFile failure catch returns empty string

### 22. Proxy (unit/proxy.test.ts) - 5 tests

- ✅ createNestedProxy: get/set consistent with target, nested proxy, proxyCache
  reuse

## Test Coverage Analysis

| Category          | Coverage                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API methods       | createSignal, createEffect, createMemo, createRoot, **createReactiveRoot**, **mount**, createReactive, createStore, createRouter, createResource, createContext, JSX, directives, Boundary, Runtime/SSR, scheduler, meta, proxy, compiler, stream covered by tests |
| Edge cases        | Empty array, undefined/null, non-function, no Provider, no location, empty routes, etc.                                                                                                                                                                            |
| Error handling    | Effect throw, ErrorBoundary, fetcher throw, action throw                                                                                                                                                                                                           |
| Integration & E2E | createRoot + events + signal, v-model, createReactive form, fine-grained update, CLI init/build/start, browser multi-page and navigation                                                                                                                           |

## Advantages

- Unit, integration, and browser E2E coverage
- Dedicated edge and error scenarios
- Verified in both happy-dom and real browser

## Conclusion

All 381 tests for @dreamer/view pass (100% pass rate). Coverage includes
signals, reactivity, scheduler, router, resource, context, directives, runtime
and SSR (createRoot, render, **mount**, **createReactiveRoot**, hydrate,
renderToString with full branch coverage, renderToStream), **applyProps** (ref,
vShow/vCloak, dangerouslySetInnerHTML, value/checked reactive, events, class,
style, attributes, custom directives), store (persist, getters/actions, edge
cases), reactive, boundary, meta (getMetaHeadFragment, applyMetaToHead, edge
cases), proxy, compiler (constant folding edge cases, plugin onLoad catch),
stream, build/HMR, CLI (init/build/start), browser example flows, and
**integration**: getter-returning-Fragment input focus preservation, suitable
for release and documentation.
