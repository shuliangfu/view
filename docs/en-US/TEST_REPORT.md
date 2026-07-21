# @dreamer/view Test Report

[中文](../zh-CN/TEST_REPORT.md) | English

## 1. Overview

| Item            | Details                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| Package         | `@dreamer/view`                                                          |
| Version         | **2.0.6** (aligned with `deno.json` / `package.json`)                    |
| Test framework  | `@dreamer/test` ^1.1.10                                                  |
| Report date     | **2026-07-22**                                                           |
| DOM environment | Unit/integration: happy-dom **20.4.0**; E2E: Chromium (Playwright, etc.) |
| Commands        | See “How to run” below                                                   |

### 1.1 Suite size (current tree)

| Layer                  | Path                          | Files                                         |
| ---------------------- | ----------------------------- | --------------------------------------------- |
| Unit                   | `tests/unit/**`               | **~62** `*.test.ts` / `*.test.tsx`            |
| Integration            | `tests/integration/**`        | **6** modules                                 |
| E2E                    | `tests/e2e/**`                | **1** module (multi-scenario examples)        |
| Benchmarks             | `tests/bench/**`              | **2** `*.bench.ts` (not counted in pass/fail) |
| **Test modules total** | `*.test.ts(x)` under `tests/` | **~69**                                       |

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

# Bun (happy-dom via bunfig.toml preload; primary path)
bun test tests/unit tests/integration
# equivalent if bunfig missing: bun test --preload ./tests/unit/dom-setup.ts …

