# P0 baseline: bundle size & performance (non-breaking)

Canonical Chinese report: [`../zh-CN/P0-基线-体积与性能.md`](../zh-CN/P0-基线-体积与性能.md).

| Item | Value |
|------|-------|
| Package | `@dreamer/view` v2.2.0 (`dev`) |
| Date | 2026-11-03 (Asia/Shanghai) |
| Reproduce size | `deno task size:baseline` / `node scripts/size-baseline/measure.mjs --write` |
| Reproduce bench | `deno task bench` |
| Snapshot JSON | `scripts/size-baseline/bundle-size-baseline.json` |

## Size table (esbuild 0.27.7, view source only)

| entry | raw | minify | gzip(min) | #src |
|-------|----:|-------:|----------:|-----:|
| `@dreamer/view` | 98.81 KiB | 43.51 KiB | 15.36 KiB | 33 |
| `@dreamer/view/reactivity` | 24.00 KiB | 10.46 KiB | 3.85 KiB | 13 |
| `@dreamer/view/csr` | 70.06 KiB | 30.04 KiB | 10.62 KiB | 28 |
| `@dreamer/view/ssr` | 93.47 KiB | 44.45 KiB | 14.55 KiB | 25 |
| `@dreamer/view/router` | 57.39 KiB | 25.97 KiB | 9.20 KiB | 24 |
| `@dreamer/view/form` | 13.63 KiB | 5.88 KiB | 2.45 KiB | 8 |
| `@dreamer/view/resource` | 13.94 KiB | 6.05 KiB | 2.36 KiB | 12 |

## Recommended next 2.x non-breaking step (one)

**Docs-first: make subpath imports the default in all examples; keep the main entry as a “convenience barrel” section only.**

Evidence: main minify ≈ 4.2× `reactivity`. Subpaths already exist since 2.1.0 — this is documentation / consumer migration, not a new API. No reactive-core change, no JSR publish in this knife.

## Tests

`deno task test` → **394 passed / 0 failed** (after this change set).
