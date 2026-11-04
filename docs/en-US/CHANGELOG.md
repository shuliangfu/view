# Changelog

All notable changes to @dreamer/view are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed

- **P1-4: Router split (match / history / Link) + SSR isomorphism (non-breaking)**
  - Source boundaries: `src/integrations/router/{types,match,history,link}.ts`;
    `src/integrations/router.ts` remains the barrel; public API / behavior unchanged.
  - SSR: tests lock `matchRoute` ↔ `createRouter({ ssr: true }).match` (splat / notFound),
    explicit `start()` on SSR instances, and `renderRouterToString` agreeing on pattern;
    docs [`P1-4-router-split-ssr.md`](./P1-4-router-split-ssr.md) /
    [`../zh-CN/P1-4-router-split-ssr.md`](../zh-CN/P1-4-router-split-ssr.md).
  - No JSR / npm; does **not** relax `size:check` / `consumer:bundle:check` / E2E assertions.

### Changed

- **P0-hotfix: gallery E2E zoom click vs scaled preview (CI)**
  - Root cause: after clicking `＋`, Playwright hit-testing treated the transformed
    preview (`cursor-grab` / img) as intercepting `－` on ubuntu CI viewports
    (`subtree intercepts pointer events`, 60s). Local often passed.
  - Fix: examples gallery controls `relative z-10` + column `overflow-hidden`;
    E2E clicks `－` then `＋` (still exercises both; asserts % leaves/returns 100),
    scoped to the preview layer. **No** assertion relaxation; no JSR / npm.

- **P0-hotfix: pin `e2e-examples` to ubuntu-24.04 (Playwright 1.59.1)**
  - CI failure: `ubuntu-latest` is **26.04**; `playwright@1.59.1 install --with-deps chromium`
    errors with `does not support chromium on ubuntu26.04-x64`. Pin job to **`ubuntu-24.04`**;
    drop `examples/` from deno cache (routers.tsx generated in E2E `beforeAll`).
  - Assertions unchanged; no JSR / npm.

- **P0: examples browser E2E into CI (non-breaking)**
  - Add ubuntu-24.04 workflow job `e2e-examples`: install Playwright Chromium
    `1.59.1` (`--with-deps`) and run `deno task test:e2e`. Failure fails the
    workflow. Assertions are **not** relaxed (including form `agree`).
  - Keep the 9-job Deno / Bun / Node × OS **unit + integration** matrix
    browser-free; comments document why E2E is not folded into Windows /
    browser-less runners.
  - Docs: [`P0-e2e-into-ci.md`](./P0-e2e-into-ci.md) /
    [`../zh-CN/P0-e2e-into-ci.md`](../zh-CN/P0-e2e-into-ci.md); README /
    TEST_REPORT clarify local `deno task test:e2e` /
    `deno test -A tests` vs CI.
  - No JSR / npm; does **not** relax `size:check` / `consumer:bundle:check`.


### Documentation

- **P1-2: hydration quality opt-in pilot (`mismatchMode` · 2.x additive, non-breaking)**
  - Add [`P1-2-hydration-opt-in-pilot.md`](./P1-2-hydration-opt-in-pilot.md) /
    [`../zh-CN/P1-2-hydration-opt-in-pilot.md`](../zh-CN/P1-2-hydration-opt-in-pilot.md):
    document `continue` / `assert` / `remount` and recommended usage; note progressive /
    chunked hydration hooks are **not** shipped yet.
  - `/csr` additively exports `HydrationMismatchMode` and `resolveMismatchMode` (main
    entry already `export *` hydration); unit tests lock default **`continue`**;
    examples `/runtime` demos all three modes.
  - Does **not** change the production default (`continue`); no JSR / npm; does **not**
    relax `size:check` / `consumer:bundle:check` / E2E assertions.


### Fixed

- **P0-hotfix: examples form E2E `page.evaluate` host timeout (non-breaking)**
  - Root cause: `/form` demo `createForm` rules require `agree`; the E2E clicked Submit
    without checking it, so `handleSubmit` never ran onValid and 「提交成功」 never appeared.
    `t.browser.waitFor` uses a host race equal to Playwright `waitForFunction` timeout, so a
    never-true predicate often surfaces as `page.evaluate` host timeout (not a blocked app
    main thread / hard CDP hang).
  - Fix: check 「我已阅读并同意服务条款」 before submit; wait for the 「提交成功」 heading via
    Playwright locator; after reset assert username returns to initial `dreamer`. Assertions
    are **not** relaxed; E2E is **not** added to the CI matrix in this change.
  - No JSR / npm.

### Fixed

