# @dreamer/view Test Report

[中文](../zh-CN/TEST_REPORT.md) | English

## 1. Overview

| Item            | Details                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| Package         | `@dreamer/view`                                                          |
| Version         | **2.0.4** (aligned with `deno.json` / `package.json`)                    |
| Test framework  | `@dreamer/test` ^1.1.8                                                   |
| Report date     | **2026-07-10**                                                           |
| DOM environment | Unit/integration: happy-dom **20.4.0**; E2E: Chromium (Playwright, etc.) |
| Commands        | See “How to run” below                                                   |

### 1.1 Suite size (current tree)

| Layer                  | Path                          | Approx. files                                 |
| ---------------------- | ----------------------------- | --------------------------------------------- |
| Unit                   | `tests/unit/**`               | **~60** `*.test.ts` / `*.test.tsx`            |
| Integration            | `tests/integration/**`        | **6** modules                                 |
| E2E                    | `tests/e2e/**`                | **1** module (multi-scenario examples)        |
| Benchmarks             | `tests/bench/**`              | **1** `*.bench.ts` (not counted in pass/fail) |
| **Test modules total** | `*.test.ts(x)` under `tests/` | **67**                                        |

---

## 2. How to run

From the **view package root**:

```bash
# Unit + integration (daily / primary CI path)
deno task test
# equivalent: deno test -A tests/unit tests/integration

# Integration only
deno task test:integration

# Browser E2E (requires examples env / browser deps)
deno task test:e2e

# Benchmarks (not pass/fail gates)
deno task bench

# Bun (preload happy-dom)
bun test --preload ./tests/unit/dom-setup.ts tests/
```

| Note               | Detail                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| DOM setup order    | Some suites need `dom-setup`; **do not** cache `typeof Node` at module top level (happy-dom may load after import) |
| Deno vs Bun counts | Runners count `it`/hooks differently; treat **0 failures** as the invariant                                        |
| SSR                | Minimal SSR DOM is installed when no browser `document`; see `ssr-bootstrap` and `runtime/server`                  |

---

## 3. Latest results (this report)

### 3.1 Deno: `tests/unit` + `tests/integration`

| Metric        | Value                                        |
| ------------- | -------------------------------------------- |
| **Passed**    | **359**                                      |
| **Failed**    | **0**                                        |
| **Pass rate** | **100%**                                     |
| **Duration**  | ~**27s** (typical laptop; machine-dependent) |
| **Command**   | `deno test -A tests/unit tests/integration`  |

### 3.2 Bun

- Historical baseline on the same tree: **0 failures**; case counts are often
  **lower** than Deno (reporting differences).
- Re-run before release: `bun test --preload ./tests/unit/dom-setup.ts tests/`.

### 3.3 E2E

- Module: `tests/e2e/examples-e2e.test.ts`
- Exercises multi-page flows on the examples site (Signal, Form, Store, Router,
  Boundary, layouts, 404, ~**20+** scenarios).
- Needs a local browser and examples server; **not** included in default
  `deno task test`.

### 3.4 Benchmarks

- `tests/bench/signal.bench.ts`: signal writes, same-value skip, batch +
  multi-effect.
- `deno task bench` is for performance observation; **not** a red/green CI gate
  unless configured separately.

---

## 4. Coverage by area

### 4.1 Unit tests `tests/unit/`

