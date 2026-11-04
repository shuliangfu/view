# Consumer / examples bundle analyze & gate

Independent of `scripts/size-baseline/` (library entry `size:check`). This
folder measures **how a consumer imports** `@dreamer/view` — named vs star /
namespace, barrel vs subpath — and gates fixture sizes at **+5%**.

It does **not** relax `bundle-size-baseline.json`.

## Reproduce

```bash
node scripts/consumer-bundle/measure.mjs --write
# or
deno task consumer:bundle:baseline

node scripts/consumer-bundle/check.mjs
# or
deno task consumer:bundle:check
```

- **Tool:** esbuild (repo `node_modules`, 0.27.x)
- **Method:** ESM bundle, `platform: neutral`, tree-shake on; mark other
  `@dreamer/*` / tooling packages external so bytes are **view `src/`** pulled
  by each fixture’s import graph. gzip = zlib level 9 of minify.
- **Baseline JSON:** `scripts/consumer-bundle/consumer-bundle-baseline.json`

## What the numbers mean

| Pattern                                                                              | Typical result (esbuild + `sideEffects: false`)                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Named imports from `@dreamer/view` vs same names from `/reactivity` `/csr` `/router` | **Δ ≈ 0** — modern bundlers shake the barrel                    |
| `export *` from convenience barrel vs `export *` from `/reactivity`                  | **Large premium** (~4.3× minify in baseline) — real 全家桶 cost |
| `examples/src/main.tsx` style (`/router` only)                                       | Matches `examples-main-subpath` / `subpath-router-api`          |

Prefer **subpath imports** in apps and examples anyway: smaller module graphs
for tooling, clearer intent, and protection when a bundler or local `export *`
wrapper defeats shaking. See docs:

- `docs/zh-CN/P0-2-consumer-bundle-analyze.md`
- `docs/en-US/P0-2-consumer-bundle-analyze.md`

## CI

Job `consumer-bundle-check` runs `node scripts/consumer-bundle/check.mjs`
(ubuntu). Override budget: `--budget-pct` or `CONSUMER_BUNDLE_BUDGET_PCT`.
