# P1: Component re-run / bare-fetch guard (DEV warnings)

| Item         | Value                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Package      | `@dreamer/view` **3.0.0** (`dev`)                                                                                                       |
| Nature       | **DEV / opt-in DX** + docs — warn when a setup body re-runs (focus loss + bare `fetch` re-fire)                                         |
| Entry        | `@dreamer/view/devtools` (`noteComponentSetup` / `installComponentSetupTracking` / `detectComponentRerun`; extends oversubscribe)       |
| Out of scope | Rewriting the reactive kernel; changing Effect microtask defaults; JSR publish (DEV jsx auto-note landed — see §2.1)                    |
| ZH           | [`../zh-CN/P1-view-rerun-fetch-guard.md`](../zh-CN/P1-view-rerun-fetch-guard.md)                                                        |
| Related      | [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) · [`P2-dev-warn-oversubscribe.md`](./P2-dev-warn-oversubscribe.md) |

---

## 0. Runtime guard (landed)

Function components invoked via `jsx()` / `jsxs()` run their **setup under
`untrack`**. Top-level Signal / Memo reads during setup no longer subscribe the
parent `insert` Effect, so a non-route state change does **not** `cleanNode` +
`replaceChild` the whole component shell (focus loss / bare `fetch` re-fire).
Fine-grained updates still go through nested `insert` / `createRenderEffect` /
`createEffect`.

**Context:** `useContext` must keep Signal getters behind its Proxy (re-read on
each property access). Eager unwrap made object-valued `value={signal}` depend
on whole-tree remount; with setup `untrack` that path went stale. Fixed in the
same knife.

**Context Proxy + jsx-runtime:** when there is no current Observer (setup
`untrack`), property access on a Context Proxy returns a `__VIEW_SIGNAL` thunk
for data fields so eager `{user.name}` / attrs still fine-grain via `insert` /
`createRenderEffect`. Setup itself does not subscribe the parent insert Effect.

**props Signal thunk:** function-component props passed through `jsx()` wrap
Signal / Signal-of-object fields via `wrapComponentProps` (same path as
Context). Eager `{props.user.name}` / `{user.name}` (`const user = props.user`)
stays fine-grained under setup `untrack`.

**Still remounts (allowed):** parent Effect re-runs (e.g. route switch, explicit
parent thunk that re-reads a page Signal), hydration `mismatchMode: "remount"`,
author-triggered remounts.

Unit lock: `tests/unit/runtime/component-rerun-guard.test.ts`.

## 1. Problem

Repeated network calls are often **not** `createResource` bugs. A too-wide
Effect re-runs the **whole component setup**; any top-level `fetch(...)` in that
body fires again, and remounts drop input focus.

**Rules of thumb**

1. Component / page functions **run setup once**.
2. Side effects belong in **`createEffect`** or **`createResource`** (pass
   `AbortSignal`).
3. **Do not** call bare `fetch` / `axios` at component top level or in the
   `return` path.
4. Do not synchronously read hot Signals on the root `return` (P0-4).

---

## 2. Opt-in API

```ts
import {
  detectComponentRerun,
  enableOversubscribeWarnings,
  noteComponentSetup,
} from "@dreamer/view/devtools";

globalThis.VIEW_DEV = true;

function Page() {
  noteComponentSetup("Page"); // 2nd call → component-rerun risk
  // BAD: fetch("/api");
  // GOOD: createResource(() => fetch("/api", { signal }).then(r => r.json()))
  return <Shell />;
}

const stop = enableOversubscribeWarnings({
  setupKeys: ["Page"],
  remountKeys: ["PullRefresh"],
});
// … later
stop();

detectComponentRerun("Page", { emit: true });
```

Existing **wide-subscription** / **remount-churn** messages now also mention
focus loss and bare-fetch re-fire.

### 2.1 DEV auto-note via jsx

With `VIEW_DEV` and `installComponentSetupTracking()` (also installed by
`createRootTracked` / `mountDevtoolsOverlay`), **named** function components
invoked through `jsx` / `jsxs` / `jsxDEV` (`displayName` or `name`) call
`noteComponentSetup` automatically — no manual note in app code. Anonymous
components are skipped. Production installs no hook → `jsx` only reads
`globalThis` once and no-ops.

`detectOversubscribe` / `enableOversubscribeWarnings` scan every noted key
(`setupKeys` is optional extra only).

---

## 3. Resource AbortSignal (thin companion)

`createResource` already passes `{ signal }` per load; **source change** /
`refetch` / outer **`options.signal`** abort in-flight.

**Route navigation:** `router.routeAbortSignal()` returns the current route
generation `AbortSignal`. Each successful navigation (including popstate) aborts
the previous generation and rotates a new one. Prefer:

```ts
const router = useRouter();
const data = createResource(id, fetcher, {
  signal: router.routeAbortSignal(),
});
```

Do **not** rely on Owner dispose (Suspense fallback also disposes child Owners).

Abort does not fix a setup that re-creates the Resource every re-run — that is
what the untrack + DEV warnings target.

## 4. Show / For `when` / `each` tip

Keep control-flow **subscribed** to Signals — do not eagerly freeze a snapshot:

| Form                               | Effect                                    |
| ---------------------------------- | ----------------------------------------- |
| `when={open}` / `each={items}`     | ✅ pass the getter; re-read inside Effect |
| `when={() => open()}`              | ✅ explicit accessor                      |
| `when={open()}` / `each={items()}` | ❌ frozen at render; never updates        |

Under `VIEW_DEV`, a **plain value** (non-function) triggers a one-shot
`console.warn` (static literals are valid — you can ignore the tip).
