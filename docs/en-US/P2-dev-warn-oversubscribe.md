# P2: DEV-only oversubscribe / remount warnings (§5.1)

| Item | Value |
|------|-------|
| Nature | **Additive DX**: explicit opt-in warnings for wide Effect subscriptions and remount churn |
| Package | `@dreamer/view` **3.0.0** (`dev`; started in 2.2) |
| Entry | **`@dreamer/view/devtools`** (extends P2-4; not on main barrel / `/reactivity`) |
| Baselines | Does **not** change or raise `size:check` / `consumer:bundle:check` baseline numbers |
| Forbidden (knife-time) | Browser extension / UI shell; patching `createSignal` / `createRoot` / `insert` defaults; default time-slicing |
| Note | **3.0** separately landed main-entry slim + stricter hydrate; this DX also gained `component-rerun` + `setupKeys` (see [`P1-view-rerun-fetch-guard.md`](./P1-view-rerun-fetch-guard.md)) |
| ZH | [`../zh-CN/P2-dev-warn-oversubscribe.md`](../zh-CN/P2-dev-warn-oversubscribe.md) |
| Related | [`P2-4-devtools.md`](./P2-4-devtools.md); analysis §5.1; [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) |

---

## 1. Goal

Help authors catch misuse patterns that cause focus loss / controlled-input flicker (§5.1):

- **wide-subscription** — an Effect with too many upstream edges (often a component shell re-running)
- **remount-churn** — logical key remounted too often, or an Owner whose children were fully replaced between polls. A one-time expansion from a small placeholder (route loading shell; examples dogfood is subtree 5→page at path `0/0`) is first paint, not churn. Equal-size rebuilds still warn.
- **component-rerun** (**3.0**) — setup body re-noted under the same logical key (focus loss / bare `fetch`); pairs with runtime setup `untrack`.

## 2. How to opt in

```ts
import {
  createRootTracked,
  detectOversubscribe,
  enableOversubscribeWarnings,
  noteRemount,
} from "@dreamer/view/devtools";
import { createEffect, createSignal, getOwner } from "@dreamer/view/reactivity";

globalThis.VIEW_DEV = true; // required to *emit* warnings

createRootTracked((dispose) => {
  const n = createSignal(0);
  createEffect(() => n());

  // One-shot inspection (no console unless emit: true)
  console.log(detectOversubscribe(getOwner(), { maxUpstream: 8 }));

  // Live watcher (requires VIEW_DEV); stop when done
  const stop = enableOversubscribeWarnings({
    owner: getOwner(),
    maxUpstream: 8,
    intervalMs: 500,
  });

  // Optional: mark app-level remounts (PullRefresh shell, route, …)
  noteRemount("PullRefresh");

  stop();
  dispose();
});
```

| API | Notes |
|-----|-------|
| `detectWideSubscriptions` / `detectOversubscribe` | One-shot; inspect without `VIEW_DEV`; **emit** needs `VIEW_DEV` + `emit: true` |
| `noteRemount` / `detectRemountChurn` | Explicit remount keys + sliding window (default 3 / 2000ms) |
| `detectOwnerRemountChurn` | Poll-friendly: full child-identity replacement under a node |
| `enableOversubscribeWarnings` / `disableOversubscribeWarnings` | Opt-in live poller; **requires** `VIEW_DEV` |

Defaults: `maxUpstream = 8`, `maxRemounts = 3`, `remountWindowMs = 2000`.

## 3. Production zero cost

| Mechanism | Behavior |
|-----------|----------|
| Separate `/devtools` subpath | Measured size / consumer fixtures never import it → baselines unchanged |
| No hot-path hooks | `createSignal` / `createRoot` / `insert` untouched |
| Explicit enable | Watcher only runs after `enableOversubscribeWarnings` |
| Emit gated | `console.warn` / `onWarn` require `VIEW_DEV` |

Do **not** import `/devtools` from production app entry points.

## 4. Out of scope

- Browser extension / overlay UI
- Changing default runtime semantics or raising baseline JSON
- P2-1 / P2-2 / P2-3; 3.0 hydration default tighten; main-entry slim-down

## 5. Acceptance

- `deno test -A tests` (includes E2E) green
- `deno task size:check` + `deno task consumer:bundle:check` green **without** rewriting baseline numbers
- CI green including `e2e-examples`
