# @dreamer/view (English)

> **Fine-grained reactive view library**: no virtual DOM; **Signal / Effect**
> track dependencies, and **`insert`** applies minimal updates to real DOM.
> Supports **CSR, SSR, streaming output, and hydration**; includes **router,
> async Resource, Store, forms, Context, Suspense / ErrorBoundary**, and more.
> **Chinese mirror** (same section structure):
> **[docs/zh-CN/README.md](../zh-CN/README.md)**; package landing
> **[README.md](../../README.md)** mirrors this English guide.

[中文](../zh-CN/README.md) | English

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-359%20passed%20Deno%20unit%2Bintegration-brightgreen)](./TEST_REPORT.md)

---

## 1. Overall architecture (read before APIs)

1. **No virtual DOM** Updates do not go through a full-tree diff. `jsx` / `jsxs`
   return a **thunk**: `() => actual UI` (often typed as `VNode`), evaluated
   inside `insert` or an effect and subscribed to **Signals**.

2. **Owner tree** Each component function runs under its **own Owner** (except
   transparent `Provider`). `createRoot`, `onCleanup`, `onError`, `useContext`,
   etc. attach to the Owner chain.

3. **Core render API: `insert(parent, value, current?, before?)`**
   - If `value` is a function, it is wrapped in **`createEffect`**,
     re-evaluated, and the DOM is patched.
   - On **native elements**, non-`on*` **function props** use
     **`createRenderEffect`** (e.g. `className={() => ...}`,
     `value={() => ...}`).

4. **Prefer subpath imports (2.x · main-entry deprecation preview)** Export keys
   match `deno.json` / the table in **Installation**. For app code, default to
   **`@dreamer/view/reactivity`**, **`/csr`**, **`/ssr`**, **`/router`**,
   **`/form`**, **`/resource`**, **`/control-flow`**, etc. The main
   **`@dreamer/view`** barrel remains a **full compatible** re-export
   (**Strategy A**: no export removals in 2.x) but is under a **deprecation
   preview** (see **Convenience barrel** /
   [P1-1](./P1-1-main-entry-deprecation-preview.md)). P0 minify ~**43.5 KiB**
   main vs ~**10.5 KiB** `/reactivity`; P0-2 consumer `export *` premium ≈
   **+34 KiB** ([P0](../zh-CN/P0-基线-体积与性能.md) /
   [P0-2](./P0-2-consumer-bundle-analyze.md)).

---

## 2. Installation

### 2.1 Global CLI (`view-cli`)

```bash
deno run -A jsr:@dreamer/view/setup
```

After installation, `view-cli` is on your `PATH`. Root flags include
**`--version` / `-v`**. Run **`view-cli --help`** or
**`view-cli <command> --help`** for full parser output.

| Command                     | Description                                                                                                                                                                          | Options                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **`view-cli init`** `[dir]` | Scaffold a new app in `dir` (default: current directory).                                                                                                                            | **`--beta`** — use beta-oriented defaults where applicable.                                                             |
| **`view-cli dev`**          | Development server (HMR, regenerates routers, etc.).                                                                                                                                 | **`-h` / `--host`** — bind host; **`-p` / `--port`** — listen port.                                                     |
| **`view-cli start`**        | Serve the **built** static output (run **`build`** first).                                                                                                                           | **`-h` / `--host`**, **`-p` / `--port`**.                                                                               |
| **`view-cli build`**        | Production build to the output dir from `view.config.ts`.                                                                                                                            | —                                                                                                                       |
| **`view-cli upgrade`**      | Ask JSR for the newest **`@dreamer/view`**; if it is newer than this CLI, re-run **`jsr:@dreamer/view@<version>/setup`** so the **global** install / `view-cli` tracks that release. | **`--beta`** — resolve “latest” including beta / prerelease lines.                                                      |
| **`view-cli update`**       | In the **current project** directory, run **`deno update`** or **`bun update`** to refresh **project** dependencies and lockfiles.                                                   | **`--latest`** — forwarded to the runtime; you can append other updater flags (e.g. **`--interactive`**) as extra args. |

### 2.2 Add as a project dependency

**Deno**

```bash
deno add jsr:@dreamer/view
```

**Bun**

```bash
bunx jsr add @dreamer/view
```

**Node.js** (>= 22)

```bash
npx jsr add @dreamer/view
```

> **Runtime compatibility**: `@dreamer/view` runs on **Deno 2.9+**, **Bun 1.3+**,
> and **Node.js 22+** with zero source changes. Unit and integration tests pass
> on all three runtimes × three OSes (Linux / macOS / Windows) in CI. Examples
> **browser E2E** (`deno task test:e2e`) runs as a separate ubuntu Chromium job
> (`e2e-examples`); it is **not** folded into the Windows / browser-less matrix
> cells. Local full Deno suite: `deno test -A tests` (needs Playwright Chromium).
> The CLI `upgrade` / `update` commands use `npx jsr` / `npm` respectively on Node.

### 2.3 `exports` map (same as `view/deno.json`)

