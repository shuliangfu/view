# Migrating to @dreamer/view 3.0

| Item      | Value                                                      |
| --------- | ---------------------------------------------------------- |
| From      | 2.2.x (Strategy A deprecation preview)                     |
| To        | **3.0.0** (Strategy A **landed** — slim main entry)        |
| Status    | First 3.0 knife on `dev` — **JSR not published yet**       |
| ZH        | [`../zh-CN/MIGRATION-3.0.md`](../zh-CN/MIGRATION-3.0.md)   |
| Plan memo | [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md) |

---

## 1. What broke

### E1 / E2 — Main entry no longer re-exports integrations

`import { … } from "@dreamer/view"` **no longer** provides:

| Symbol (examples)                                                                                    | Use instead              |
| ---------------------------------------------------------------------------------------------------- | ------------------------ |
| `createRouter`, `Link`, `mountWithRouter`, `matchRoute`, `parseRouterUrl`, `useRouter`, router types | `@dreamer/view/router`   |
| `createForm`, `messageFromSafeParse`, form helpers                                                   | `@dreamer/view/form`     |
| `createResource`, `createInflightDedupe`                                                             | `@dreamer/view/resource` |

### R1 / R3 — Stricter hydration defaults (landed)

**Breaking:** omitting `mismatchMode` no longer means `continue`.

| Environment                    | Default when `mismatchMode` omitted         |
| ------------------------------ | ------------------------------------------- |
| `globalThis.VIEW_DEV === true` | **`assert`** (throw on binding mismatches)  |
| Production (no `VIEW_DEV`)     | **`remount`** (clear container → CSR mount) |

- Want 2.x “tolerate drift” behavior → **explicit** `mismatchMode: "continue"`.
- Deprecated booleans **`assertMismatch`** / **`remountOnMismatch`** are
  **removed** from `HydrateOptions`. Use `mismatchMode: "assert"` / `"remount"`.

```ts
import { hydrate } from "@dreamer/view/csr";

// 3.0 production default ≡ remount on mismatch
hydrate(() => <App />, root, { bindings });

// Opt back into 2.x tolerance:
hydrate(() => <App />, root, { bindings, mismatchMode: "continue" });

// CI / strict (also the VIEW_DEV default):
hydrate(() => <App />, root, { bindings, mismatchMode: "assert" });
```

### Still on the main entry (core CSR barrel)

Reactivity, scheduler, `mount` / `hydrate`, `insert` / props / `template`,
control-flow (`Show` / `For` / …), Suspense / `lazy` / `Dynamic`, portal, HMR.

SSR remains **`@dreamer/view/ssr` only** (unchanged).

### Remaining candidates (not this knife)

| Candidate                                                     | Status                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| R1 — stricter default `mismatchMode`                          | **LANDED** — omit → `assert` when `VIEW_DEV`, else `remount`; pass `continue` for 2.x tolerance |
| R3 — remove deprecated `assertMismatch` / `remountOnMismatch` | **LANDED** — use `mismatchMode` only                                                            |
| R2 — require `key` on `For`                                   | **HOLD**                                                                                        |
| Scheduler unification                                         | **HOLD**                                                                                        |

---


### Component setup is untracked (behavior align with “run once”)

`jsx()` function components run setup under `untrack`. Prefer reactive children / attrs as accessors (`() => …`) or compiled templates — eager `{signal()}` in setup is one-shot. See [`P1-view-rerun-fetch-guard.md`](./P1-view-rerun-fetch-guard.md).

## 2. Codemod-style steps

1. Inventory `from "@dreamer/view"` / `from "jsr:@dreamer/view"`.
2. Move router / form / resource symbols to their subpaths (batched).
3. Prefer `/reactivity` or `/csr` for new code even when symbols remain on main.
4. Do **not** wrap `export * from "@dreamer/view"` in app barrels.
5. Optional: `deno task size:check` / `deno task consumer:bundle:check`.

### Before → after

```ts
// 2.x
import {
  createForm,
  createResource,
  createRouter,
  createSignal,
} from "@dreamer/view";

// 3.0
import { createSignal } from "@dreamer/view"; // or /reactivity /csr
import { createRouter, mountWithRouter } from "@dreamer/view/router";
import { createForm } from "@dreamer/view/form";
import { createResource } from "@dreamer/view/resource";
```

---

## 3. Downstream

Downstream packages (`dweb`, `ui-view`, `Render`, `dweb-admin`, …) are **not**
bumped in this campaign knife. Apps stay on 2.x JSR until you choose to migrate
and a 3.0 JSR publish is ordered.

---

## 4. Related

- P1-1 preview (2.x):
  [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md)
- P1-2 hydration opt-in:
  [`P1-2-hydration-opt-in-pilot.md`](./P1-2-hydration-opt-in-pilot.md)
- CHANGELOG: [`CHANGELOG.md`](./CHANGELOG.md)