- **P0-hotfix: examples import of `batch` from `/reactivity` failed (non-breaking)**
  - Root cause: `batch` lives in `scheduler/batch` and was exported from the main entry,
    `/scheduler`, and `/csr`, but **not** re-exported from `src/reactivity/mod.ts`, while
    README §7.4 and `examples/.../signal` import it from `@dreamer/view/reactivity` →
    `deno task dev` failed with `No matching export ... "batch"`.
  - Fix: convenience **re-export** of `batch` from `/reactivity` (canonical entry remains
    `/scheduler`); README (root / zh / en) subpath table notes the re-export.
  - **No** runtime semantics change; no JSR / npm; does **not** relax `size:check` /
    `consumer:bundle:check`.

### Documentation

- **P1-1: main-entry barrel deprecation preview (Strategy A · 2.x additive, non-breaking)**
  - Add [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md) /
    [`../zh-CN/P1-1-main-entry-deprecation-preview.md`](../zh-CN/P1-1-main-entry-deprecation-preview.md):
    prefer subpaths, migration steps, link to P0 / P0-2 size numbers; **no** export
    removals; **no** runtime default changes.
  - Module-level JSDoc `@deprecated` on `src/mod.ts` (**no** runtime `warn` / side effect).
  - README (root / zh / en) convenience-barrel + architecture sections mark the preview
    and cross-link; analysis indexes updated.
  - Does **not** relax `size:check` / `consumer:bundle:check` baselines; no JSR / npm;
    **not** a 3.0 slim-barrel landing.

### Added