| Subpath                             | Purpose                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `jsr:@dreamer/view`                 | **Main**: reactivity, runtime, `insert`, `mount` / `hydrate`, router, Resource, Store, control flow, forms, Suspense, HMR, etc. |
| `jsr:@dreamer/view/types`           | Shared types: `VNode`, `JSXRenderable`, etc.                                                                                    |
| `jsr:@dreamer/view/cli`             | CLI implementation (toolchain)                                                                                                  |
| `jsr:@dreamer/view/setup`           | Global install script entry                                                                                                     |
| `jsr:@dreamer/view/jsx-runtime`     | Automatic JSX runtime (`jsx` / `jsxs` / `Fragment`)                                                                             |
| `jsr:@dreamer/view/jsx-dev-runtime` | Dev JSX entry (same source as jsx-runtime; satisfies bundlers that resolve `jsxDEV`)                                            |
| `jsr:@dreamer/view/portal`          | **`createPortal` only** (optional split import)                                                                                 |
| `jsr:@dreamer/view/compiler`        | **`compileSource` / `transformJSX`**, etc.                                                                                      |
| `jsr:@dreamer/view/optimize`        | **`optimize` / `createOptimizePlugin`** (build-time string compression, etc.)                                                   |
| `jsr:@dreamer/view/ssr`             | **`renderToString` / `renderToStringAsync` / `renderToStream`**, `generateHydrationScript`, and SSR helpers                     |
| `jsr:@dreamer/view/reactivity`      | **Signal / Effect / Memo / Owner / Store / Context** + convenience **`batch`** re-export (no router/form; better tree-shake)   |
| `jsr:@dreamer/view/scheduler`       | **`batch` / priority scheduler**                                                                                                |
| `jsr:@dreamer/view/router`          | **`createRouter` / `Link` / `matchRoute` / …**                                                                                  |
| `jsr:@dreamer/view/form`            | **`createForm`**                                                                                                                |
| `jsr:@dreamer/view/resource`        | **`createResource`**                                                                                                            |
| `jsr:@dreamer/view/control-flow`    | **`Show` / `For` / `Switch` / `ErrorBoundary` / …**                                                                             |
| `jsr:@dreamer/view/csr`             | **CSR bundle**: signal + mount/hydrate + control-flow + Suspense (no SSR/router)                                                |

**Recommended imports (prefer these in new code):**

```bash
deno add jsr:@dreamer/view
# then import from subpaths — add the same package once; subpaths share it
```

```ts
// Reactivity only:
import { createEffect, createSignal } from "@dreamer/view/reactivity";
// Small CSR apps (signal + mount + control-flow + Suspense):
import { createSignal, For, mount } from "@dreamer/view/csr";
// Router / form / resource / SSR when you need them:
import { createRouter, Link, mountWithRouter } from "@dreamer/view/router";
import { createForm } from "@dreamer/view/form";
import { createResource } from "@dreamer/view/resource";
import { renderToString } from "@dreamer/view/ssr";

// Hydration mismatch strategies (additive):
// hydrate(App, root, { bindings, mismatchMode: "remount" | "assert" | "continue" })
```

#### Convenience barrel (`@dreamer/view`) — **2.x deprecation preview**

> **Strategy A (additive):** the main entry still **fully re-exports**; behavior
> unchanged. **No** export removals and **no** runtime default changes. Prefer
> subpaths for new / production code. Module JSDoc is `@deprecated` (**no**
> runtime `warn`). Guide:
> [P1-1 main-entry deprecation preview](./P1-1-main-entry-deprecation-preview.md) /
> [ZH](../zh-CN/P1-1-main-entry-deprecation-preview.md).

Size context:

- Library entry (P0): minify ~**43.5 KiB** main vs ~**10.5 KiB** `/reactivity`
  (~4.2×) — [P0 baseline](../zh-CN/P0-基线-体积与性能.md) /
  [EN](./P0-baseline-bundle-and-perf.md).
- Consumer `export *` (P0-2): ≈ **+34.1 KiB minify (~4.26×)** / **+11.9 KiB gzip**
  vs reactivity — [P0-2](./P0-2-consumer-bundle-analyze.md).

```ts
// Compatible in 2.x, but under deprecation preview; avoid re-wrapping with export *:
import { createRouter, createSignal } from "@dreamer/view";

// Recommended:
import { createSignal } from "@dreamer/view/reactivity";
import { createRouter, mountWithRouter } from "@dreamer/view/router";
```

---

## 3. TypeScript and JSX config

In **`deno.json`** (or equivalent), enable automatic JSX and set
**`jsxImportSource`** so the compiler loads this package’s runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jsr:@dreamer/view"
  }
}
```

- In development you may set `jsxImportSource` to `"@dreamer/view"` as long as
  `imports` maps it to the same module.
- Types: use the package’s `JSX` namespace; if you maintain a separate
  **`jsx.d.ts`**, use `/// <reference types="..." />` or `compilerOptions.types`
  correctly.

---

## 4. Minimal runnable example (client)

Below uses **`mount`**: the first argument is a **function that returns UI**,
the second is the **DOM node** to mount into. `mount` clears the container first
(good for pure CSR).

```tsx
import { createSignal, mount } from "jsr:@dreamer/view/csr";
import type { VNode } from "jsr:@dreamer/view/types";

/**
 * Counter demo: Signal in JSX vs in events.
 */
function App(): VNode {
  const count = createSignal(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button
        type="button"
        onClick={() => {
          count.value = count.value + 1;
        }}
      >
        +1
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  mount(() => <App />, root);
}
```

**Notes:**

- **`{count}`** in text: the runtime treats **`SignalRef`** as a reactive
  interpolation subscription.
- In **`onClick` / `createEffect`**, prefer **`count.value`** for reads/writes
  vs JSX interpolation.

---

## 5. `createRoot` and manual `insert` (fine-grained control)

**`createRoot`** signature:
`createRoot(<T>(fn: (dispose: () => void) => T) => T)`. Use when you need an
explicit **`dispose()`** to tear down a subtree, or you pass the **parent node**
and **`insert`** yourself.

```tsx
import { createRoot, createSignal, insert } from "jsr:@dreamer/view/csr";
import type { VNode } from "jsr:@dreamer/view/types";

function App(): VNode {
  const n = createSignal(0);
  return (
    <div>
      <span>{n}</span>
      <button type="button" onClick={() => (n.value += 1)}>+</button>
    </div>
  );
}

const el = document.getElementById("root")!;

const stop = createRoot((dispose) => {
  insert(el, () => <App />);
  // Expose teardown: store `dispose` in module scope if needed
  return dispose;
});

// Later: full teardown
// stop();
```

---

## 6. Mount and hydration APIs

### 6.1 `mount(fn, container)`

- **`fn`**: `() => InsertValue`; the return value is passed to
  **`insert(container, …)`**.
