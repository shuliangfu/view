# Bundle size baseline & CI gate

## Reproduce measure

```bash
# from repo root — refresh committed baseline JSON
node scripts/size-baseline/measure.mjs --write
# or
deno task size:baseline
```

- **Tool:** esbuild (resolved from this repo’s `node_modules`, currently 0.27.x)
- **Method:** bundle each `entry-*.ts` as ESM (`platform: neutral`), tree-shake on,
  mark `@dreamer/*` / `happy-dom` / `typescript` external so the byte count is
  **view source only**. Report raw / minify / gzip(min, zlib level 9).
- **Output:** stdout table; with `--write` also
  `scripts/size-baseline/bundle-size-baseline.json` (committed gate baseline)

## CI / preflight gate

```bash
node scripts/size-baseline/check.mjs
# or
deno task size:check
```

**Budget (default):** each entry’s **minify** and **gzip(min)** must stay within
**+5%** of the committed baseline bytes (`Math.ceil(baseline * 1.05)`). Any
entry over either limit → **exit 1**.

Override: `--budget-pct 5` or env `SIZE_BUDGET_PCT=5`.

Intentional growth: re-run `deno task size:baseline`, commit the updated
`bundle-size-baseline.json`, and note why in CHANGELOG.

This gate does **not** change runtime behavior; it only measures and compares.

## Entries covered

| stub | export |
|------|--------|
| `entry-main.ts` | `@dreamer/view` |
| `entry-reactivity.ts` | `@dreamer/view/reactivity` |
| `entry-csr.ts` | `@dreamer/view/csr` |
| `entry-ssr.ts` | `@dreamer/view/ssr` |
| `entry-router.ts` | `@dreamer/view/router` |
| `entry-form.ts` | `@dreamer/view/form` |
| `entry-resource.ts` | `@dreamer/view/resource` |

## Effect / DOM op counts (not in core)

Do **not** change the reactive core for counters. Options:

1. **Chrome Performance** on a real page (ui-view docs / dweb-admin): record
   update; count scripting vs rendering; compare before/after a change.
2. **App-level wrappers** in a local script only — wrap `createEffect` /
   `insert` at the call site for a one-off probe (never commit into `src/`).
3. Future **optional** debug export (additive, off by default) would need a
   separate approved knife — out of P0 baseline scope.

## Related

Bench / profiling CI: `scripts/bench-baseline/` and `docs/zh-CN/P0-1-profiling-and-bench-ci.md`.
