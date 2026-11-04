# P1-2: Hydration quality opt-in pilot (`mismatchMode` · 2.x additive)

| Item | Value |
|------|-------|
| Package | `@dreamer/view` **v2.2.0** (`dev`) |
| Nature | **Docs + testable light opt-in**: document the three `mismatchMode` values and recommended usage; lock default **`continue`** with tests; examples `/runtime` pilot |
| **Out of scope** | Changing the production default (must stay **`continue`**); removing APIs; shipping progressive / chunked hydration runtime (no chunk hooks yet); 3.0 stricter defaults; JSR/npm; relaxing size / consumer-bundle baselines |
| Code touch | `src/csr.ts` (additive `HydrationMismatchMode` / `resolveMismatchMode` exports); `tests/unit/runtime/hydration.test.ts`; `examples/src/views/runtime/index.tsx` |
| Related | [`../zh-CN/view-framework-analysis.md`](../zh-CN/view-framework-analysis.md) · [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md) · [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md) |
| ZH | [`../zh-CN/P1-2-hydration-opt-in-pilot.md`](../zh-CN/P1-2-hydration-opt-in-pilot.md) |

---

## 1. API today (already shipped · default unchanged)

`hydrate(fn, container, bindingsOrOptions)` accepts either:

1. Legacy: `[number[], string][]` binding table; or
2. A **`HydrateOptions`** object (additive):

| Field | Meaning |
|-------|---------|
| `bindings` | Compiler binding table (same as the array form) |
| `mismatchMode` | `"continue"` (**default**) / `"assert"` / `"remount"` |
| `warnMismatch` | `console.warn` on binding failure; defaults with `VIEW_DEV` |
| `onMismatch` | Per-mismatch callback (telemetry) |
| `assertMismatch` / `remountOnMismatch` | **Deprecated** boolean aliases; **`mismatchMode` wins** when both are set |

Resolver: `resolveMismatchMode(options)` (from `/csr` or the main entry). Diagnostics: `getHydrationMismatches()`.

Implementation: `src/runtime/hydration.ts` + `hydrate` in `src/runtime/browser.ts`.

---

## 2. Modes and recommended usage

| Mode | Behavior | Use when |
|------|----------|----------|
| **`continue` (default)** | Record mismatches; missing bindings create client nodes; **do not abort**; keep SSR children | Production hybrid / tolerate mild drift; **do not change the 2.x default** |
| **`assert`** | Throw when any mismatch exists | CI / strict local gates / canaries — pass **explicitly** |
| **`remount`** | Drop the binding table, **clear the container**, CSR-`mount` semantics | Prefer a clean remount over a half-broken tree — pass **explicitly** |

### Opt-in examples

```ts
import { hydrate } from "@dreamer/view/csr";

// Production default: omit mismatchMode ≡ continue (this knife does not change that)
hydrate(() => <App />, root, { bindings });

// CI / strict:
hydrate(() => <App />, root, { bindings, mismatchMode: "assert", warnMismatch: false });

// Mismatch → full CSR remount:
hydrate(() => <App />, root, { bindings, mismatchMode: "remount" });
```

**Do not** flip the library default to `assert` / `remount` in 2.x (3.0 candidate; planning memo R1).

---

## 3. Progressive / chunked hydration

“Progressive / route-level hydrate” remains a **product direction** in the analysis / 3.0 memo. The runtime **does not** yet expose chunk / progressive hooks (no `hydrateIsland` / scheduled chunk API).

This knife therefore:

- does **not** invent unfinished chunk APIs;
- uses **explicit `mismatchMode` opt-in** + the examples `/runtime` demo + unit tests that lock default `continue` as the measurable pilot;
- leaves real progressive hydration for a later knife (tied to the dweb Hybrid golden path).

---

## 4. Conventions

| Item | Rule |
|------|------|
| Default `resolveMismatchMode(undefined)` / `{}` | Must be **`continue`** (locked by tests) |
| `/csr` exports | Additive `HydrationMismatchMode` + `resolveMismatchMode`; existing symbols unchanged |
| Size gates | **Do not** change baseline JSON bytes |
| Publish | No JSR / npm |

Verification: full Deno suite + Bun / Node / `size:check` / `consumer:bundle:check` per repo habit.

---

## 5. Related

- README §6 / §6.2 (root / zh / en)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- 3.0 stricter-default memo: [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md) R1
