# P1: Component re-run / bare-fetch guard (DEV warnings)

| Item         | Value                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Package      | `@dreamer/view` **3.0.0** (`dev`)                                                                                                       |
| Nature       | **DEV / opt-in DX** + docs — warn when a setup body re-runs (focus loss + bare `fetch` re-fire)                                         |
| Entry        | `@dreamer/view/devtools` (`noteComponentSetup` / `detectComponentRerun`; extends oversubscribe)                                         |
| Out of scope | Rewriting the reactive kernel; changing Effect microtask defaults; auto-hooking every component; JSR publish                            |
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

When the app is compiled with **esbuild `react-jsx` / `jsx-runtime` only** (no
`@dreamer/view` JSX compiler), write `{() => user.name}` — not `{user.name}` —
so `insert` receives a thunk. Eager `{user.name}` was fine only while setup
subscribed the parent Effect (whole-tree remount).

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

---

## 3. Resource AbortSignal (thin companion)

`createResource` already passes `{ signal }` per load; **source change** /
`refetch` / outer **`options.signal`** abort in-flight. Prefer
`{ signal: routeAbort.signal }` on page leave — do **not** rely on Owner dispose
(Suspense fallback also disposes child Owners).

Abort does not fix a setup that re-creates the Resource every re-run — that is
what the untrack + DEV warnings target.