# SSR pseudo-DOM suite
bun test tests/unit/runtime/ssr-dom-element-api.test.ts
```

| Note               | Detail                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| DOM setup order    | Some suites need `dom-setup`; **do not** cache `typeof Node` at module top level (happy-dom may load after import) |
| Deno vs Bun counts | Runners count `it`/hooks differently; treat **0 failures** as the invariant                                        |
| SSR                | Minimal SSR DOM is installed when no browser `document`; see `ssr-bootstrap` and `ssr-dom-element-api`             |

---

## 3. Latest results (this report)

> Re-run on **2026-07-10** (Apple Silicon class machine; duration varies).\
> **Counts differ by command scope — not missing tests:**

| Scope                              | Meaning                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `tests/unit` + `tests/integration` | Default `deno task test`; **no** E2E                                     |
| `tests/`                           | Default `package.json` `bun test … tests/`; unit + integration + **e2e** |

### 3.1 Deno

| Scope                                     | Passed  | Failed | Duration         | Command                                     |
| ----------------------------------------- | ------- | ------ | ---------------- | ------------------------------------------- |
| **unit + integration** (`deno task test`) | **377** | **0**  | ~**28–29s**      | `deno test -A tests/unit tests/integration` |
| **full `tests/`** (includes e2e)          | **398** | **0**  | ~**1m11s–1m13s** | `deno test -A tests/`                       |

Note: full suite has ~**21** more cases than unit+integration, mostly from
`tests/e2e/examples-e2e.test.ts`.

### 3.2 Bun

| Scope                                        | Passed  | Failed | Files  | Duration | Command                                                                     |
| -------------------------------------------- | ------- | ------ | ------ | -------- | --------------------------------------------------------------------------- |
| **unit + integration**                       | **311** | **0**  | 67     | ~**5s**  | `bun test --preload ./tests/unit/dom-setup.ts tests/unit tests/integration` |
| **full `tests/`** (`npm`/`bun test` default) | **331** | **0**  | **68** | ~**48s** | `bun test --preload ./tests/unit/dom-setup.ts tests/`                       |

Note: full suite has ~**20** more cases (+1 file → 68 files), mostly e2e.

### 3.3 Matching local output

If you see:

```text
331 pass / 0 fail / 68 files / ~48s   # Bun
ok | 398 passed | 0 failed (~1m13s)   # Deno
```

that matches the **full `tests/`** rows above — **correct**.\
Earlier reports listing only 377 / 311 referred to **unit+integration without
e2e**.

### 3.4 SSR pseudo-DOM suite (`ssr-dom-element-api`)

| Metric    | Value                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Cases** | **18**                                                                                                                     |
| **Deno**  | 18 passed / 0 failed                                                                                                       |
| **Bun**   | 18 passed / 0 failed                                                                                                       |
| **Scope** | hasAttribute, classList, matches/query, node graph, reflected props, document head/body, renderToString null props (2.0.5) |

### 3.5 E2E

- Module: `tests/e2e/examples-e2e.test.ts` (included when running full `tests/`)
- Multi-page examples flows (Signal, Form, Store, Router, Boundary,
  layouts, 404)
- **Standalone:** `deno task test:e2e`; **not** in default `deno task test`

### 3.6 Benchmarks

- `tests/bench/signal.bench.ts`: signal writes, same-value skip, batch +
  multi-effect.
- `deno task bench` is for performance observation; **not** a red/green CI gate
  unless configured separately.

---

## 4. Coverage by area

### 4.1 Unit tests `tests/unit/`

| Area                             | Highlights                                                                                                                                                                                                                                                                       | Status |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **reactivity/**                  | Signal (`.value` / tuple / call), Effect, Memo, Owner/`cleanNode`, Store (`Object.is`), Selector, Context, lifecycle, errors, cycles, createDeferred / useTransition                                                                                                             | ✅     |
| **runtime/**                     | `insert`, array anchors, details, props/setProperty, **controlled value focus stability**, IME composition, event delegation, `Show`/`For`/`Index`/`Switch`, keyed lists (no span shell), Suspense, Portal, Hydration, HMR, template/walk, mount, stress, **SSR pseudo-DOM API** | ✅     |
| **compiler/**                    | Static lifting, transformer (template/walk path constants, fewer Effects), directive, path-gen, SSR mode, HMR inject                                                                                                                                                             | ✅     |
| **integrations/**                | Form validation/handleSubmit, Resource + Suspense/ErrorBoundary, **full Router**, **Router SSR** (`matchRoute` / `renderRouterToString`)                                                                                                                                         | ✅     |
| **scheduler/**                   | batch microtask coalescing, priority queues                                                                                                                                                                                                                                      | ✅     |
| **server/**                      | view.config, layout chain, routers codegen, createApp smoke, semver utils                                                                                                                                                                                                        | ✅     |
| **utils/**                       | `escapeForText` / Attr / AttrHtml fast paths                                                                                                                                                                                                                                     | ✅     |
| **ssr-bootstrap / ssr-complete** | SSR without preinstalled document; SSR → hydrate reactivity                                                                                                                                                                                                                      | ✅     |
| **ssr-dom-element-api**          | **2.0.5**: hasAttribute/toggle, style, classList, dataset, matches/closest/query, node graph, reflected props, document head/body, Fragment, renderToString                                                                                                                      | ✅     |
| **optimize / i18n**              | optimize plugin shape; locale / `$tr`                                                                                                                                                                                                                                            | ✅     |

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

## 5. Additions since the 2.0.0 / 2.0.4 reports

| Theme                     | Representative tests                                 | Notes                                                                                     |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Controlled input focus    | `runtime/props-advanced.test.ts`                     | Skip same `el.value`, **number vs DOM string**, **IME composition**, stable node identity |
| Keyed `For` without shell | `runtime/control-flow.test.ts`, `stress.test.ts`     | Comment anchors, reorder reuse, direct children                                           |
| Signal registry           | `reactivity/signal-optimization.test.ts`             | Anonymous signals off registry in prod; `VIEW_DEV` for HMR                                |
| Router SSR                | `integrations/router-ssr.test.ts`                    | `parseRouterUrl`, `matchRoute`, `renderRouterToString`                                    |
| Compiler fewer Effects    | `compiler/transformer.test.ts`, `analyzer.test.ts`   | Static ternary/template lift; walk `_path$N`                                              |
| Escape fast path          | `utils/escape.test.ts`                               | Zero-alloc when no special chars                                                          |
| **SSR pseudo-DOM suite**  | `runtime/ssr-dom-element-api.test.ts` (**18** cases) | **2.0.5**: Element/Document API + `renderToString` null props (dweb hybrid / Bun·Deno)    |
| Bench                     | `tests/bench/signal.bench.ts`                        | Optional performance baseline                                                             |

---

## 6. Runtime notes

### 6.1 Deno vs Bun

- Async tests often use **`waitUntilComplete`** / microtasks so Suspense and
  navigation mid-states are assertable.
- Router codegen uses **static source parsing** for metadata / routePath /
  inheritLayout to avoid JSX-dependent dynamic `import()` on Bun.
- See `docs/en-US/BUN_COMPAT.md` for SSR-without-`document` and happy-dom scope.

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
- From **2.0.5**, the minimal SSR DOM aligns with common Element/Document APIs
  (`hasAttribute`, `classList`, `querySelector`, etc.) to avoid dweb hybrid
  crashes on Deno/Bun.

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
| SSR selectors                            | Pseudo-DOM uses a **simple** CSS subset, not a full browser engine       |

---

## 8. Conclusion

**@dreamer/view 2.0.6** (all **0 failures** on the primary gate):

| Runtime | Scope                                            | Result                    |
| ------- | ------------------------------------------------ | ------------------------- |
| Deno    | unit + integration (`deno task test`)            | **384 passed / 0 failed** |
| Bun     | unit + integration (`bun test` + bunfig preload) | **317 passed / 0 failed** |

- Covers core reactivity, runtime DOM, **controlled-form focus**, **props/URL
  security**, keyed **`For` LIS reorder**, compiler static lifting,
  SSR/hydration, **SSR pseudo-DOM API**, router, forms, scheduler, and
  integration
- **2.0.6** adds security + list-reorder + escape/compiler tests; counts rose vs
  2.0.5 unit+integration (was ~377 / ~311)
- Full `tests/` (with e2e) is optional; compare apples-to-apples when citing
  totals
