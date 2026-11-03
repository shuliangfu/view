# P0-1: Real-page profiling notes + benches in CI

| Item | Value |
|------|-------|
| Target | `@dreamer/view` **v2.2.0**, branch `dev` |
| Date | **2026-11-03** (Asia/Shanghai) |
| Nature | **Docs + measurement gate**: no runtime default-semantics change; **no probes in `src/` hot paths**; no JSR / npm |
| Pairing | Bundle-size gate already exists (`deno task size:check`); this knife adds **bench / profiling** |

---

## 1. Micro-bench coverage (CI)

| File | Covers |
|------|--------|
| `tests/bench/signal.bench.ts` | Signal writes / same-value skip, **Effect** ×N + `batch` |
| `tests/bench/for.bench.ts` | `For`+key create / reverse / field update (happy-dom) |
| `tests/bench/insert.bench.ts` | `insert` static text / Signal thunk updates / array children |

Commands:

```bash
deno task bench                 # human-readable
deno task bench:baseline        # write scripts/bench-baseline/bench-baseline.json
deno task bench:check           # vs baseline avgNs (default ≤ +100%)
```

CI: ubuntu job `bench-check` with `BENCH_BUDGET_PCT=300` (Actions hosts ≠
reference CPU; still catches order-of-magnitude regressions). Local default
+100%. `--smoke` / `BENCH_SMOKE=1` only requires benches to complete.

---

## 2. Real-page profiling (how to capture)

**Do not** add Effect / DOM counters to `src/` by default. Preferred order:

### 2.1 Chrome Performance (preferred)

1. Open a real page:
   - **ui-view docs site** (lists / forms / route changes), or
   - **dweb-admin** data panels (refresh, filter, table redraw).
2. DevTools → **Performance** → record one list update / route change / form submit.
3. Compare **Scripting** vs **Rendering / Painting**; note long tasks and style recalc.
4. Capture before/after a change; keep screenshots in local `analysis/` notes (binaries need not be committed).

### 2.2 One-off local probe (optional)

```bash
deno run -A scripts/profiling/local-probe-example.ts
```

App-level wrappers around `createEffect` / `insert` are fine for a session;
delete afterward — **never** land them on default `src/` paths.

### 2.3 Relation to micro-benches

| Tool | Answers |
|------|---------|
| `deno task bench` / CI gate | Did a hot path regress by an order of magnitude? |
| Chrome Performance | Is the real page bound by script, layout, or network? |
| Local probe | Did Effect / insert call counts explode after a change? |

Complementary. **Do not rewrite the reactive core from µs bench noise alone.**

---

## 3. Non-goals (this knife)

- No reactive default / scheduler / `insert` semantics changes
- No virtual lists, time slicing, or compiler default-semantics changes
- No JSR / npm publish
