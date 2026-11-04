# P1-1: Main-entry barrel deprecation preview (Strategy A · 2.x additive)

| Item | Value |
|------|-------|
| Package | `@dreamer/view` **v2.2.0** (`dev`) |
| Nature | **Deprecation preview / docs**: prefer subpaths + migration path; module-level JSDoc `@deprecated` on the main entry |
| **Out of scope** | Removing any export; changing runtime defaults/semantics; shipping a 3.0 slim barrel; JSR/npm publish; relaxing `bundle-size-baseline.json` / consumer-bundle baselines |
| Code touch | `src/mod.ts` (JSDoc only; **no** runtime `warn` / side effect) |
| Metrics | [`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md) · [`P0-baseline-bundle-and-perf.md`](./P0-baseline-bundle-and-perf.md) |
| ZH | [`../zh-CN/P1-1-main-entry-deprecation-preview.md`](../zh-CN/P1-1-main-entry-deprecation-preview.md) |

---

## 1. Why a preview instead of deleting the barrel

**Strategy A (2.x):** the main entry `@dreamer/view` (`src/mod.ts`) keeps a
**full compatible re-export**. Older apps and one-line demos keep working.

At the same time: **new and production code should default to subpaths**. That
comes from P0 / P0-2 measurements:

1. **Library entry graph** (`deno task size:check`): main entry minify ≈
   **43.5 KiB** vs `/reactivity` ≈ **10.5 KiB** (~**4.2×**).
2. **Consumer `export *` / namespace** (P0-2 `consumer:bundle:check`): star
   re-export of the main barrel vs reactivity-only needs ≈ **+34.1 KiB minify
   (~4.26×)** / **+11.9 KiB gzip**.
3. **Named imports** under a strong treeshaker (esbuild + `sideEffects: false`)
   show barrel vs subpath minify **Δ≈0**; subpaths still win on smaller module
   graphs and weaker bundlers / app-local `export *` wrappers.
4. **examples** already use subpaths (e.g. `examples/src/main.tsx` →
   `@dreamer/view/router`).

This knife is a **preview and migration guide**. It is **not** a 3.0 removal.
Whether 3.0 slims the default surface is a separate product decision
([`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md)).

---

## 2. Main entry vs subpaths (see `deno.json` `exports`)

| Import path | File | Typical use |
|-------------|------|-------------|
| `@dreamer/view` | `src/mod.ts` | Convenience barrel (full 2.x compat; module `@deprecated` preview) |
| `@dreamer/view/reactivity` | `src/reactivity/mod.ts` | Signal / Effect / Memo / Owner / Store / Context |
| `@dreamer/view/csr` | `src/csr.ts` | CSR aggregate: signal + mount/hydrate + control-flow + Suspense |
| `@dreamer/view/router` | `src/router.ts` | `createRouter` / `Link` / `mountWithRouter` / … |
| `@dreamer/view/form` | `src/form.ts` | `createForm` |
| `@dreamer/view/resource` | `src/resource.ts` | `createResource` |
| `@dreamer/view/control-flow` | `src/control-flow.ts` | `Show` / `For` / `Switch` / `ErrorBoundary` / … |
| `@dreamer/view/scheduler` | `src/scheduler/mod.ts` | `batch` / priority scheduler |
| `@dreamer/view/ssr` | `src/runtime/server.ts` | `renderToString` / streaming / hydration helpers (**not** on the main barrel) |
| `@dreamer/view/types` | `src/types.ts` | Shared types |
| `@dreamer/view/jsx-runtime` | `src/jsx-runtime.ts` | Automatic JSX runtime |
| Other | `compiler` / `optimize` / `portal` / `cli` / `setup` | Tooling / optional splits |

Full table: README **Installation / exports**.

---

## 3. Recommended migration

1. **Inventory** `from "@dreamer/view"` / `from "jsr:@dreamer/view"` (and any
   app-local `export * from "@dreamer/view"` wrappers).
2. **Move by symbol** (batched; runtime semantics unchanged):
   - Signal / Effect / Memo / Store only → `/reactivity`
   - Small CSR (`mount` / `hydrate` / `For` / `Show` / Suspense) → `/csr`
   - Router → `/router`; form → `/form`; Resource → `/resource`
   - SSR → **must** use `/ssr` (main entry intentionally omits happy-dom / `node:*`)
3. **Avoid** app-local `export * from "@dreamer/view"` or
   `import * as View from "@dreamer/view"` as a private barrel — that is the
   real premium P0-2 measured.
4. **Optional size check**: `deno task consumer:bundle:check` /
   `deno task size:check`.
5. **IDE**: you may see a module `@deprecated` hint on the main entry; runtime
   and export surface are unchanged in 2.x.

### Example

```ts
// Before (compatible, but pulls the convenience graph / easy to re-export *)
import { createSignal, createRouter, mountWithRouter } from "@dreamer/view";

// After (recommended)
import { createSignal } from "@dreamer/view/reactivity";
import { createRouter, mountWithRouter } from "@dreamer/view/router";
// or small CSR:
// import { createSignal, mount, For } from "@dreamer/view/csr";
```

---

## 4. Code conventions for this knife

| Item | Rule |
|------|------|
| `src/mod.ts` exports | **All kept**; re-export list unchanged |
| Runtime | **No** `console.warn` / env side effects (keeps tests / SSR quiet) |
| JSDoc | Module-level `@deprecated` pointing here + subpaths; 2.x still fully compatible |
| Size gates | **Do not** change baseline JSON bytes |

Verification: full local tests green (Deno unit+integration; plus Bun / Node /
`size:check` / `consumer:bundle:check` per repo habit) ⇒ no runtime regression.

---

## 5. Related

- P0-2 consumer numbers: [`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md)
- Library entry size: [`P0-baseline-bundle-and-perf.md`](./P0-baseline-bundle-and-perf.md)
- Component authors (light subpath note): [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md)
- 3.0 planning memo (not shipped here): [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md)
- README convenience-barrel section; changelog: [`CHANGELOG.md`](./CHANGELOG.md)
