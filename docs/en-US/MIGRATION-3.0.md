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

### Still on the main entry (core CSR barrel)

Reactivity, scheduler, `mount` / `hydrate`, `insert` / props / `template`,
control-flow (`Show` / `For` / …), Suspense / `lazy` / `Dynamic`, portal, HMR.

SSR remains **`@dreamer/view/ssr` only** (unchanged).

### Not in this knife

| Candidate                                                     | Status                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| R1 — stricter default `mismatchMode`                          | **HOLD** — default still `continue`; use opt-in (`assert` / `remount`) |
| R3 — remove deprecated `assertMismatch` / `remountOnMismatch` | **HOLD**                                                               |
| R2 — require `key` on `For`                                   | **HOLD**                                                               |
| Scheduler unification                                         | **HOLD**                                                               |

---

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
