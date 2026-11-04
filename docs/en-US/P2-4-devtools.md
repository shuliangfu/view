# P2-4: DEV-only DevTools (Owner tree / subscriptions)

| Item | Value |
|------|-------|
| Nature | **Additive DX**: inspect Owner trees and subscription edge counts |
| Package | `@dreamer/view` **v2.2.0** (`dev`) |
| Entry | **`@dreamer/view/devtools`** only (not on main barrel / `/reactivity`) |
| Baselines | Does **not** change or raise `size:check` / `consumer:bundle:check` baseline numbers |
| Forbidden | JSR / npm publish; browser extension / UI shell; rewriting the reactive kernel; touching ui-view / dweb-admin / xlang |
| ZH | [`../zh-CN/P2-4-devtools.md`](../zh-CN/P2-4-devtools.md) |

---

## 1. Goal

Help authors find **leaked roots** and **over-subscription** during development:

- Walk / summarize an **Owner** subtree (effects, memos, disposables, depth)
- Count **subscription edges** (upstream on Observers, downstream on Sources / Signals)
- Opt-in root registry + registry Source snapshots

## 2. Production zero cost

| Mechanism | Production behavior |
|-----------|---------------------|
| Separate subpath | Apps that never import `/devtools` do not pull the module into size / consumer fixtures |
| **No hot-path hooks** | `createSignal` / `createRoot` are **unchanged**; no WeakMap / root Set in the reactive kernel |
| Probe count | `getSignalObserverCount` temporarily subscribes a probe Observer, counts, then cleans up |
| Opt-in roots | `trackRoot` / `createRootTracked` live only in `/devtools` |

Do **not** import `/devtools` from production app entry points.

## 3. API (short)

```ts
import {
  createRootTracked,
  getSignalObserverCount,
  getTrackedRoots,
  inspectOwner,
  summarizeOwnerTree,
} from "@dreamer/view/devtools";
import { createEffect, createSignal, getOwner } from "@dreamer/view/reactivity";

createRootTracked((dispose) => {
  const n = createSignal(0);
  createEffect(() => n());
  console.log(getSignalObserverCount(n)); // 1
  console.log(summarizeOwnerTree(getOwner()));
  console.log(getTrackedRoots().length); // 1
  dispose();
});
```

| API | Notes |
|-----|-------|
| `inspectOwner` / `summarizeOwnerTree` | Need an `Owner` (`getOwner()` inside a root) |
| `trackRoot` / `untrackRoot` / `createRootTracked` | Opt-in root list for leak triage |
| `getSignalObserverCount` | Probe Observer — no Signal instrumentation |
| `snapshotRegistrySources` | Named Sources always; anonymous also when `VIEW_DEV` |
| `isViewDev` / `requireViewDev` | Mirror / assert `globalThis.VIEW_DEV` |

## 3b. Follow-up: oversubscribe warnings

Opt-in §5.1 warnings live in the same subpath: [`P2-dev-warn-oversubscribe.md`](./P2-dev-warn-oversubscribe.md).

## 4. Out of scope

- Browser extension, overlay UI, or network protocol
- Changing default runtime semantics / subscription list implementation
- Raising size or consumer-bundle baseline JSON

## 5. Acceptance

- `deno test -A tests` (includes E2E) green
- `deno task size:check` + `deno task consumer:bundle:check` green **without** rewriting baseline numbers
- CI green including `e2e-examples`
