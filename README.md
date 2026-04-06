# @dreamer/view (English)

> **Fine-grained reactive view library**: no virtual DOM; **Signal / Effect** track dependencies, and **`insert`** applies minimal updates to real DOM. Supports **CSR, SSR, streaming output, and hydration**; includes **router, async Resource, Store, forms, Context, Suspense / ErrorBoundary**, and more.
> **Chinese mirror** (same section structure): **[docs/zh-CN/README.md](../zh-CN/README.md)**; repo root **[README.md](../../README.md)** is a short index.

[中文](../zh-CN/README.md) | English

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-290%20%2F%20229%20passed%20(Deno%2FBun)-brightgreen)](./TEST_REPORT.md)

---

## 1. Overall architecture (read before APIs)

1. **No virtual DOM**
   Updates do not go through a full-tree diff. `jsx` / `jsxs` return a **thunk**: `() => actual UI` (often typed as `VNode`), evaluated inside `insert` or an effect and subscribed to **Signals**.

2. **Owner tree**
   Each component function runs under its **own Owner** (except transparent `Provider`). `createRoot`, `onCleanup`, `onError`, `useContext`, etc. attach to the Owner chain.

3. **Core render API: `insert(parent, value, current?, before?)`**
   - If `value` is a function, it is wrapped in **`createEffect`**, re-evaluated, and the DOM is patched.
   - On **native elements**, non-`on*` **function props** use **`createRenderEffect`** (e.g. `className={() => ...}`, `value={() => ...}`).

4. **Subpaths match `deno.json` exactly**
   On JSR this package registers **only** the export keys listed under **Installation** below; there are **no** extra entry points such as `/store`, `/router`, or `/csr` — `createStore`, `createRouter`, etc. live on the **`jsr:@dreamer/view`** main entry.

---

## 2. Installation

### 2.1 Global CLI (`view-cli`)

```bash
deno run -A jsr:@dreamer/view/setup
```

After installation you can use `view-cli init`, `view-cli dev`, `view-cli build`, etc. (see `view-cli --help`).

### 2.2 Add as a project dependency

**Deno**

```bash
deno add jsr:@dreamer/view
```

**Bun**

```bash
bunx jsr add @dreamer/view
```

### 2.3 `exports` map (same as `view/deno.json`)

| Subpath | Purpose |
| --- | --- |
| `jsr:@dreamer/view` | **Main**: reactivity, runtime, `insert`, `mount` / `hydrate`, router, Resource, Store, control flow, forms, Suspense, HMR, etc. |
| `jsr:@dreamer/view/types` | Shared types: `VNode`, `JSXRenderable`, etc. |
| `jsr:@dreamer/view/cli` | CLI implementation (toolchain) |
| `jsr:@dreamer/view/setup` | Global install script entry |
| `jsr:@dreamer/view/jsx-runtime` | Automatic JSX runtime (`jsx` / `jsxs` / `Fragment`) |
| `jsr:@dreamer/view/jsx-dev-runtime` | Dev JSX entry (same source as jsx-runtime; satisfies bundlers that resolve `jsxDEV`) |
| `jsr:@dreamer/view/portal` | **`createPortal` only** (optional split import) |
| `jsr:@dreamer/view/compiler` | **`compileSource` / `transformJSX`**, etc. |
| `jsr:@dreamer/view/optimize` | **`optimize` / `createOptimizePlugin`** (build-time string compression, etc.) |
| `jsr:@dreamer/view/ssr` | **`renderToString` / `renderToStringAsync` / `renderToStream`**, `generateHydrationScript`, and SSR helpers |

Example optional subpaths:

```bash
deno add jsr:@dreamer/view
deno add jsr:@dreamer/view/ssr
deno add jsr:@dreamer/view/compiler
deno add jsr:@dreamer/view/optimize
deno add jsr:@dreamer/view/portal
deno add jsr:@dreamer/view/types
```