- **Removes all child nodes** of the container and clears **`data-view-cloak`**
  if present.
- Teardown: the current implementation wires cleanup through **`createRoot`**
  internally; if you only use `mount` and need unload, prefer **`createRoot` +
  `insert`** so you can hold **`dispose`**.

### 6.2 `hydrate(fn, container, bindingsOrOptions?)`

- **`fn`**: same UI factory as on the client when activating.
- **`container`**: node that already contains server HTML.
- **`bindingsOrOptions`**: optional
  - legacy: `[number[], string][]` binding table; or
  - **`HydrateOptions`**: `{ bindings?, mismatchMode?, warnMismatch?, onMismatch? }`
- Calls **`stopHydration()`**, then **`internalHydrate`** with options, then
  **`insert`**.

#### `mismatchMode` (additive · **default `continue`**)

| Value | Behavior | Use |
|-------|----------|-----|
| **`continue`** (default) | Record mismatches; do not abort; keep SSR nodes | Production hybrid; **do not flip the 2.x library default** |
| **`assert`** | Throw on any mismatch | CI / strict gates — pass **explicitly** |
| **`remount`** | Clear container and CSR-remount on mismatch | Prefer a clean remount — pass **explicitly** |

Guide: [P1-2 hydration opt-in pilot](./P1-2-hydration-opt-in-pilot.md) /
[ZH](../zh-CN/P1-2-hydration-opt-in-pilot.md). examples `/runtime` demos all
three modes. Progressive / chunked hydration hooks are **not** shipped yet.

```tsx
import { hydrate } from "jsr:@dreamer/view/csr";

function RootView() {
  return <div id="app">...</div>;
}

const container = document.getElementById("root")!;
// default continue (mismatchMode may be omitted)
hydrate(() => <RootView />, container /* , bindingMap */);
// CI: hydrate(() => <RootView />, container, { bindings, mismatchMode: "assert" });
```

---

## 7. Reactive basics

### 7.1 `createSignal(initial, name?)`

**Yes: `createSignal` supports two common styles** (same return value; mix
freely).

| Style                   | Read               | Write                                    | Notes                                                                                            |
| ----------------------- | ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **`.value` / call**     | `s.value` or `s()` | `s.value = x`, `s(x)`, `s(prev => next)` | **`{s}`** in JSX subscribes as reactive interpolation; events often use **`.value`**             |
| **Tuple (Solid-style)** | `get()`            | `set(x)`, `set(prev => next)`            | `const [get, set] = createSignal(0)`; same as **`signal[0]` / `signal[1]`** and **`signal.set`** |

Details:

- **`signal.set`** is the same setter as the tuple’s **`set`**.
- Second arg **`name`** (optional): **`createSignal(0, "counter")`** names the
  signal for HMR/debug alignment with the internal registry (see `signal.ts`).

The **`Signal<T>`** return supports:

- **`signal.value` / `signal.value = x`**
- **`signal()`** read, **`signal(x)`** or **`signal(prev => …)`** write
  (Solid-like overloads)
- **Tuple destructuring**: `const [get, set] = createSignal(0)`; `get()` /
  `set(1)` (also iterable for `for…of`)

```tsx
import { createEffect, createMemo, createSignal } from "jsr:@dreamer/view/reactivity";

const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);

createEffect(() => {
  console.log("count =", count(), "double =", double());
});

setCount(1);
```

### 7.2 `createEffect(fn)` / `createRenderEffect(fn)`

- **`createEffect`**: standard side effect; dependencies collected by reading
  signals/memos inside **`fn`**; async microtask batching.
- **`createRenderEffect`**: more synchronous; used when DOM prop timing matters
  (also used internally for function props on native nodes).

```tsx
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view/reactivity";

const id = createSignal(0);

createEffect(() => {
  const current = id.value;
  const timer = setInterval(() => {
    console.log("tick for id", current);
  }, 1000);
  onCleanup(() => clearInterval(timer));
});
```

### 7.3 `createMemo(fn)` and alias `memo`

```tsx
import { createMemo, createSignal, memo } from "jsr:@dreamer/view/reactivity";

const n = createSignal(2);
const squared = createMemo(() => n() * n());
const same = memo(() => n() + 1); // same as createMemo
```

### 7.4 `batch(fn)`

While **`fn`** runs, notifications are merged to reduce redundant effect flushes
(works with the scheduler).

```tsx
import { batch, createSignal } from "jsr:@dreamer/view/reactivity";

const a = createSignal(0);
const b = createSignal(0);

batch(() => {
  a.value = 1;
  b.value = 2;
});
```

### 7.5 `untrack(fn)`

Reads inside **`fn`** do **not** track dependencies.

### 7.6 `onMount(fn)` / `onCleanup(fn)` / `onError(fn)` / `catchError(err)`

- **`onMount`**: built on **`createEffect` + `untrack`**; runs your logic once
  after mount.
- **`onCleanup`**: registers cleanup on the current Owner.
- **`onError` / `catchError`**: work with **ErrorBoundary** and Owner error
  propagation.

### 7.7 `createDeferred(signal)`, `useTransition`, `startTransition`

Deferred commits and transition updates (integrate with **`createEffect`**
scheduling).

```tsx
import { createDeferred, createSignal, useTransition } from "jsr:@dreamer/view/reactivity";

const source = createSignal(0);
const deferred = createDeferred(source);
const [isPending, startTransitionFromHook] = useTransition();

void startTransitionFromHook(() => {
  source.value = source.value + 1;
});
console.log("pending?", isPending());
```

### 7.8 `createSelector(source, compare?)`

For list selection etc.: keyed boolean signals to avoid recomputing the whole
list. **Note**: read `source` under an appropriate effect scope; wrong nesting
can subscribe the whole page to `source` (see source comments).

---

## 8. Owner and context helpers

