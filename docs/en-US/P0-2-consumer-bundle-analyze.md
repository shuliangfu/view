# P0-2: Consumer / examples bundle analyze + size budget

| Item | Value |
|------|-------|
| Package | `@dreamer/view` **v2.2.0** (`dev`) |
| Nature | **Measure / gate only** — scripts + JSON + docs; **no** runtime semantics, export, or JSR/npm change |
| Tool | esbuild **0.27.7** (same family as `size-baseline`) |
| Reproduce | `deno task consumer:bundle:baseline` · `deno task consumer:bundle:check` |
| Artifacts | `scripts/consumer-bundle/` · `consumer-bundle-baseline.json` |
| vs existing gate | **Independent** of `deno task size:check`; does **not** relax `bundle-size-baseline.json` +5% |

Canonical Chinese report: [`../zh-CN/P0-2-consumer-bundle-analyze.md`](../zh-CN/P0-2-consumer-bundle-analyze.md).

## What we measure

`scripts/size-baseline/` gates **library entries** (`export *`). This knife adds
**consumer import style**:

1. **Named imports** from the convenience barrel vs the same names from
   `/reactivity`, `/csr`, `/router`, …
2. **Star re-export / namespace** (`export * from "@dreamer/view"`,
   `import * as View`) — the real barrel / 全家桶 cost.
3. **examples main** — mirrors `examples/src/main.tsx` (`@dreamer/view/router`).
4. **examples API union** — named imports used across example pages
   (barrel vs subpath counterfactual).

Fixtures live under `scripts/consumer-bundle/fixtures/`.

## Headline numbers (baseline snapshot)

Exact bytes: committed `consumer-bundle-baseline.json`.

### Named imports (esbuild + `sideEffects: false`)

Barrel vs matching subpath minify deltas are **≈ 0** for reactivity / CSR /
router / kitchen-sink / examples-surface fixtures. Prefer subpaths anyway for
smaller module graphs and weaker bundlers.

### Star re-export (real barrel premium)

| fixture | minify | gzip(min) |
|---------|-------:|----------:|
| `barrel-star-reexport` | **~44.57 KiB** | **~15.76 KiB** |
| `subpath-star-reactivity` | ~10.46 KiB | ~3.85 KiB |
| `subpath-star-csr` | ~30.63 KiB | ~10.85 KiB |

Premium vs reactivity-only star: about **+34.1 KiB minify (~4.26×)** /
**+11.9 KiB gzip**. Same order of magnitude as the library `@dreamer/view` row
in `size-baseline` (that gate is unchanged).

### examples main

`examples-main-subpath` ≈ **25.85 KiB** minify (view src for `/router` entry
imports). examples already use subpaths; this knife does not change examples
product code.

## Gate

```bash
deno task consumer:bundle:check
# CI: consumer-bundle-check (ubuntu)
```

Default budget: each fixture **minify** and **gzip(min)** ≤ baseline **+5%**.
Override: `--budget-pct` or `CONSUMER_BUNDLE_BUDGET_PCT`.

## Guidance

Keep app / examples on **subpaths**. Avoid app-local `export *` from the main
barrel. Library entry size stays on `size:check`; consumer import style uses
this gate.

## Related

- Main-entry deprecation preview (Strategy A): [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md)
- ZH canonical: [`../zh-CN/P0-2-consumer-bundle-analyze.md`](../zh-CN/P0-2-consumer-bundle-analyze.md)