---

## 3. TypeScript and JSX config

In **`deno.json`** (or equivalent), enable automatic JSX and set **`jsxImportSource`** so the compiler loads this package’s runtime:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jsr:@dreamer/view"
  }
}
```

- In development you may set `jsxImportSource` to `"@dreamer/view"` as long as `imports` maps it to the same module.
- Types: use the package’s `JSX` namespace; if you maintain a separate **`jsx.d.ts`**, use `/// <reference types="..." />` or `compilerOptions.types` correctly.

---

## 4. Minimal runnable example (client)

Below uses **`mount`**: the first argument is a **function that returns UI**, the second is the **DOM node** to mount into. `mount` clears the container first (good for pure CSR).

```tsx
import { createSignal, mount } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

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

- **`{count}`** in text: the runtime treats **`SignalRef`** as a reactive interpolation subscription.
- In **`onClick` / `createEffect`**, prefer **`count.value`** for reads/writes vs JSX interpolation.

---

## 5. `createRoot` and manual `insert` (fine-grained control)

**`createRoot`** signature: `createRoot(<T>(fn: (dispose: () => void) => T) => T)`.
Use when you need an explicit **`dispose()`** to tear down a subtree, or you pass the **parent node** and **`insert`** yourself.

```tsx
import { createRoot, createSignal, insert } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

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

- **`fn`**: `() => InsertValue`; the return value is passed to **`insert(container, …)`**.
- **Removes all child nodes** of the container and clears **`data-view-cloak`** if present.
- Teardown: the current implementation wires cleanup through **`createRoot`** internally; if you only use `mount` and need unload, prefer **`createRoot` + `insert`** so you can hold **`dispose`**.

### 6.2 `hydrate(fn, container, bindings?)`

- **`fn`**: same UI factory as on the client when activating.
- **`container`**: node that already contains server HTML.
- **`bindings`**: optional **`[number[], string][]`** hydration binding table from compiled output; omit for hand-written CSR.
- Calls **`stopHydration()`**, then **`internalHydrate(container, bindings)`**, then **`insert`**.

```tsx
import { hydrate } from "jsr:@dreamer/view";

function RootView() {
  return <div id="app">...</div>;
}

const container = document.getElementById("root")!;
hydrate(() => <RootView />, container /* , bindingMap */);
```

---

## 7. Reactive basics

### 7.1 `createSignal(initial, name?)`

**Yes: `createSignal` supports two common styles** (same return value; mix freely).

| Style | Read | Write | Notes |
| --- | --- | --- | --- |
| **`.value` / call** | `s.value` or `s()` | `s.value = x`, `s(x)`, `s(prev => next)` | **`{s}`** in JSX subscribes as reactive interpolation; events often use **`.value`** |
| **Tuple (Solid-style)** | `get()` | `set(x)`, `set(prev => next)` | `const [get, set] = createSignal(0)`; same as **`signal[0]` / `signal[1]`** and **`signal.set`** |

Details:

- **`signal.set`** is the same setter as the tuple’s **`set`**.
- Second arg **`name`** (optional): **`createSignal(0, "counter")`** names the signal for HMR/debug alignment with the internal registry (see `signal.ts`).

The **`Signal<T>`** return supports:

- **`signal.value` / `signal.value = x`**
- **`signal()`** read, **`signal(x)`** or **`signal(prev => …)`** write (Solid-like overloads)
- **Tuple destructuring**: `const [get, set] = createSignal(0)`; `get()` / `set(1)` (also iterable for `for…of`)

```tsx
import { createEffect, createMemo, createSignal } from "jsr:@dreamer/view";

const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);

createEffect(() => {
  console.log("count =", count(), "double =", double());
});

setCount(1);
```

### 7.2 `createEffect(fn)` / `createRenderEffect(fn)`

