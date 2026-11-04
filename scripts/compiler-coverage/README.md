# Compiler static-subtree coverage baseline & golden gate

Complements **bundle size** (`scripts/size-baseline/`) and **bench**
(`scripts/bench-baseline/`). Locks `compileSource()` output metrics and full
text for a fixed JSX corpus — **measurement only**, no compile-semantics change.

## Reproduce / refresh baseline + goldens

```bash
# from repo root
deno run -A scripts/compiler-coverage/measure.ts --write
# or
deno task compiler:coverage:baseline
```

- **Tool:** Deno + `compileSource` from `src/compiler/`
- **Corpus:** `scripts/compiler-coverage/corpus.ts` (28 fixtures)
- **Metrics:** call counts in compiled **body** (after injected imports):
  `template` / `walk` / `insert` / `setAttribute` / `setProperty` / `spread` /
  `memo` / `_path$` / `_tmpl$`, plus `zeroReactiveDomOps` and
  `staticDomOpFreeRatio`
- **Goldens:** `scripts/compiler-coverage/goldens/<id>.out.txt`
- **Baseline JSON:** `scripts/compiler-coverage/compiler-coverage-baseline.json`

## CI / preflight gate

```bash
deno run -A scripts/compiler-coverage/check.ts
# or
deno task compiler:coverage:check
```

**Budget:** exact match of per-fixture metrics, aggregate totals, and golden
text. Intentional compiler output changes → refresh with `--write` and commit
JSON + goldens (note why in CHANGELOG).

Unit tests: `tests/unit/compiler/golden.test.ts` (also asserts key static vs
reactive patterns).

## Related docs

- `docs/zh-CN/P0-3-compiler-static-coverage-and-golden.md`
- `docs/en-US/P0-3-compiler-static-coverage-and-golden.md`