```tsx
import {
  createOwner,
  createRoot,
  getOwner,
  runWithOwner,
} from "jsr:@dreamer/view/reactivity";

createRoot((dispose) => {
  const owner = getOwner();
  console.log("root owner", owner);
  // runWithOwner(someOwner, () => { ... }) runs under that subtree
});
```

---

## 9. DOM and `insert`

### 9.1 `insert(parent, value, current?, before?)`

- **Thunk**: if `value` is a function, unwrap until non-function or a Signal
  getter tagged with **`__VIEW_SIGNAL`**.
- **Text / number**: reuse text nodes when possible.
- **Array / array-like**: written as a **`DocumentFragment`**.
- **`null` / `undefined` / `boolean`**: clear the current placeholder.

### 9.2 `getDocument()` / `createRef()` / `setProperty` / `spread`

- **`getDocument()`**: returns **`document`** in the browser; **`null`** without
  DOM or before SSR injects a shadow document — avoids throwing on global
  **`document`**.
- **`createRef()`**: works with **`ref={refObj}`** so mount drives reactive
  updates.
- **`setProperty` / `spread` / `setAttribute`**: low-level prop spreading;
  compiler output may use these.

### 9.3 `template` / `walk` (compiler output / advanced)

- **`template(htmlString)`** + **`walk(root, path)`**: parse static HTML and
  address nodes; pairs with **`compileSource`** output.

---

## 10. Control-flow components (`/csr` or `/control-flow`)

### 10.1 `Show`

```tsx
import { createSignal, Show } from "jsr:@dreamer/view/csr";

const user = createSignal<{ name: string } | null>(null);

function Greeting() {
  return (
    <Show
      when={() => user.value}
      fallback={<p>Not signed in</p>}
    >
      {(u) => <p>Hello, {u.name}</p>}
    </Show>
  );
}
```

- **`when`**: **`() => T | false | null | undefined`**.
- **`children`**: static children **or** **`(item: T) => …`**.
- **`fallback`**: shown when the condition is false.

### 10.2 `For`

```tsx
import { createSignal, For } from "jsr:@dreamer/view/csr";

const items = createSignal([
  { id: "1", label: "A" },
  { id: "2", label: "B" },
]);

function List() {
  return (
    <For
      each={() => items.value}
      fallback={<p>Empty list</p>}
    >
      {(row, index) => (
        <div>
          #{index()} — {row.label}
        </div>
      )}
    </For>
  );
}
```

- **`each`** must be a **getter**: **`() => array`**. Do **not** use
  **`each={items.value}`** (one-shot snapshot, no subscription). You may write
  **`each={items}`** when **`items`** is a **Signal** whose **`items()`**
  returns an array.
- **`index`** is also a **getter**: **`() => number`**.

### 10.3 `Index`

Like **`For`**, but tracks by **index** (reuse nodes per slot). **`each`** is
still **`() => array`**; **`children(item, index)`** matches **`For`**; **no**
`fallback` (see type definitions).

### 10.4 `Switch` / `Match`

```tsx
import { createSignal, Match, Switch } from "jsr:@dreamer/view/csr";

const status = createSignal<"idle" | "loading" | "error">("idle");

function StatusView() {
  return (
    <Switch fallback={<span>Unknown</span>}>
      <Match when={() => status.value === "idle"}>
        <span>Ready</span>
      </Match>
      <Match when={() => status.value === "loading"}>
        <span>Loading…</span>
      </Match>
      <Match when={() => status.value === "error"}>
        <span>Error</span>
      </Match>
    </Switch>
  );
}
```

### 10.5 `Dynamic`

```tsx
import { createSignal, Dynamic } from "jsr:@dreamer/view/csr";

const Tag = createSignal<"h1" | "h2">("h1");

function Heading(props: { text: string }) {
  return (
    <Dynamic
      component={() => Tag.value}
      className="title"
    >
      {props.text}
    </Dynamic>
  );
}
```

- **`component`**: string tag **or** component function; when reactive use a
  **zero-arg function** or **Signal** (not **`tag.value`** as a one-shot
  snapshot).

### 10.6 `lazy`

```tsx
import { lazy, Suspense } from "jsr:@dreamer/view/csr";

const Heavy = lazy(() => import("./Heavy.tsx"));

function Page() {
  return (
    <Suspense fallback={<p>Loading module…</p>}>
      <Heavy />
    </Suspense>
  );
}
```

---

## 11. `Suspense` and `createResource`

### 11.1 Basic usage

```tsx
import { ErrorBoundary, Suspense } from "jsr:@dreamer/view/csr";
import { createResource } from "jsr:@dreamer/view/resource";

/**
 * Create the resource in module or parent scope so it is not recreated every render.
 */
const profile = createResource(async () => {
  const res = await fetch("/api/me");
  if (!res.ok) throw new Error("Failed to load");
  return res.json() as Promise<{ name: string }>;
});

function ProfileCard() {
  const data = profile();
  return <div>User: {data?.name}</div>;
}

export function PageWithSuspense() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>{String(err)}</p>
          <button type="button" onClick={reset}>Retry</button>
        </div>
      )}
    >
      <Suspense fallback={<p>Loading…</p>}>
        <ProfileCard />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### 11.2 `createResource(source, fetcher)` with dependencies

```tsx
import { createSignal } from "jsr:@dreamer/view/reactivity";
import { createResource } from "jsr:@dreamer/view/resource";

const userId = createSignal(1);