- **`createEffect`**: standard side effect; dependencies collected by reading signals/memos inside **`fn`**; async microtask batching.
- **`createRenderEffect`**: more synchronous; used when DOM prop timing matters (also used internally for function props on native nodes).

```tsx
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view";

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
import { createMemo, memo, createSignal } from "jsr:@dreamer/view";

const n = createSignal(2);
const squared = createMemo(() => n() * n());
const same = memo(() => n() + 1); // same as createMemo
```

### 7.4 `batch(fn)`

While **`fn`** runs, notifications are merged to reduce redundant effect flushes (works with the scheduler).

```tsx
import { batch, createSignal } from "jsr:@dreamer/view";

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

- **`onMount`**: built on **`createEffect` + `untrack`**; runs your logic once after mount.
- **`onCleanup`**: registers cleanup on the current Owner.
- **`onError` / `catchError`**: work with **ErrorBoundary** and Owner error propagation.

### 7.7 `createDeferred(signal)`, `useTransition`, `startTransition`

Deferred commits and transition updates (integrate with **`createEffect`** scheduling).

```tsx
import { createDeferred, createSignal, useTransition } from "jsr:@dreamer/view";

const source = createSignal(0);
const deferred = createDeferred(source);
const [isPending, startTransitionFromHook] = useTransition();

void startTransitionFromHook(() => {
  source.value = source.value + 1;
});
console.log("pending?", isPending());
```

### 7.8 `createSelector(source, compare?)`

For list selection etc.: keyed boolean signals to avoid recomputing the whole list.
**Note**: read `source` under an appropriate effect scope; wrong nesting can subscribe the whole page to `source` (see source comments).

---

## 8. Owner and context helpers

```tsx
import {
  createRoot,
  getOwner,
  runWithOwner,
  createOwner,
} from "jsr:@dreamer/view";

createRoot((dispose) => {
  const owner = getOwner();
  console.log("root owner", owner);
  // runWithOwner(someOwner, () => { ... }) runs under that subtree
});
```

---

## 9. DOM and `insert`

### 9.1 `insert(parent, value, current?, before?)`

- **Thunk**: if `value` is a function, unwrap until non-function or a Signal getter tagged with **`__VIEW_SIGNAL`**.
- **Text / number**: reuse text nodes when possible.
- **Array / array-like**: written as a **`DocumentFragment`**.
- **`null` / `undefined` / `boolean`**: clear the current placeholder.

### 9.2 `getDocument()` / `createRef()` / `setProperty` / `spread`

- **`getDocument()`**: returns **`document`** in the browser; **`null`** without DOM or before SSR injects a shadow document — avoids throwing on global **`document`**.
- **`createRef()`**: works with **`ref={refObj}`** so mount drives reactive updates.
- **`setProperty` / `spread` / `setAttribute`**: low-level prop spreading; compiler output may use these.

### 9.3 `template` / `walk` (compiler output / advanced)

- **`template(htmlString)`** + **`walk(root, path)`**: parse static HTML and address nodes; pairs with **`compileSource`** output.

---

## 10. Control-flow components (main entry)

### 10.1 `Show`

```tsx
import { Show, createSignal } from "jsr:@dreamer/view";

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
import { For, createSignal } from "jsr:@dreamer/view";

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

- **`each`** must be a **getter**: **`() => array`**. Do **not** use **`each={items.value}`** (one-shot snapshot, no subscription). You may write **`each={items}`** when **`items`** is a **Signal** whose **`items()`** returns an array.
- **`index`** is also a **getter**: **`() => number`**.

### 10.3 `Index`

Like **`For`**, but tracks by **index** (reuse nodes per slot). **`each`** is still **`() => array`**; **`children(item, index)`** matches **`For`**; **no** `fallback` (see type definitions).

### 10.4 `Switch` / `Match`

