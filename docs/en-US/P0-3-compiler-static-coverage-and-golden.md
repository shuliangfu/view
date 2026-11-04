# P0-3: Compiler static-subtree coverage baseline + goldens

| Item | Value |
|------|-------|
| Target | `@dreamer/view` **v2.2.0**, branch `dev` |
| Date | **2026-11-04** (Asia/Shanghai) |
| Nature | **Docs + measurement / golden gate**: measure current `compileSource()` output only; **no default compile-semantics change**; no JSR / npm |
| Pairing | Bundle-size (`size:check`) and bench (`bench:check`) gates; this knife adds **compiler static-subtree coverage metrics + goldens** |

---

## 1. Metrics

Run `compileSource()` over a fixed JSX corpus
(`scripts/compiler-coverage/corpus.ts`, 26 fixtures). Count call sites in the
**body after injected imports**:

| Metric | Meaning |
|--------|---------|
| `template` / `_tmpl$` | Template-clone path |
| `walk` / `_path$` | Dynamic node addressing |
| `insert` | Child mount (often a thunk) |
| `setAttribute` | Reactive attrs (typically Effect-backed) |
| `setProperty` | One-shot property writes (no Effect) |
| `spread` / `memo` | Spreads and inline ternary `memo` |
| `zeroReactiveDomOps` | No walk / setAttribute / setProperty / spread in body |
| `staticDomOpFreeRatio` | Share of fixtures with `zeroReactiveDomOps` (baseline ≈ **0.6538** = 17/26) |

**This knife is a baseline**: lock what static lifting the compiler already does
so silent regressions fail the gate. It is **not** “max out compiler opts until
default output is almost Effect-free”.

---

## 2. Commands

```bash
deno task compiler:coverage:baseline   # measure.ts --write → JSON + goldens/
deno task compiler:coverage:check      # exact metrics + full golden text
deno test -A --no-check tests/unit/compiler/golden.test.ts
```

CI: ubuntu job `compiler-coverage-check` runs `deno task compiler:coverage:check`.

Intentional output changes: refresh with `--write`, commit JSON + goldens, note
why in CHANGELOG.

---

## 3. Goldens

| Path | Role |
|------|------|
| `scripts/compiler-coverage/goldens/<id>.out.txt` | Normalized full `compileSource` output |
| `tests/unit/compiler/golden.test.ts` | Per-fixture `toBe`; plus static vs reactive pattern asserts |

Corpus covers: fully static subtrees, static attr / style / ternary / && / || / ?? / typeof / void / satisfies lift, static text-child + / template / ternary, dynamic
text, reactive / identifier / store attrs, multi-site paths, component props,
ternary JSX + memo, Fragment, event / ref, spread, hydration `_bindingMap`,
SSR, HMR.

---

## 4. Non-goals (this knife)

- No analyzer / transformer / runtime default-semantics changes
- No reactive-core rewrite; no “finish compiler optimization” scope
- No JSR / npm publish; no ui-view / dweb-admin product changes