- **P0-2: consumer / examples bundle analyze + independent size budget (non-breaking)**
  - Add `scripts/consumer-bundle/`: fixtures for named imports, `export *` / namespace,
    examples main mirror and API union; `measure.mjs --write` →
    `consumer-bundle-baseline.json`; `check.mjs` / `deno task consumer:bundle:check`
    default **+5%**; CI ubuntu `consumer-bundle-check`.
  - Headline (esbuild): named barrel vs subpath minify **Δ≈0**; star-reexport barrel vs
    `/reactivity` ≈ **+34 KiB minify (~4.26×)** / **+12 KiB gzip**.
  - Docs: [`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md) /
    [`../zh-CN/P0-2-consumer-bundle-analyze.md`](../zh-CN/P0-2-consumer-bundle-analyze.md).
  - Does **not** relax existing `size:check` / `bundle-size-baseline.json`; **no**
    runtime semantics change; no JSR / npm.


### Documentation

- **P0-4: component author guide (Memo / ref / subscription boundaries, non-breaking)**
  - Add [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) /
    [`../zh-CN/P0-4-component-author-guide.md`](../zh-CN/P0-4-component-author-guide.md):
    setup-once mental model, **no top-level Signal reads that replace the whole tree**,
    when to use Memo (not as a stable store), transient `ref(null)` + `isConnected`,
    Effect subscription boundaries, Context must not pass a bare function `value`,
    controlled props as Signal / getter; distilled from analysis P0-4 and ui-view notes.
  - Cross-linked from README §22 / §25; **no** runtime semantics change; no JSR / npm.

### Fixed

- **CI: clear Node 20 action deprecation warnings on Node 24 runners**
  - Bump `actions/checkout@v4` → `@v5` and `actions/setup-node@v4` → `@v5`
    (both `runs.using: node24`).
  - Drop workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (no longer needed).
  - Product test matrix stays on Node **22**; no JSR / npm publish.

### Added

- **P0-3: compiler static-subtree coverage baseline + goldens (non-breaking)**
  - `scripts/compiler-coverage/`: 19 JSX fixtures; `measure.ts --write` →
    `compiler-coverage-baseline.json` + `goldens/*.out.txt`;
    `check.ts` / `deno task compiler:coverage:check` exact-match metrics and golden text.
  - Metrics (compile body): `template` / `walk` / `insert` / `setAttribute` /
    `setProperty` / `spread` / `memo` / paths; `staticDomOpFreeRatio` baseline ≈
    **0.5789** (11/19).
  - Unit test `tests/unit/compiler/golden.test.ts`; CI ubuntu `compiler-coverage-check`.
  - Docs: [`P0-3-compiler-static-coverage-and-golden.md`](./P0-3-compiler-static-coverage-and-golden.md) /
    [`../zh-CN/P0-3-compiler-static-coverage-and-golden.md`](../zh-CN/P0-3-compiler-static-coverage-and-golden.md).
  - **No** default compile / runtime semantics change; no JSR / npm publish.

### Fixed

- **P0-3 CI: golden unit test cross Deno / Bun / Node**
  - `tests/unit/compiler/golden.test.ts` drops `jsr:@std/path` / `Deno.readTextFile`;
    uses `@dreamer/runtime-adapter` `dirname` / `fromFileUrl` / `join` / `readTextFile`,
    matching existing unit tests. Assertions and coverage metrics unchanged.


### Added

- **P0-1: real-page profiling notes + Signal / Effect / For / insert benches in CI (non-breaking)**
  - Add `tests/bench/insert.bench.ts` (static text / Signal thunk / array children);
    fold existing `signal.bench.ts` (incl. Effect) and `for.bench.ts` into the gate.
  - `scripts/bench-baseline/`: `measure.mjs --write` → `bench-baseline.json`;
    `check.mjs` / `deno task bench:check` enforces **avgNs ≤ baseline +100%**
    (overridable); CI ubuntu `bench-check` uses `BENCH_BUDGET_PCT=300` for
    order-of-magnitude regressions with less flake.
  - Docs: [`P0-1-profiling-and-bench-ci.md`](./P0-1-profiling-and-bench-ci.md) /
    [`../zh-CN/P0-1-profiling-and-bench-ci.md`](../zh-CN/P0-1-profiling-and-bench-ci.md);
    optional local probe `scripts/profiling/local-probe-example.ts` (**not** in
    `src/` hot paths).
  - **No** runtime default-semantics change; no JSR / npm publish.


### Documentation

- **Analysis docs governance (P1-6, docs-only)**
  - Commit current [`../zh-CN/view-framework-analysis.md`](../zh-CN/view-framework-analysis.md) (v2.2.0 / 2026-11-03).
  - Add [`analysis-doc-status.md`](./analysis-doc-status.md) / [`../zh-CN/分析文档状态.md`](../zh-CN/分析文档状态.md): mark local gitignored `analysis/` v1 / early-architecture notes as obsolete / drifted; point to current analysis + README.
  - Watermark matching local `analysis/` files; refresh [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md) links; Chinese / English README §25 entry points.
  - **No** runtime / export changes; no JSR / npm publish.


### Fixed

- **Size gate: slim `/form` entry (no budget loosen, no baseline bump)**
  - Keep Form `field(as)` / `messageFromSafeParse` glue; tighten `field` (shared `onChange`, omit default `"text"` literal, etc.) so `@dreamer/view/form` minify / gzip stay within baseline **+5%**.
  - Did **not** raise the `size:check` budget, disable the CI job, or refresh `bundle-size-baseline.json`; no JSR / npm publish.

### Added


- **Form checkbox / select / schema bridge (2.x additive)**
  - `field(name, { as? })`: optional `checkbox` / `select` / `textarea` / `number`;
    omit second arg for legacy text bindings.
  - Export `messageFromSafeParse` to map Zod-like `safeParse` results into `rules`
    messages (no schema runtime dependency).
  - Example `examples/src/views/form` covers checkbox / select / schema bridge;
    Chinese / English README §16 updated.
  - Unit tests for checkbox / select / `messageFromSafeParse`. **No** JSR / npm
    publish.

### Added

- **Bundle-size CI gate (2.x non-breaking)**
  - `scripts/size-baseline/check.mjs` + `deno task size:check`: compare a fresh
    measure to the committed `bundle-size-baseline.json`; each entry’s
    **minify / gzip(min)** must stay within **+5%** of baseline (`Math.ceil`);
    over limit → non-zero exit (CI / local preflight).
  - Override via `--budget-pct` or `SIZE_BUDGET_PCT`; intentional growth →
    `deno task size:baseline` and commit the refreshed JSON.
  - Baseline restamped to current sizes after Resource Abort (`b0c8786`).
  - CI: ubuntu `size-check` job. **No** runtime default behavior change; no
    JSR / npm publish.


### Added

- **Resource optional AbortSignal + inflight dedupe docs (2.x additive)**
  - Each `createResource` load passes `{ signal: AbortSignal }` as the fetcher’s
    second argument; source changes / `refetch` abort the previous load; optional
    third-arg `{ signal }` cancels on outer lifecycle (e.g. route leave). Omitting
    / ignoring `signal` keeps today’s default; abort does **not** set `error`.
  - Export `createInflightDedupe()` (share one in-flight Promise per key; **not**
    an HTTP cache).
  - Chinese / English README §11 updated; `resource-abort` unit tests added.

### Documentation

- **Docs-first subpath imports (2.x non-breaking)**
  - Chinese / English README getting-started examples now prefer
    `@dreamer/view/reactivity` / `/csr` / `/ssr` / `/router` / `/form` /
    `/resource` (and peers); the main entry is documented only as a
    **convenience barrel** with P0 size cost (minify ~43.5 KiB main vs
    ~10.5 KiB `/reactivity`).
  - Corrected outdated architecture note that claimed `/router` / `/csr` did
    not exist; synced `docs/en-US/README.md`.
  - In-repo `examples/` and `view-cli init` scaffolds switched to subpath
    imports; **no** runtime / export breaking changes.

### Added

- **P0 engineering baseline (bundle size / perf, non-breaking)**
  - `scripts/size-baseline/`: measure main entry vs subpaths
    (`reactivity` / `csr` / `ssr` / `router` / `form` / `resource`) raw / minify /
    gzip via this repo’s esbuild; run
    `node scripts/size-baseline/measure.mjs --write` or `deno task size:baseline`.
  - `scripts/size-baseline/bundle-size-baseline.json`, `docs/zh-CN/P0-bench-baseline.md`,
    `analysis/P0-基线-体积与性能.md` (gitignored working copy) / `docs/zh-CN/P0-基线-体积与性能.md` + `docs/en-US/P0-baseline-bundle-and-perf.md` (committed): reproducible numbers and the single
    recommended next 2.x non-breaking step (docs-first subpath imports).
  - `deno task size:baseline` / `bench:baseline` task entry points.

### Notes

- **No runtime / API behavior change**; no JSR / npm publish; reactive core
  untouched.
- Real-page Effect / DOM op counts: see the report’s “how to measure” section —
  this knife does not add counters to the core.

---

## [2.2.0] - 2026-07-23

### Added

- **Node.js 22+ compatibility** — `@dreamer/view` now runs on Deno 2.9+, Bun 1.3+,
  and Node.js 22+ with zero source changes to core runtime/compiler/reactivity.
  - `package.json`: `engines.node >= 22`, `test:node` script via tsx.
  - `test-node.mjs`: Node test runner — runs each file in the main process (no
    `--test` fork/IPC), avoiding the "Unable to deserialize cloned data" bug when
    tests write to stdout. E2E and Deno-only integration tests excluded.
  - `tsconfig.json`: Bundler module resolution + `dom` lib for cross-runtime type
    consistency.
  - CI: 9-job matrix (3 Deno v2.9 + 3 Bun + 3 Node 22, no Chromium).
- **CLI Node support**: `upgrade` command uses `npx jsr run` on Node; `update`
  command uses `npm update` on Node. `getRuntime()` no longer throws for Node.

### Changed

- **deno.json**: bumped all `@dreamer/*` deps to Node-compatible versions
  (runtime-adapter ^1.2.2, i18n ^1.1.2, console ^1.1.0, esbuild ^1.3.0, etc.);
  added `deno.ns` to `compilerOptions.lib` to retain `import.meta.main` when
  `nodeModulesDir: "auto"` loads `@types/node`; `minimumDependencyAge: "0"`.
- **publish.yml**: removed `deno check` gate (JSR publish uses `--no-check`
  internally); bumped Deno to v2.9.

### Tests

- **Deno** unit+integration **394** / **Bun** **326** / **Node.js 22** **65/65
  files** — 0 failed on all three runtimes.
- Excluded `tests/integration/dweb-import-ssr.test.ts` from Node CI (spawns a
  Deno subprocess dependent on the dweb project's `deno.json`).

---

## [2.1.0] - 2026-07-22

### Added

- **Optional subpaths** (tree-shake friendly; main barrel still re-exports
  everything):
  - `@dreamer/view/reactivity` — Signal / Effect / Memo / Owner / Store /
    Context
  - `@dreamer/view/scheduler` — `batch` / priority scheduler
  - `@dreamer/view/router` — `createRouter` / `Link` / …
  - `@dreamer/view/form` — `createForm`
  - `@dreamer/view/resource` — `createResource`
  - `@dreamer/view/control-flow` — `Show` / `For` / `Switch` / `ErrorBoundary` /
    …
  - `@dreamer/view/csr` — CSR bundle (signal + mount/hydrate + control-flow +
    Suspense; no SSR/router)
- **`HydrateOptions`** (3rd arg may still be a bindings array, or an options
  object — **backward compatible**):
  - `bindings` / `warnMismatch` / `onMismatch`
  - **`mismatchMode`**: `continue` (default) | `assert` | `remount`
  - `getHydrationMismatches()` for diagnostics
- **`package.json` `sideEffects: false`** for bundler tree-shaking.

### Changed

- **Compiler**: non-reactive component props no longer wrapped in `() => …`;
  static `&&` / `||` fold into templates.
- **Docs**: EN/ZH README subpath tables and recommended fine-grained imports.

### Tests

- Added `subpaths`, hydration assert/remount, compiler logical-and/or cases.
- **Deno** unit+integration **394** / **Bun** unit+integration **326**, 0
  failed.

### Notes

- **No breaking changes**: existing `import { … } from "@dreamer/view"` and
  `hydrate(fn, el, bindings[])` keep working.
- Removing main-barrel re-exports is a future **3.0** topic, not this release.

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
- Tree-shake subpaths shipped in **2.1.0**.

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