```tsx
import { Match, Switch, createSignal } from "jsr:@dreamer/view";

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
import { Dynamic, createSignal } from "jsr:@dreamer/view";

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

- **`component`**: string tag **or** component function; when reactive use a **zero-arg function** or **Signal** (not **`tag.value`** as a one-shot snapshot).

### 10.6 `lazy`

```tsx
import { Suspense, lazy } from "jsr:@dreamer/view";

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
import {
  Suspense,
  createResource,
  ErrorBoundary,
} from "jsr:@dreamer/view";

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
import { createResource, createSignal } from "jsr:@dreamer/view";

const userId = createSignal(1);

const user = createResource(
  () => userId.value,
  async (id) => {
    const r = await fetch(`/api/user/${id}`);
    return r.json();
  },
);
```

### 11.3 Fields on the resource object

- **`resource()`**: read data; throws if there is an **error** (handled by **ErrorBoundary**).
- **`resource.loading()`** / **`resource.error()`**
- **`resource.mutate(value)`** / **`resource.refetch()`**

The framework ensures registration with the current **Suspense** when calling **`resource()` / `resource.loading()`**, including after **ErrorBoundary** reset.

---

## 12. `ErrorBoundary`

```tsx
import { ErrorBoundary, createSignal } from "jsr:@dreamer/view";

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

- **`resetKeys`**: after an error, clears and retries the subtree only when the return value differs from the last run by **Object.is** per item.

---

## 13. `Portal` and `createPortal`

### 13.1 Declarative `Portal`

```tsx
import { Portal, createSignal } from "jsr:@dreamer/view";

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

### 13.2 Imperative `createPortal` (`jsr:@dreamer/view/portal` or main entry)

```tsx
import { createPortal } from "jsr:@dreamer/view/portal";
import { createSignal } from "jsr:@dreamer/view";

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
import { createContext, useContext } from "jsr:@dreamer/view";

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

**`Provider`** is a **transparent** component: no new Owner; writes context on the current Owner.

---

## 15. `createStore` / `produce` / `reconcile`

### 15.0 How many shapes? How to use?

**Yes: object-root `createStore` also has two main usage shapes**, plus several **overloads** (same deep proxy mechanism).

**Shapes (object root only; array root below)**

| Shape | Syntax | Read / write |
| --- | --- | --- |
| **Whole proxy** | `const store = createStore({ count: 0 })` | **`store.count`**; **`store.setState(...)`** |
| **Tuple** | `const [getStore, setState] = createStore({ count: 0 })` | **`getStore()`** returns the **same** proxy; **`setState("count", 1)`** or **`setState(produce(...))`**, etc. |

**`createStore` overloads**

1. **`createStore(initialState)`** — most common.
2. **`createStore(initialState, { name?, persist? })`** — optional registry name and **localStorage**-style persistence.
3. **`createStore(storeName, initialState, persist?)`** — **named singleton** (global registry key `storeName`) + optional persistence.

**Array root (state root is an array)**

- You get an **array proxy with `setState`**; types **do not** intersect with `[get, set]` (so `list[0]` is not mistaken for tuple items).
- Use **`.setState`**, index assignment, etc.; **do not** destructure like the object tuple.

Sections **15.1 / 15.2** expand proxy vs tuple examples.

### 15.1 Object root: proxy + `setState`

```tsx
import { createEffect, createStore, produce } from "jsr:@dreamer/view";

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
import { createStore } from "jsr:@dreamer/view";

const [getStore, setState] = createStore({ count: 0 });

setState("count", 1);
console.log(getStore().count);
```

### 15.3 Named singleton + persistence

**Form A: three-arg `createStore(storeName, initialState, persist?)`**

See **`PersistOptions<T>`** in **`reactivity/store.ts`**:

