/**
 * OPTIONAL local-only probe: route navigate A↔B churn + dispose / subscription heuristics.
 *
 * Intent
 * ------
 * Catch accidental growth of router subscribers, Owner children, or leaf Effect runs when
 * an examples-style SPA flips between two routes many times. Script only — not a feature.
 *
 * Invariants
 * ----------
 * - Never imported from `src/` hot paths (same rule as `local-probe-example.ts`).
 * - Does **not** change router / reactivity defaults; not a CI Soft Cap gate.
 * - Prints JSON for humans; if numbers climb unboundedly, open a separate runtime knife.
 *
 * Why not instrument inside `src/integrations/router`?
 * ----------------------------------------------------
 * Per-navigate counters would tax every production navigation. Prefer Chrome Performance
 * on a real page first; use this only when you need a reproducible local number.
 *
 * Usage (repo root):
 *   deno run -A scripts/profiling/route-churn-probe.ts
 *   VIEW_PROBE_ITERS=200 deno run -A scripts/profiling/route-churn-probe.ts
 *
 * See docs/zh-CN|en-US/P0-1-profiling-and-bench-ci.md §2.2.
 */
import { Window } from "npm:happy-dom@20.4.0";
import {
  createEffect,
  createRoot,
  flushPendingSync,
  getOwner,
  insert,
  type Owner,
} from "../../src/mod.ts";
import { createRouter } from "../../src/router.ts";
import { jsx } from "../../src/jsx-runtime.ts";

const ITERS = Number(Deno.env.get("VIEW_PROBE_ITERS") ?? "80");

const win = new Window();
// @ts-ignore inject DOM
globalThis.window = win;
// @ts-ignore
globalThis.document = win.document;
// @ts-ignore history for router (do not rebind location — happy-dom pathname trap)
globalThis.history = win.history;
// @ts-ignore
globalThis.Node = win.Node;
// @ts-ignore
globalThis.DocumentFragment = win.DocumentFragment;
// @ts-ignore
globalThis.Text = win.Text;
// @ts-ignore
globalThis.HTMLElement = win.HTMLElement;
// @ts-ignore
globalThis.Element = win.Element;
// @ts-ignore
globalThis.Event = win.Event;
// @ts-ignore
globalThis.MouseEvent = win.MouseEvent;

/** Walk one Owner tree: node count + pending disposable slots (probe-only). */
function measureOwner(
  root: Owner | null | undefined,
): { owners: number; disposables: number } {
  let owners = 0;
  let disposables = 0;
  const walk = (o: Owner | null | undefined) => {
    if (!o) return;
    owners++;
    disposables += o.disposables?.length ?? 0;
    const kids = o.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) walk(kids[i]!);
  };
  walk(root);
  return { owners, disposables };
}

async function drain(): Promise<void> {
  flushPendingSync();
  await Promise.resolve();
  await Promise.resolve();
  flushPendingSync();
}

const container = document.createElement("div");
container.id = "root";
document.body.appendChild(container);

if (globalThis.history?.replaceState) {
  globalThis.history.replaceState({}, "", "/");
}

let effectRuns = 0;
let pageAMounts = 0;
let pageBMounts = 0;

function PageA() {
  pageAMounts++;
  // Leaf effect: must dispose when leaving the route (Owner teardown on rematch).
  createEffect(() => {
    effectRuns++;
  });
  return jsx("div", { id: "page-a", children: "A" });
}

function PageB() {
  pageBMounts++;
  createEffect(() => {
    effectRuns++;
  });
  return jsx("div", { id: "page-b", children: "B" });
}

const router = createRouter({
  routes: [
    { path: "/", component: PageA },
    { path: "/b", component: PageB },
  ],
  interceptLinks: false,
  scroll: false,
});

let subscribeTicks = 0;
const unsub = router.subscribe(() => {
  subscribeTicks++;
});

let rootOwner: Owner | null = null;
const disposeMount = createRoot((dispose) => {
  rootOwner = getOwner();
  // Same shape as mountWithRouter → mount(() => () => router.render(), …)
  // but keep this createRoot so we can snapshot Owner size before destroy.
  while (container.firstChild) container.removeChild(container.firstChild);
  insert(container, () => () => router.render());
  return dispose;
});

await drain();
const mid0 = measureOwner(rootOwner);

for (let i = 0; i < ITERS; i++) {
  await router.navigate(i % 2 === 0 ? "/b" : "/");
  await drain();
}

const midN = measureOwner(rootOwner);

unsub();
disposeMount();
router.destroy();
await drain();

console.log(
  JSON.stringify(
    {
      note:
        "local route-churn probe only — not a CI gate; do not put counters in src/",
      iters: ITERS,
      pageAMounts,
      pageBMounts,
      effectRuns,
      subscribeTicks,
      ownerBeforeChurn: mid0,
      ownerAfterChurn: midN,
      /**
       * Heuristic: after A↔B churn, Owner size should stay in the same ballpark as
       * before (route rematch must clean the previous page Owner). Large growth ⇒ leak smell.
       */
      ownerGrowth: {
        owners: midN.owners - mid0.owners,
        disposables: midN.disposables - mid0.disposables,
      },
      finalPath: router.path(),
      containerText: container.textContent,
    },
    null,
    2,
  ),
);
