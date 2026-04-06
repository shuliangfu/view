# @dreamer/view Test Report

## Test Overview

| Item            | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| Package         | @dreamer/view                                                               |
| Version         | 2.0.0                                                                       |
| Test Framework  | @dreamer/test ^1.1.1                                                        |
| Test Date       | 2026-04-06                                                                  |
| DOM Environment | happy-dom 20.4.0 (Unit/Integration), Chromium (E2E)                       |
| Execution       | `deno test -A` (repo root: all under `tests/`) & `bun test` (package root)  |

## Test Summary

The framework achieves a **100% pass rate** on both Deno and Bun. **Deno** and **Bun** use different runners and discovery rules, so **reported case counts are not identical**; both runs cover the same **62** test modules under `tests/` (60 `*.test.ts` + 2 `*.test.tsx`).

### Runtime Statistics

- **Deno**: **290** passed / **0** failed (duration ~38s, typical laptop)
- **Bun**: **229** passed / **0** failed (duration ~23s, **62** files)
- **Pass rate**: 100%
- **Scope**: Unit, Integration, E2E (examples dev server + browser), SSR bootstrap without `document`

### Why Deno vs Bun counts differ

- **Deno** registers each `it()` (and framework hooks) as separate steps; some suites expose more granular steps than Bun’s default reporter.
- **Bun** may collapse or batch nested reporting; the important invariant is **0 failures** on the same source tree.

### Module Statistics

| Module / area            | Description                                                                 | Status         |
| ------------------------ | --------------------------------------------------------------------------- | -------------- |
| `reactivity/`            | Signal, Effect, Memo, Store, Selector, Context, Lifecycle, Owner            | ✅ All Passed |
| `runtime/`               | Template, Insert, Props, Control-flow, Suspense, Component, Hydration, HMR, Portal, DOM helpers, mount details, SSR async/stream | ✅ All Passed |
| `compiler/`              | Analyzer, Transformer, Path-gen, Directive, SSR Mode, HMR                   | ✅ All Passed |
| `integrations/`          | Resource, Router, Form                                                      | ✅ All Passed |
| `scheduler/`             | Batch, Priority                                                             | ✅ All Passed |
| `server/` (tooling)      | Config load (JSON/TS), layout chain, routers codegen, `createApp` smoke, semver utils | ✅ All Passed |
| `optimize` / `i18n`      | Template optimizer plugin shape; locale normalization & `$tr`             | ✅ All Passed |
| `tests/integration/`     | Config + codegen + SSR workflow; `view.config.ts`; rich routes; async/stream SSR; compiler+SSR path; optional dweb import smoke | ✅ All Passed |
| `ssr-bootstrap` / `ssr-complete` | Minimal DOM SSR + full SSR → hydrate reactivity                     | ✅ All Passed |
| `e2e/`                   | Browser automation (**21** interaction scenarios on examples site)        | ✅ All Passed |

## Key Adaptations & Fixes

### 1. Bun Runtime Compatibility

- **Microtask scheduling**: Async tests use `waitUntilComplete` / controlled microtasks so transient states (e.g. Suspense loading) are observable on Bun.
- **JSX**: `jsx-runtime` exposes paths Bun expects for dev transforms where applicable.
- **Route metadata**: Router codegen uses static text parsing for `metadata` / `routePath` / `inheritLayout` so scanning `.tsx` does not require a JSX-capable dynamic `import()` in Bun.

### 2. Reactivity & Resource/Suspense

- **Resource + ErrorBoundary**: After boundary reset, resources re-bind to Suspense boundaries so fallbacks and refetch behave correctly (covered by dedicated async tests).
- **Super signals**: Tuple, `.value`, and call styles are covered under `signal.test.ts`.

### 3. E2E (`tests/e2e/examples-e2e.test.ts`)

- Home, Gallery, Signal, Performance, Form, Store, Boundary, Context, Control-flow, Resource, Portal, Transition, Runtime SSR snippet, Router, Route-guard, nested layouts, 404.
- HMR state preservation and CSR vs SSR fragment consistency are exercised through the examples dev server.

## Conclusion

@dreamer/view **2.0.0** is validated by the current automated suite on **Deno** and **Bun** with **no failing cases**. Core reactivity, compiler output, SSR/hydration, integrations, CLI-adjacent server utilities, and browser E2E are included in this report’s scope.