| Field | Required | Purpose |
| --- | --- | --- |
| **`key`** | yes | Storage key |
| **`storage`** | optional | Must implement **`getItem` / `setItem`**; if omitted and **`globalThis.localStorage`** exists it defaults; otherwise persistence is inactive (no throw, but nothing persisted) |
| **`serialize`** | optional | **`(state: T) => string`**, default **`JSON.stringify`** |
| **`deserialize`** | optional | **`(str: string) => T`**, default **`JSON.parse`** (assert types yourself) |

**Full example aligned with `view/examples/src/stores/user.ts`:**

```tsx
import { createStore } from "@dreamer/view";

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
import { createStore } from "jsr:@dreamer/view";

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

For tests or SSR, swap **`storage`** for a mock/in-memory implementation without changing **`serialize`** unless you need a custom format.

**Form B: second argument is an options object (same capabilities; pick one style)**

```tsx
import { createStore } from "jsr:@dreamer/view";

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

| Item | Notes |
| --- | --- |
| **Signature** | **`createForm(initialValues, options?)`** — second arg optional; omit for legacy behavior |
| **Two-way binding** | **`field(name)`** → **`value` + `onInput`** (text **`<input>`**, reads **`HTMLInputElement.value`**) |
| **Rules** | **`options.rules`**: per field **`(value, data) => string | null`**, `null` means valid |
| **When to validate** | **`validateOn`**: **`submit`** (default), **`change`**, **`blur`**, or an array |
| **API** | **`validate()`** whole form, **`validateField(name)`** one field, **`handleSubmit(onValid, onInvalid?)`** |
| **No built-in schema** | Not wired to Zod; call external parsers inside **`rules`** or manage **`errors`** manually |
| **Control types** | **`checkbox` / `select` / `textarea`** still need custom handlers or future extensions; **`produce` on `data` does not auto-trigger `validateOn: change`** |

Types exported from the main entry: **`CreateFormOptions`**, **`FormValidateOn`**, **`FormFieldRule`**.

### 16.2 No rules (minimal, same as older docs)

```tsx
import { createForm } from "jsr:@dreamer/view";

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

- **`form.validate()`** with no **`rules`**: clears all **`errors`** and returns **`true`**.
- **`form.data` / `form.errors`** are **Store**; **`form.produce`** updates **`data`**.

### 16.3 Recommended: `rules` + validate on submit by default

```tsx
import { createForm } from "jsr:@dreamer/view";