const user = createResource(
  () => userId.value,
  async (id, { signal }) => {
    const r = await fetch(`/api/user/${id}`, { signal });
    return r.json();
  },
);
```

Pass **`signal`** into `fetch` (or your client) so a source change / `refetch`
cancels the previous in-flight request. Ignoring the second argument keeps the
**same default behavior** as before.

### 11.3 Optional outer `AbortSignal` and fields

```tsx
const ac = new AbortController();
const page = createResource(
  () => routeId(),
  (id, { signal }) => fetch(`/api/page/${id}`, { signal }).then((r) => r.json()),
  { signal: ac.signal }, // e.g. abort on route leave
);
// ac.abort();
```

- **`resource()`**: read data; throws if there is an **error** (handled by
  **ErrorBoundary**). Abort / cancel does **not** set `error`.
- **`resource.loading()`** / **`resource.error()`**
- **`resource.mutate(value)`** / **`resource.refetch()`** (refetch aborts the
  previous load)

The framework ensures registration with the current **Suspense** when calling
**`resource()` / `resource.loading()`**, including after **ErrorBoundary**
reset.

### 11.4 Upper-layer inflight dedupe (not an HTTP cache)

`createResource` does **not** dedupe across instances. Use
**`createInflightDedupe()`** when several callers should share one in-flight
Promise for the same key until it settles:

```tsx
import {
  createInflightDedupe,
  createResource,
} from "jsr:@dreamer/view/resource";

const inflight = createInflightDedupe();

const user = createResource(
  () => userId.value,
  (id, { signal }) =>
    inflight(`user:${id}`, () =>
      fetch(`/api/user/${id}`, { signal }).then((r) => r.json())
    ),
);
```

This is **not** HTTP caching / SWR. If one shared consumer aborts, others on the
same key may see that abort — use distinct keys when you need independent
cancellation.

---

## 12. `ErrorBoundary`

```tsx
import { createSignal, ErrorBoundary } from "jsr:@dreamer/view/csr";

const key = createSignal(0);

function MaybeFail() {
  if (key.value < 0) throw new Error("invalid key");
  return <span>ok</span>;
}

export function Guarded() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>{String(err)}</p>
          <button
            type="button"
            onClick={() => {
              key.value = 1;
              reset();
            }}
          >
            Fix and retry
          </button>
        </div>
      )}
      resetKeys={() => [key.value]}
    >
      <MaybeFail />
    </ErrorBoundary>
  );
}
```

- **`resetKeys`**: after an error, clears and retries the subtree only when the
  return value differs from the last run by **Object.is** per item.

---

## 13. `Portal` and `createPortal`

### 13.1 Declarative `Portal`

```tsx
import { createSignal, Portal } from "jsr:@dreamer/view/csr";

const open = createSignal(false);

export function ModalDemo() {
  return (
    <div>
      <button type="button" onClick={() => (open.value = !open.value)}>
        Toggle
      </button>
      <Portal mount={document.body}>
        {() => open.value && <div className="modal">Overlay</div>}
      </Portal>
    </div>
  );
}
```

- **`mount`** is optional; default **`document.body`**.

### 13.2 Imperative `createPortal` (`jsr:@dreamer/view/portal`)

```tsx
import { createPortal } from "jsr:@dreamer/view/portal";
import { createSignal } from "jsr:@dreamer/view/reactivity";

const box = document.getElementById("modal-root")!;
const visible = createSignal(true);

const root = createPortal(
  () => (visible.value ? <div className="toast">Notice</div> : null),
  box,
);

// root.unmount();
```

---

## 14. `createContext` / `useContext`

```tsx
import { createContext, useContext } from "jsr:@dreamer/view/reactivity";

const ThemeCtx = createContext<"light" | "dark">("light");

function Panel() {
  const theme = useContext(ThemeCtx);
  return <div className={theme}>Panel</div>;
}

export function App() {
  const mode = "dark" as const;
  return (
    <ThemeCtx.Provider value={mode}>
      <Panel />
    </ThemeCtx.Provider>
  );
}
```

**`Provider`** is a **transparent** component: no new Owner; writes context on
the current Owner.

---

## 15. `createStore` / `produce` / `reconcile`

### 15.0 How many shapes? How to use?

**Yes: object-root `createStore` also has two main usage shapes**, plus several
**overloads** (same deep proxy mechanism).

**Shapes (object root only; array root below)**

| Shape           | Syntax                                                   | Read / write                                                                                                  |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Whole proxy** | `const store = createStore({ count: 0 })`                | **`store.count`**; **`store.setState(...)`**                                                                  |
| **Tuple**       | `const [getStore, setState] = createStore({ count: 0 })` | **`getStore()`** returns the **same** proxy; **`setState("count", 1)`** or **`setState(produce(...))`**, etc. |

**`createStore` overloads**

1. **`createStore(initialState)`** — most common.
2. **`createStore(initialState, { name?, persist? })`** — optional registry name
   and **localStorage**-style persistence.
3. **`createStore(storeName, initialState, persist?)`** — **named singleton**
   (global registry key `storeName`) + optional persistence.

**Array root (state root is an array)**

- You get an **array proxy with `setState`**; types **do not** intersect with
  `[get, set]` (so `list[0]` is not mistaken for tuple items).
- Use **`.setState`**, index assignment, etc.; **do not** destructure like the
  object tuple.

Sections **15.1 / 15.2** expand proxy vs tuple examples.

### 15.1 Object root: proxy + `setState`

```tsx
import { createEffect, createStore, produce } from "jsr:@dreamer/view/reactivity";

const store = createStore({
  user: { name: "Ada", age: 36 },
  tags: ["ts", "deno"],
});

createEffect(() => {
  console.log(store.user.name);
});

store.user.name = "Bob";
store.setState({ tags: [...store.tags, "bun"] });
store.setState(
  produce((draft) => {
    draft.user.age += 1;
  }),
);
```

### 15.2 Tuple: `[getStore, setState]`

```tsx
import { createStore } from "jsr:@dreamer/view/reactivity";

const [getStore, setState] = createStore({ count: 0 });