| Area                             | Highlights                                                                                                                                                                                                                                                     | Status |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **reactivity/**                  | Signal (`.value` / tuple / call), Effect, Memo, Owner/`cleanNode`, Store (`Object.is`), Selector, Context, lifecycle, errors, cycles, createDeferred / useTransition                                                                                           | ✅     |
| **runtime/**                     | `insert`, array anchors, details, props/setProperty, **controlled value focus stability**, IME composition, event delegation, `Show`/`For`/`Index`/`Switch`, keyed lists (no span shell), Suspense, Portal, Hydration, HMR, template/walk, mount, stress lists | ✅     |
| **compiler/**                    | Static lifting, transformer (template/walk path constants, fewer Effects), directive, path-gen, SSR mode, HMR inject                                                                                                                                           | ✅     |
| **integrations/**                | Form validation/handleSubmit, Resource + Suspense/ErrorBoundary, **full Router**, **Router SSR** (`matchRoute` / `renderRouterToString`)                                                                                                                       | ✅     |
| **scheduler/**                   | batch microtask coalescing, priority queues                                                                                                                                                                                                                    | ✅     |
| **server/**                      | view.config, layout chain, routers codegen, createApp smoke, semver utils                                                                                                                                                                                      | ✅     |
| **utils/**                       | `escapeForText` / Attr / AttrHtml fast paths                                                                                                                                                                                                                   | ✅     |
| **ssr-bootstrap / ssr-complete** | SSR without preinstalled document; SSR → hydrate reactivity                                                                                                                                                                                                    | ✅     |
| **optimize / i18n**              | optimize plugin shape; locale / `$tr`                                                                                                                                                                                                                          | ✅     |

### 4.2 Integration `tests/integration/`

| Module              | Scope                                              | Status |
| ------------------- | -------------------------------------------------- | ------ |
| `view-workflow`     | config → route codegen → SSR                       | ✅     |
| `view-config-ts`    | dynamic `view.config.ts` load                      | ✅     |
| `view-routers-rich` | rich route table / metadata / 404                  | ✅     |
| `view-ssr-async`    | async / streaming SSR                              | ✅     |
| `view-compiler-ssr` | compiler output + renderToString                   | ✅     |
| `dweb-import-ssr`   | optional dweb-style import smoke (skip if missing) | ✅     |

### 4.3 E2E `tests/e2e/`

| Module         | Scope                         | Status                |
| -------------- | ----------------------------- | --------------------- |
| `examples-e2e` | examples dev server + browser | ✅ (separate command) |

---

## 5. Additions since the 2.0.0 report (optimization-related)

Automated coverage strengthened during the **2.0.4** cycle:

| Theme                     | Representative tests                               | Notes                                                                                     |
| ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Controlled input focus    | `runtime/props-advanced.test.ts`                   | Skip same `el.value`, **number vs DOM string**, **IME composition**, stable node identity |
| Keyed `For` without shell | `runtime/control-flow.test.ts`, `stress.test.ts`   | Comment anchors, reorder reuse, direct children                                           |
| Signal registry           | `reactivity/signal-optimization.test.ts`           | Anonymous signals off registry in prod; `VIEW_DEV` for HMR                                |
| Router SSR                | `integrations/router-ssr.test.ts`                  | `parseRouterUrl`, `matchRoute`, `renderRouterToString`                                    |
| Compiler fewer Effects    | `compiler/transformer.test.ts`, `analyzer.test.ts` | Static ternary/template lift; walk `_path$N`                                              |
| Escape fast path          | `utils/escape.test.ts`                             | Zero-alloc when no special chars                                                          |
| Bench                     | `tests/bench/signal.bench.ts`                      | Optional performance baseline                                                             |

---

## 6. Runtime notes

### 6.1 Deno vs Bun

- Async tests often use **`waitUntilComplete`** / microtasks so Suspense and
  navigation mid-states are assertable.
- Router codegen uses **static source parsing** for metadata / routePath /
  inheritLayout to avoid JSX-dependent dynamic `import()` on Bun.

### 6.2 Reactivity & Resource / Suspense

- After ErrorBoundary reset, resources must **re-register** with Suspense
  (dedicated tests).
- Super signals: tuple, `.value`, and call forms are covered in
  `signal.test.ts`.

### 6.3 Controlled inputs & focus (important)

- Framework `setProperty("value")`: string-normalized compare, skip writes
  during IME composition, best-effort selection restore when a write is
  required.
- App code that **remounts** the input via `Show`/`For` without stable structure
  will still drop focus—that is structural rebuild, not value writeback.

### 6.4 SSR

- `renderToString` / `renderRouterToString` install a temporary DOM in SSR
  scope; teardown uses `cleanNode` + scope leave to avoid leaking into later
  requests.

---

## 7. Known gaps (summary)

A longer historical list lives in `docs/测试覆盖缺口.md` (some path names still
reflect v1; trust the current `tests/` tree).

| Type                                     | Notes                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Large CLI surfaces                       | `cli/init` etc. mainly E2E/smoke; more pure-function unit tests possible |
| Hydration mismatch / progressive hydrate | Limited fine-grained recovery coverage                                   |
| Coverage thresholds                      | No mandatory `deno coverage` CI floor                                    |
| Bench as gate                            | Bench is optional; not a default CI fail                                 |

---

## 8. Conclusion

**@dreamer/view 2.0.4**, under the current primary automated suite:

- **Deno unit + integration: 359 passed / 0 failed (100%)**
- Covers core reactivity, runtime DOM, **controlled-form focus**, compiler,
  SSR/hydration, router (including **SSR isomorphism**), forms, scheduler,
  tooling, and integration flows
- E2E and bench are supplements: run E2E before release; use bench for
  performance observation

Refresh this report when `tests/` or release cadence changes; counts should
match the latest `deno test -A tests/unit tests/integration` on your machine.