export function LoginForm() {
  const form = createForm(
    { username: "", password: "" },
    {
      rules: {
        username: (v) => (String(v).trim() ? null : "Username required"),
        password: (v) => (String(v).length >= 6 ? null : "At least 6 characters"),
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

- **`handleSubmit(onValid, onInvalid?)`**: **`preventDefault`** → **`validate()`** → on success **`onValid(getDataSnapshot())`** (**shallow** plain object copy, not a Proxy).
- Or hand-roll: **`onSubmit={(e) => { e.preventDefault(); if (!form.validate()) return; … }}`**.

### 16.4 `validateOn: "change"` / `"blur"` / arrays

- **`change`**: after **`onInput`** (or **`updateField`**) on a field, if that field has a **`rule`**, run **`validateField(name)`**.
- **`blur`**: if the field has a **`rule`**, **`field()`** includes **`onBlur`** to validate on blur.
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

**`validate()`** runs rules in **`initialValues` key order**; put dependencies earlier in the object literal if order matters.

### 16.6 Possible extensions

- **`field` branches by control type** (`checkbox` / `number` / `textarea`).
- Thin **Zod** wrapper inside **`rules`** (**`.safeParse`**).
- Array fields / nested error paths (today **`errors` aligns with top-level keys).

---

## 17. Router: `createRouter` / `mountWithRouter` / `Link` / `useRouter`

### 17.1 Creating a router

```tsx
import {
  createRouter,
  mountWithRouter,
  Link,
  useRouter,
} from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

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
- **Dynamic segment**: **`:id`**; **suffix capture**: **`/files/*`** → **`params["*"]`**.
- **`router.navigate` / `replace`**: return **`Promise<void>`**, resolve after **`beforeEach`** and **history** commit.
- **`Link`**: **`href`** goes through **`resolveHref`** with **`basePath`**; **`replace`** prop uses **`replace`**.
- **`useRouter()`**: current singleton (after **`createRouter`**, same app).
- **Current match**: **`router.match()`** (**`params` / `query` / `pattern` / `route`**).
- On creation the router registers **`popstate`** and, when **`interceptLinks !== false`**, document **click capture** for same-origin **`a`**; **`Link`** sets **`data-view-link`** for delegation.

### 17.2 Rendering the active page inside a layout

Common pattern: root shell calls **`router.render()`** for the current route (nested **layouts**, lazy routes, etc.).

```tsx
import { useRouter } from "jsr:@dreamer/view";

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

Work with **`registerSSRPromise`** and internal queues so async data can flush before output (see **`server.ts`**).

### 18.3 `generateHydrationScript(id, bindingMap)`

Emits a **`<script type="module">`** snippet; **whether it matches client `hydrate` and your bundle** depends on your pipeline — verify against **`hydrate(fn, container, bindings?)`** when integrating.

### 18.4 Other exports

- **`isServer`**, **`enterSSRDomScope` / `leaveSSRDomScope`**, **`queueSsrAsyncTask`**, **`registerSSRPromise`**, etc.: advanced SSR pipelines and tests.

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

- Prepends imports for **`template` / `insert` / `walk` / `setProperty` / `spread`** (and **`memo`**, **`createHMRProxy`** when needed).
- For toolchains turning TSX into **`insert`**-aligned code at build time.

---

## 20. Optimize subpath (`jsr:@dreamer/view/optimize`)

```ts
import { optimize, createOptimizePlugin } from "jsr:@dreamer/view/optimize";

const code = optimize(bundleSource);
// createOptimizePlugin(/\.js$/) for @dreamer/esbuild plugin chains
```

---

## 21. HMR (`createHMRProxy`)

When **`VIEW_DEV`** is set globally in development, **`createHMRProxy(id, Component)`** registers a hot-swappable wrapper; usually injected by **CLI / compiler**, rarely handwritten.

---

## 22. Performance: render thunk (avoid root effect over-subscription)

If **`Show`**, function props, or local **Signals** live directly in a parent’s returned JSX, the **parent `insert` effect** may subscribe to child state and **re-run the whole parent**.
Fix: **`return () => ( … JSX … )`** so the dynamic subtree runs in an **inner effect**.

```tsx
import { createSignal } from "jsr:@dreamer/view";

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

| Path | Role |
| --- | --- |
| `view.config.ts` | Dev server, build, HMR, CSS, etc. |
| `src/main.tsx` | Entry: `createRouter` + `mountWithRouter` |
| `src/views/` | File-based routes; **`_app.tsx` / `_layout.tsx` / `_loading.tsx` / `_404.tsx` / `_error.tsx`** are conventional |
| `src/router/routers.tsx` | **Generated** (do not edit by hand) from **`src/views`** scan |

---

## 24. Security

- **`dangerouslySetInnerHTML` / `innerHTML`**: trusted content only.
- Escape or strictly whitelist user input in SSR output.

---

## 25. Test report and changelog

- See **[TEST_REPORT.md](./TEST_REPORT.md)** (**2026-04-06**: **290** passed on Deno, **229** on Bun, **62** test files, **0** failures; runners count cases differently — details inside the report).
- Version history: **[docs/en-US/CHANGELOG.md](./docs/en-US/CHANGELOG.md)** (English; Chinese: [docs/zh-CN/CHANGELOG.md](./docs/zh-CN/CHANGELOG.md)).

---

## 26. License

Apache License 2.0 — see **[LICENSE](../../LICENSE)** in the repo root.

---

<div align="center"><strong>Made with ❤️ by Dreamer Team</strong></div>
