# Bench baseline & CI gate

Complements the **bundle size** gate (`scripts/size-baseline/`). Covers
`tests/bench/signal.bench.ts` (Signal / Effect), `for.bench.ts` (For+key),
and `insert.bench.ts` (insert DOM paths).

## Reproduce / refresh baseline

```bash
# from repo root — refresh committed JSON (reference machine)
node scripts/bench-baseline/measure.mjs --write
# or
deno task bench:baseline
```

- **Tool:** `deno bench -A --json tests/bench/`
- **Metric gated:** each bench’s **avg** nanoseconds
- **Output:** `scripts/bench-baseline/bench-baseline.json` (committed)

## CI / preflight gate

```bash
node scripts/bench-baseline/check.mjs
# or
deno task bench:check
```

**Budget (default):** each bench’s **avgNs** must stay within **+100%** of the
committed baseline (`Math.ceil(baseline * 2)`). Over limit → **exit 1**.

CI runners are slower / noisier than the reference CPU; the workflow sets
`BENCH_BUDGET_PCT=300` to catch catastrophic regressions without flake.
Override locally: `--budget-pct 100` or `BENCH_BUDGET_PCT=…`.

Smoke-only (run benches, no timing compare): `--smoke` or `BENCH_SMOKE=1`.

This gate does **not** change runtime behavior and does **not** put probes in
`src/`.

## Real-page profiling

See `docs/zh-CN/P0-1-profiling-and-bench-ci.md` /
`docs/en-US/P0-1-profiling-and-bench-ci.md` and
`scripts/profiling/local-probe-example.ts` (optional local wrapper — never
commit probes into `src/` hot paths).