setState("count", 1);
console.log(getStore().count);
```

### 15.3 Named singleton + persistence

**Form A: three-arg `createStore(storeName, initialState, persist?)`**

See **`PersistOptions<T>`** in **`reactivity/store.ts`**:

| Field             | Required | Purpose                                                                                                                                                                        |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`key`**         | yes      | Storage key                                                                                                                                                                    |
| **`storage`**     | optional | Must implement **`getItem` / `setItem`**; if omitted and **`globalThis.localStorage`** exists it defaults; otherwise persistence is inactive (no throw, but nothing persisted) |
| **`serialize`**   | optional | **`(state: T) => string`**, default **`JSON.stringify`**                                                                                                                       |
| **`deserialize`** | optional | **`(str: string) => T`**, default **`JSON.parse`** (assert types yourself)                                                                                                     |

**Full example aligned with `view/examples/src/stores/user.ts`:**

```tsx
import { createStore } from "@dreamer/view/reactivity";

export const USER_STORE_PERSIST_KEY = "view-examples-user";

export interface UserState {
  name: string;
  role: "guest" | "user" | "admin";
  loginCount: number;
  lastLogin: string | null;
}

export const userStore = createStore(
  "examples-user-store",
  {
    name: "Guest",
    role: "guest",
    loginCount: 0,
    lastLogin: null,
  } as UserState,
  {
    key: USER_STORE_PERSIST_KEY,
    storage: globalThis.localStorage,
    serialize: (state: UserState) => JSON.stringify(state),
    deserialize: (str: string) => JSON.parse(str) as UserState,
  },
);
```

**Minimal** (framework defaults: only **`key`**, rest default):

```tsx
import { createStore } from "jsr:@dreamer/view/reactivity";

export const PERSIST_KEY = "my-app-user";

export const userStore = createStore(
  "my-app-user-store",
  {
    name: "Guest",
    role: "guest",
    loginCount: 0,
    lastLogin: null as string | null,
  },
  { key: PERSIST_KEY },
);
```

For tests or SSR, swap **`storage`** for a mock/in-memory implementation without
changing **`serialize`** unless you need a custom format.

**Form B: second argument is an options object (same capabilities; pick one
style)**

```tsx
import { createStore } from "jsr:@dreamer/view/reactivity";

const prefs = createStore(
  { theme: "light" as const },
  {
    name: "app-prefs",
    persist: { key: "prefs-v1", storage: globalThis.localStorage },
  },
);
```

### 15.4 `reconcile`

Partial list/tree updates with stable references (use with **`setState`**).

---

## 16. `createForm` (controlled forms)

### 16.1 Capabilities and limits

| Item                   | Notes                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signature**          | **`createForm(initialValues, options?)`** — second arg optional; omit for legacy behavior                                                                  |
| **Two-way binding**    | **`field(name, options?)`** → default **`value` + `onInput`**; `{ as: "checkbox" }` uses **`checked`**                                                     |
| **Rules**              | **`options.rules`**: per field **`(value, data) => string                                                                                                  |
| **When to validate**   | **`validateOn`**: **`submit`** (default), **`change`**, **`blur`**, or an array                                                                            |
| **API**                | **`validate()`** whole form, **`validateField(name)`** one field, **`handleSubmit(onValid, onInvalid?)`**                                                  |
| **No built-in schema** | Not wired to Zod; use **`messageFromSafeParse`** or call parsers inside **`rules`** / manage **`errors`**                                                  |
| **Control types**      | **`field(name, { as })`**: text by default; **`checkbox` / `select` / `textarea` / `number`**; **`produce` on `data` does not auto-trigger `validateOn: change`** |
| **Schema bridge**      | No built-in Zod; **`messageFromSafeParse(safeParseResult)`** maps Zod-like results to `rules` messages |

Types exported from the main entry: **`CreateFormOptions`**,
**`FormValidateOn`**, **`FormFieldRule`**.

### 16.2 No rules (minimal, same as older docs)

```tsx
import { createForm } from "jsr:@dreamer/view/form";

export function LoginForm() {
  const form = createForm({ username: "", password: "" });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        console.log(form.data.username, form.data.password);
      }}
    >
      <input type="text" {...form.field("username")} />
      <input type="password" {...form.field("password")} />
      <button type="submit">Sign in</button>
      <button type="button" onClick={() => form.reset()}>
        Reset
      </button>
    </form>
  );
}
```

- **`form.validate()`** with no **`rules`**: clears all **`errors`** and returns
  **`true`**.
- **`form.data` / `form.errors`** are **Store**; **`form.produce`** updates
  **`data`**.

### 16.3 Recommended: `rules` + validate on submit by default

```tsx
import { createForm } from "jsr:@dreamer/view/form";

export function LoginForm() {
  const form = createForm(
    { username: "", password: "" },
    {
      rules: {
        username: (v) => (String(v).trim() ? null : "Username required"),
        password: (
          v,
        ) => (String(v).length >= 6 ? null : "At least 6 characters"),
      },
      // omitting validateOn is like ["submit"]
    },
  );

  return (
    <form onSubmit={form.handleSubmit((data) => console.log(data))}>
      <input type="text" {...form.field("username")} />
      {form.errors.username && <span>{form.errors.username}</span>}
      <input type="password" {...form.field("password")} />
      {form.errors.password && <span>{form.errors.password}</span>}
      <button type="submit">Sign in</button>
    </form>
  );
}
```

- **`handleSubmit(onValid, onInvalid?)`**: **`preventDefault`** →
  **`validate()`** → on success **`onValid(getDataSnapshot())`** (**shallow**
  plain object copy, not a Proxy).
- Or hand-roll:
  **`onSubmit={(e) => { e.preventDefault(); if (!form.validate()) return; … }}`**.

### 16.4 `validateOn: "change"` / `"blur"` / arrays

- **`change`**: after **`onInput`** (or **`updateField`**) on a field, if that
  field has a **`rule`**, run **`validateField(name)`**.
- **`blur`**: if the field has a **`rule`**, **`field()`** includes **`onBlur`**
  to validate on blur.
- Example: **`validateOn: ["change", "blur", "submit"]`**.

```tsx
const form = createForm(
  { code: "" },
  {
    rules: {
      code: (v) => (String(v).length >= 3 ? null : "At least 3 characters"),
    },
    validateOn: "change",
  },
);
```

