/**
 * OPTIONAL local-only probe example for Effect / insert call counts.
 *
 * Usage (from repo root, never import from application src hot paths):
 *   deno run -A scripts/profiling/local-probe-example.ts
 *
 * This file wraps APIs at the call site for a one-off capture. Do **not**
 * copy these counters into `src/` — that would tax every production path.
 * Prefer Chrome Performance on a real page (docs site / dweb-admin) first;
 * see docs/zh-CN/P0-1-profiling-and-bench-ci.md.
 */
import { Window } from "npm:happy-dom@20.4.0";
import {
  createEffect,
  createRoot,
  createSignal,
  flushPendingSync,
  insert,
} from "../../src/mod.ts";

const win = new Window();
// @ts-ignore
globalThis.window = win;
// @ts-ignore
globalThis.document = win.document;
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

let effectRuns = 0;
let insertCalls = 0;

function probedInsert(
  parent: Node,
  value: unknown,
  current?: Node | null,
  before?: Node | null,
) {
  insertCalls++;
  // deno-lint-ignore no-explicit-any
  return insert(parent as any, value as any, current as any, before as any);
}

function probedEffect(fn: () => void) {
  return createEffect(() => {
    effectRuns++;
    fn();
  });
}

createRoot((dispose) => {
  const parent = document.createElement("div");
  const [n, setN] = createSignal(0);
  probedEffect(() => {
    n();
  });
  probedInsert(parent, () => `n=${n()}`);
  flushPendingSync();
  setN(1);
  flushPendingSync();
  setN(2);
  flushPendingSync();
  console.log(
    JSON.stringify(
      {
        note: "local probe only — not a CI gate; do not put in src/",
        effectRuns,
        insertCalls,
        text: parent.textContent,
      },
      null,
      2,
    ),
  );
  dispose();
});
