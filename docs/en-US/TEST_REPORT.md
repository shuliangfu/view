# @dreamer/view Test Report

## Test Overview

| Item            | Description                                        |
| --------------- | -------------------------------------------------- |
| Package         | @dreamer/view                                      |
| Version         | 1.0.0                                              |
| Test framework  | @dreamer/test ^1.0.5                               |
| Test date       | 2026-02-12                                         |
| DOM environment | happy-dom 20.4.0 (unit/integration), browser (E2E) |
| Command         | `deno test -A tests/`                              |

## Test Results

- **Total tests**: 201
- **Passed**: 201
- **Failed**: 0
- **Pass rate**: 100%
- **Duration**: ~1m 15s

### Test File Summary

| Test file                        | Tests | Status        |
| -------------------------------- | ----- | ------------- |
| e2e/view-example-browser.test.ts | 48    | ✅ All passed |
| integration/integration.test.ts  | 11    | ✅ All passed |
| unit/boundary.test.ts            | 13    | ✅ All passed |
| unit/context.test.ts             | 7     | ✅ All passed |
| unit/directive.test.ts           | 25    | ✅ All passed |
| unit/effect.test.ts              | 15    | ✅ All passed |
| unit/jsx-runtime.test.ts         | 6     | ✅ All passed |
| unit/reactive.test.ts            | 7     | ✅ All passed |
| unit/resource.test.ts            | 8     | ✅ All passed |
| unit/router.test.ts              | 14    | ✅ All passed |
| unit/runtime.test.ts             | 13    | ✅ All passed |
| unit/signal.test.ts              | 14    | ✅ All passed |
| unit/ssr-directives.test.ts      | 6     | ✅ All passed |
| unit/store.test.ts               | 14    | ✅ All passed |

## Feature Test Details

### 1. Boundary (unit/boundary.test.ts) - 13 tests

- ✅ isErrorBoundary returns true for ErrorBoundary and false for other
  functions
- ✅ getErrorBoundaryFallback: function, VNode, undefined, null fallbacks
- ✅ ErrorBoundary returns children; returns null when no children
- ✅ Suspense: sync VNode, Promise with fallback then resolve, null fallback
  edge case

### 2. E2E Browser Examples (e2e/view-example-browser.test.ts) - 48 tests

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
- ✅ Top nav and route changes, Layout theme, 404 and back to home

### 3. Context (unit/context.test.ts) - 7 tests

- ✅ createContext returns Provider and useContext; useContext returns
  defaultValue when no Provider
- ✅ Edge: useContext() returns undefined when defaultValue is undefined and no
  Provider
- ✅ With Provider, pushContext then useContext returns value; Provider value
  null edge case

### 4. Directive (unit/directive.test.ts) - 25 tests

- ✅ directiveNameToCamel / directiveNameToKebab (v-if, vElseIf, etc.)
- ✅ getDirectiveValue, getVIfValue, getVElseShow, getVElseIfValue,
  getVShowValue
- ✅ getVForListAndFactory (array, empty array, non-array edge)
- ✅ hasDirective / hasStructuralDirective / isDirectiveProp
- ✅ registerDirective / getDirective, createBinding

### 5. Effect (unit/effect.test.ts) - 15 tests

- ✅ createEffect: non-function throws, runs once immediately, re-runs after
  signal change, dispose, cleanup and onCleanup
- ✅ Edge: effect callback throw propagates
- ✅ createMemo: non-function throws, getter and cache, recompute on dependency
  change, read in effect, undefined/null return edge

### 6. Integration (integration/integration.test.ts) - 11 tests

- ✅ createRoot + event + signal: button onClick updates signal, DOM updates
  with signal
- ✅ Multiple event types: onClick, onChange binding
- ✅ createEffect and createRoot: root reads signal, external set updates view
- ✅ v-model: input text initial/input/set sync, checkbox checked two-way sync
- ✅ createReactive form: vModel binding, input updates model, multi-field and
  model sync
- ✅ Fine-grained update: patch without full tree replace, DOM node identity
  preserved, input not re-mounted

### 7. JSX Runtime (unit/jsx-runtime.test.ts) - 6 tests

- ✅ jsx / jsxs: type/props/children, key extraction and third-arg override,
  Fragment as Symbol

### 8. Reactive (unit/reactive.test.ts) - 7 tests

- ✅ createReactive: proxy initial props, does not mutate initial, get after set
  returns new value
- ✅ Reading reactive in createEffect re-runs effect on property change (after
  microtask)
- ✅ Nested proxy, multi-field set triggers effects that read those fields

### 9. Resource (unit/resource.test.ts) - 8 tests

- ✅ createResource (no source): loading/data/error, refetch, fetcher throw and
  non-Promise edge
- ✅ createResource (with source): re-request when source changes

### 10. Router (unit/router.test.ts) - 14 tests

- ✅ createRouter: getCurrentRoute, navigate, replace, subscribe, start, stop,
  back/forward/go
- ✅ No location/history does not throw, empty routes array edge
- ✅ Path matching: basePath, dynamic :id
- ✅ beforeRoute: false cancels, redirect path, true continues
- ✅ afterRoute, notFound and meta

### 11. Runtime (unit/runtime.test.ts) - 13 tests

- ✅ renderToString: root HTML, Fragment and multiple children
- ✅ generateHydrationScript: no args, data, scriptSrc
- ✅ createRoot / render: mount, root signal dependency updates DOM, empty
  Fragment, container with existing children, set after unmount does not throw
- ✅ hydrate: reuse children and activate, remove cloak

### 12. Signal (unit/signal.test.ts) - 14 tests

- ✅ createSignal: [getter, setter], initial value, setter and updater, same
  value (Object.is) no update
- ✅ Edge: initial undefined/null
- ✅ isSignalGetter, markSignalGetter

### 13. SSR Directives (unit/ssr-directives.test.ts) - 6 tests

- ✅ SSR vIf / vElseIf / vElse, vFor, vShow

### 14. Store (unit/store.test.ts) - 14 tests

- ✅ createStore: [get, set] for state only, empty state, get() reactive, set
  updater, nested props
- ✅ Default asObject true returns object (direct read of state); default object
  supports direct assignment store.xxx = value to update state
- ✅ actions, persist custom storage, persist.key empty string edge
- ✅ getters derived and state update, getters return undefined, action throw
  edge

## Test Coverage Analysis

| Category          | Coverage                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API methods       | createSignal, createEffect, createMemo, createRoot, createReactive, createStore, createRouter, createResource, createContext, JSX, directives, Boundary, Runtime/SSR covered by tests |
| Edge cases        | Empty array, undefined/null, non-function, no Provider, no location, empty routes, etc.                                                                                               |
| Error handling    | Effect throw, ErrorBoundary, fetcher throw, action throw                                                                                                                              |
| Integration & E2E | createRoot + events + signal, v-model, createReactive form, fine-grained update, browser multi-page and navigation                                                                    |

## Advantages

- Unit, integration, and browser E2E coverage
- Dedicated edge and error scenarios
- Verified in both happy-dom and real browser

## Conclusion

All 201 tests for @dreamer/view pass (100% pass rate). Coverage includes
signals, reactivity, router, resource, context, directives, runtime and SSR,
store, reactive, boundary, and browser example flows, suitable for release and
documentation.