### 16.5 Cross-field rules (second arg `data`)

```tsx
const form = createForm(
  { password: "", password2: "" },
  {
    rules: {
      password: (v) => (String(v).length >= 6 ? null : "At least 6 characters"),
      password2: (_v, d) =>
        d.password === d.password2 ? null : "Passwords do not match",
    },
  },
);
```

**`validate()`** runs rules in **`initialValues` key order**; put dependencies
earlier in the object literal if order matters.

### 16.6 checkbox / select / textarea / number

Second arg is optional; **omit it for legacy text `value + onInput`**.

```tsx
import { createForm } from "jsr:@dreamer/view/form";

const form = createForm(
  { role: "user", agree: false, age: 18, note: "" },
  {
    rules: {
      agree: (v) => (v ? null : "Please accept"),
      role: (v) => (v ? null : "Pick a role"),
    },
  },
);

<select {...form.field("role", { as: "select" })}>
  <option value="user">User</option>
  <option value="admin">Admin</option>
</select>

<label>
  <input type="checkbox" {...form.field("agree", { as: "checkbox" })} />
  I agree
</label>

<textarea {...form.field("note", { as: "textarea" })} />
<input type="number" {...form.field("age", { as: "number" })} />
```

- **`checkbox`**: binds **`checked`** (boolean); exposes **`onInput` / `onChange`**.
- **`select` / `textarea` / `text`**: bind **`value`**; `select` also sets **`onChange`**.
- **`number`**: writes `Number(raw)`; empty string stays `""` for required rules.

### 16.7 Schema bridge (optional; no Zod runtime dependency)

Call any `safeParse` inside **`rules`**, then **`messageFromSafeParse`**:

```tsx
import { createForm, messageFromSafeParse } from "jsr:@dreamer/view/form";
// import { z } from "zod"; // optional

const form = createForm(
  { email: "" },
  {
    rules: {
      // email: (v) => messageFromSafeParse(z.string().email().safeParse(v)),
      email: (v) =>
        messageFromSafeParse(
          String(v).includes("@")
            ? { success: true as const }
            : {
              success: false as const,
              error: { issues: [{ message: "Invalid email" }] },
            },
        ),
    },
  },
);
```

### 16.8 Possible further extensions

- Array fields / nested error paths (today **`errors` aligns with top-level keys).
- Deeper schema-library wrappers (this package only ships **`messageFromSafeParse`**).

---

## 17. Router: `createRouter` / `mountWithRouter` / `Link` / `useRouter`

### 17.1 Creating a router

```tsx
import {
  createRouter,
  Link,
  mountWithRouter,
  useRouter,
} from "jsr:@dreamer/view/router";
import type { VNode } from "jsr:@dreamer/view/types";

function Home(): VNode {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/user/42">User 42</Link>
    </div>
  );
}

function UserPage(props: { params: Record<string, string> }): VNode {
  return <p>User ID: {props.params.id}</p>;
}

const router = createRouter({
  basePath: "",
  routes: [
    { path: "/", component: Home },
    { path: "/user/:id", component: UserPage },
  ],
  notFound: { path: "*", component: () => <p>404</p> },
  scroll: "top",
  beforeEach: (to, from) => {
    console.log("navigate", to.path, from?.path);
    return true;
  },
});

mountWithRouter("#root", router);
```

- **`createRouter`** also supports **`createRouter(routes[])`** shorthand.
- **Dynamic segment**: **`:id`**; **suffix capture**: **`/files/*`** →
  **`params["*"]`**.
- **`router.navigate` / `replace`**: return **`Promise<void>`**, resolve after
  **`beforeEach`** and **history** commit.
- **`Link`**: **`href`** goes through **`resolveHref`** with **`basePath`**;
  **`replace`** prop uses **`replace`**.
- **`useRouter()`**: current singleton (after **`createRouter`**, same app).
- **Current match**: **`router.match()`** (**`params` / `query` / `pattern` /
  `route`**).
- On creation the router registers **`popstate`** and, when
  **`interceptLinks !== false`**, document **click capture** for same-origin
  **`a`**; **`Link`** sets **`data-view-link`** for delegation.

### 17.2 Rendering the active page inside a layout

Common pattern: root shell calls **`router.render()`** for the current route
(nested **layouts**, lazy routes, etc.).

```tsx
import { useRouter } from "jsr:@dreamer/view/router";

export function Shell() {
  const router = useRouter();
  return (
    <main>
      {router.render()}
    </main>
  );
}
```

---

## 18. SSR (`jsr:@dreamer/view/ssr`)

### 18.1 `renderToString`

```tsx
import { jsx } from "jsr:@dreamer/view/jsx-runtime";
import { renderToString } from "jsr:@dreamer/view/ssr";

const html = renderToString(() =>
  jsx("div", { id: "root", children: "hello" })
);
```

### 18.2 `renderToStringAsync` / `renderToStream`

Work with **`registerSSRPromise`** and internal queues so async data can flush
before output (see **`server.ts`**).

### 18.3 `generateHydrationScript(id, bindingMap)`

Emits a **`<script type="module">`** snippet; **whether it matches client
`hydrate` and your bundle** depends on your pipeline — verify against
**`hydrate(fn, container, bindings?)`** when integrating.

### 18.4 Other exports

- **`isServer`**, **`enterSSRDomScope` / `leaveSSRDomScope`**,
  **`queueSsrAsyncTask`**, **`registerSSRPromise`**, etc.: advanced SSR
  pipelines and tests.

---

## 19. Compiler subpath (`jsr:@dreamer/view/compiler`)

```ts
import { compileSource } from "jsr:@dreamer/view/compiler";

const out = compileSource(sourceTsx, "App.tsx", {
  insertImportPath: "jsr:@dreamer/view",
  hydration: false,
  generate: "dom",
  hmr: false,
});
```

- Prepends imports for **`template` / `insert` / `walk` / `setProperty` /
  `spread`** (and **`memo`**, **`createHMRProxy`** when needed).
- For toolchains turning TSX into **`insert`**-aligned code at build time.

---

## 20. Optimize subpath (`jsr:@dreamer/view/optimize`)

```ts
import { createOptimizePlugin, optimize } from "jsr:@dreamer/view/optimize";

const code = optimize(bundleSource);
// createOptimizePlugin(/\.js$/) for @dreamer/esbuild plugin chains
```

---

## 21. HMR (`createHMRProxy`)

When **`VIEW_DEV`** is set globally in development,
**`createHMRProxy(id, Component)`** registers a hot-swappable wrapper; usually
injected by **CLI / compiler**, rarely handwritten.

---

## 22. Performance: render thunk (avoid root effect over-subscription)

If **`Show`**, function props, or local **Signals** live directly in a parent’s
returned JSX, the **parent `insert` effect** may subscribe to child state and
**re-run the whole parent**. Fix: **`return () => ( … JSX … )`** so the dynamic
subtree runs in an **inner effect**.

Full author conventions (Memo / ref / top-level Signal reads / Context):
**[P0-4 component author guide](./P0-4-component-author-guide.md)** /
[ZH](../zh-CN/P0-4-component-author-guide.md).

```tsx
import { createSignal } from "jsr:@dreamer/view/reactivity";

function ModalHost() {
  const open = createSignal(false);
  return () => (
    <div>
      <button type="button" onClick={() => (open.value = !open.value)}>
        Toggle
      </button>
      {open.value && <div className="modal">Content</div>}
    </div>
  );
}
```

---

## 23. `view-cli init` layout (summary)

| Path                     | Role                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `view.config.ts`         | Dev server, build, HMR, CSS, etc.                                                                               |
| `src/main.tsx`           | Entry: `createRouter` + `mountWithRouter`                                                                       |
| `src/views/`             | File-based routes; **`_app.tsx` / `_layout.tsx` / `_loading.tsx` / `_404.tsx` / `_error.tsx`** are conventional |
| `src/router/routers.tsx` | **Generated** (do not edit by hand) from **`src/views`** scan                                                   |

---

## 24. Security

- **`dangerouslySetInnerHTML` / `innerHTML`**: trusted content only.
- Escape or strictly whitelist user input in SSR output.

---

## 25. Test report and changelog

- **Current framework analysis** (Chinese canonical): [`../zh-CN/view-framework-analysis.md`](../zh-CN/view-framework-analysis.md)
- **Analysis doc status** (obsolete / drifted index): [`analysis-doc-status.md`](./analysis-doc-status.md) · [`../zh-CN/分析文档状态.md`](../zh-CN/分析文档状态.md)
- **P0-1 profiling / bench CI**: [`P0-1-profiling-and-bench-ci.md`](./P0-1-profiling-and-bench-ci.md) · [`../zh-CN/P0-1-profiling-and-bench-ci.md`](../zh-CN/P0-1-profiling-and-bench-ci.md)
- **P0-2: consumer / examples bundle analyze**: [`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md) · [`../zh-CN/P0-2-consumer-bundle-analyze.md`](../zh-CN/P0-2-consumer-bundle-analyze.md)
- **P1-1: main-entry barrel deprecation preview (Strategy A)**: [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md) · [`../zh-CN/P1-1-main-entry-deprecation-preview.md`](../zh-CN/P1-1-main-entry-deprecation-preview.md)
- **P1-2: hydration opt-in pilot (`mismatchMode`)**: [`P1-2-hydration-opt-in-pilot.md`](./P1-2-hydration-opt-in-pilot.md) · [`../zh-CN/P1-2-hydration-opt-in-pilot.md`](../zh-CN/P1-2-hydration-opt-in-pilot.md)
- **P0: examples browser E2E into CI**: [`P0-e2e-into-ci.md`](./P0-e2e-into-ci.md) · [`../zh-CN/P0-e2e-into-ci.md`](../zh-CN/P0-e2e-into-ci.md)
- **P0-3 compiler static coverage / golden**: [`P0-3-compiler-static-coverage-and-golden.md`](./P0-3-compiler-static-coverage-and-golden.md) · [`../zh-CN/P0-3-compiler-static-coverage-and-golden.md`](../zh-CN/P0-3-compiler-static-coverage-and-golden.md)
- **P0-4 component author guide** (Memo / ref / subscription boundaries): [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) · [`../zh-CN/P0-4-component-author-guide.md`](../zh-CN/P0-4-component-author-guide.md)
- **3.0 planning memo** (Chinese): [`../zh-CN/3.0.0-规划分析.md`](../zh-CN/3.0.0-规划分析.md)

- **Latest [2.1.0] — 2026-07-22**:
  - **Added**: fine-grained subpaths (`/reactivity`, `/csr`, `/router`,
    `/control-flow`, …); `HydrateOptions` + `mismatchMode`
    (`continue`/`assert`/`remount`); `sideEffects: false`.
  - **Changed**: compiler skips arrow wrappers for static component props;
    static `&&`/`||` fold into templates. Main barrel still compatible.
  - **Tests**: Deno unit+integration **394** / Bun **326** / 0 failed.
  - Full history: **[docs/en-US/CHANGELOG.md](./CHANGELOG.md)**.
- Tests: **[docs/en-US/TEST_REPORT.md](./TEST_REPORT.md)**
  (**2026-07-22**: Deno unit+integration **394** / Bun **326**, 0 failed);
  Chinese: **[docs/zh-CN/TEST_REPORT.md](./docs/zh-CN/TEST_REPORT.md)**.
- Chinese changelog: **[docs/zh-CN/CHANGELOG.md](../zh-CN/CHANGELOG.md)**.

---

## 26. License

Apache License 2.0 — see **[LICENSE](../../LICENSE)** in the repo root.

---

<div align="center"><strong>Made with ❤️ by Dreamer Team</strong></div>
