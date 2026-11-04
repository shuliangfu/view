# P0-4: Component author guide (Memo / ref / subscription boundaries)

| Item | Value |
|------|-------|
| Target | `@dreamer/view` **v2.2.0**, branch `dev` |
| Date | **2026-11-04** (Asia/Shanghai) |
| Nature | **Docs-first** (inline examples OK); **no runtime semantics change**; no JSR / npm |
| Sources | [`../zh-CN/view-framework-analysis.md`](../zh-CN/view-framework-analysis.md) P0-4; ui-view pitfalls (`PullRefresh` / `ScrollList` / `Affix` / `MobilePortalHostScope`, …) |
| Chinese | [`../zh-CN/P0-4-component-author-guide.md`](../zh-CN/P0-4-component-author-guide.md) |
| Related | README [§22 render thunk](./README.md#22-performance-render-thunk-avoid-root-effect-over-subscription); [§7 Memo / Effect](./README.md#7-reactive-basics); [§9 createRef](./README.md#9-dom-and-insert) |

---

## 1. Mental model: setup once, updates via fine-grained bindings

`@dreamer/view` is **not** React. Ideally a component function runs **setup** once
under its own **Owner** (Signals / Memos / Effects / ref bridges). Later DOM
updates come from `insert` / property Effects / child subscriptions — the
component function does **not** need to re-execute end-to-end.

If an outer “template clone / root `insert`” Effect **accidentally subscribes**
to business Signals / Memos, each change will:

1. Re-run the component body or the whole `_tmpl$()`;
2. `replaceChild` / unmount + remount;
3. Fire `ref(null)` → `ref(el)`, drop listeners, lose focus / gestures / IO.

**Author goal:** keep Signal reads inside the **smallest possible subtree**; keep
the shell static or bound only to stable identities.

---

## 2. Do not synchronously read Signals / Memos at component top level

### 2.1 Failure mode

Calling `sig()` / `memo()` / `.value` at the **top level** of a component
(including building a full VNode before `return`, or reading inside the same JSX
closure as a static shell) registers the outer insert / template Effect as a
subscriber. Loading flags, drag offsets, etc. then trigger a **whole-tree
replace**.

Proven in ui-view: reading `pullDragPx()` / `isLoading()` in `PullRefresh` root
JSX remounts the shell on pull → `ref(null)` → gesture `detach` →
`pointercancel`. Building `loadMore` VNodes at `ScrollList` top level while
reading `loadingMore()` remounts the whole `PullRefresh` / `List` chrome when
pagination loading flips.

### 2.2 Remedies

| Remedy | Notes |
|--------|-------|
| **Split a reader child** | Heads / badges read Signals; root **must not** read on `return` |
| **`return () => (…)` thunk** | See README §22: dynamic subtree in an inner Effect |
| **Control flow** | Pass Signal / getter into `Show` / `Switch`; don’t pre-unwrap booleans into a static tree |
| **Pass Signal / zero-arg getter** | `loading={sig}` or `loading={() => sig.value}`; **not** `loading={sig.value}` |
| **`untrack` in handlers** | Need a snapshot without subscribing: `untrack(() => sig())` |

```tsx
import { createMemo, createSignal, Show } from "jsr:@dreamer/view/csr";

/** Reads loading only inside the head subtree */
function RefreshHead(props: { loading: () => boolean }) {
  return () => (
    <div className="head">{props.loading() ? "Loading…" : "Pull to refresh"}</div>
  );
}

function PullShell(props: { loading: ReturnType<typeof createSignal<boolean>> }) {
  // setup: Memo once; this return path does **not** call loading() / isLoading()
  const isLoading = createMemo(() => props.loading.value);
  return (
    <div className="shell">
      <RefreshHead loading={isLoading} />
      <div className="scroll">{/* list: also do not read isLoading here */}</div>
    </div>
  );
}
```

Anti-pattern:

```tsx
function Bad(props: { loading: () => boolean }) {
  // top-level read → outer insert subscribes to loading
  const text = props.loading() ? "Loading" : "Idle";
  return <div className="shell">{text}<List /></div>;
}
```

---

## 3. `createMemo`: when to use / when not

| Use | Avoid |
|-----|--------|
| **Derived** values read in several places | Treating Memo as a “stable object store” across re-runs |
| Merged class strings / derived booleans | Creating a new Memo on every re-run just to “cache” a ref callback |
| Subscribing to Signal / getter props from a child | Replacing `createSignal` for DOM pointers or mutable bridges |

**Key:** every `createMemo(fn)` call **allocates a new Memo**. If a mistaken
subscription re-runs the component, top-level `createMemo` yields a **new**
getter / callback → `ref={newFn}` rebinds the node and looks like a full DOM
swap.

Stable bridges across one Owner lifetime:

- When setup truly runs once, top-level function identities are already stable;
- If re-runs are possible: hang the bridge off an **Owner singleton** /
  `getOwner()` map (ui-view `PullRefreshDomBridge` pattern) — **do not**
  `createMemo(() => bridge)` each time.

```tsx
import { createMemo, createSignal } from "jsr:@dreamer/view/reactivity";

const items = createSignal<{ id: number; label: string }[]>([]);
// ✅ derived value shared by readers
const count = createMemo(() => items().length);

// ❌ don’t: new memo each re-run only to “stabilize” a callback
// const bridge = createMemo(() => ({ onRef(el) { ... } }));
```

---

## 4. `ref` boundaries

### 4.1 Prefer

- Need `.current`: **`createRef<T>()`** + `ref={refObj}` (matches compiler / JSX).
- Function refs: keep **one function identity** (Owner-scoped bridge) for scroll
  roots, IO, gestures.

### 4.2 Transient `ref(null)`

On reactive subtree updates the runtime may call **`ref(null)` then `ref(same
node)`**. Unconditionally `removeEventListener` / `disconnect` / clearing host
Signals on `null` will:

- Tear down still-needed gestures / IO; or
- Stack with sync re-renders into **maximum synchronous depth** loops (ui-view
  `Affix`).

**Guard:** if `ref(null)` but the node is still **`isConnected`**, treat as a
scheduling transient and **ignore**; clean up only on real disconnect.

```tsx
function bindScrollRootRef(el: HTMLElement | null) {
  if (el == null) {
    const prev = currentScrollEl;
    if (prev && prev.isConnected) return; // transient null: do not detach
    detach(prev);
    currentScrollEl = null;
    return;
  }
  currentScrollEl = el;
  attach(el);
}
```

### 4.3 Compiler path note

In a few trigger-button cases, `createRef`’s internal signal can be subscribed by
the compile path and, with function-child inserts, remount repeatedly — a stable
function ref + local variable may be safer (ui-view DatePicker / ColorPicker).
Prefer narrowing subscriptions over blanket “never use `createRef`”.

---

## 5. Subscription boundaries (`createEffect` / tracking)

| Rule | Notes |
|------|-------|
| **Read = subscribe** | Reading Signal / Memo inside Effect / Memo / tracked JSX subscribes |
| **Narrow** | High-frequency `scroll` / `pointermove` must **not** subscribe to shell-rebuilding flags like `loading` |
| **`untrack`** | Wrap snapshots inside event handlers |
| **`onMount` / one-shot** | Built on Effect + `untrack`; init side effects here, not on the template Effect |
| **Resource** | Create at module / parent setup; never on a path that re-runs the parent from a bad subscription (duplicate fetches) |

Shell split:

```text
PullRefreshRoot (return does not read business Signals)
 ├─ PullRefreshHead      ← only place reading pullDragPx / isLoading
 └─ PullRefreshScroller  ← no those reads; stable ref / gestures only
```

---

## 6. Context: do not pass a bare function as `value`

`useContext` **invokes function-valued context once**. With
`Provider value={() => hostEl()}`, consumers get `HTMLElement | null`, not a
getter → runtime `is not a function`.

```tsx
// ✅
<HostCtx.Provider value={{ getHost }}>
// ❌
<HostCtx.Provider value={getHost}>
```

---

## 7. Props conventions (library authors)

| Prefer | Avoid |
|--------|--------|
| `open={sig}` / `loading={() => sig.value}` | Boolean snapshot `sig.value` only (never updates if parent doesn’t re-run) |
| `items={sig}` or `items={() => rows}`, child `createMemo(() => read(props.items))` | Destructure away reactivity, or top-level `props.items()` with a too-wide subscription |
| Document `ControlledOpenInput = boolean \| Signal \| () => boolean` | Assume React-style re-render every beat |

---

## 8. Subpath imports (light touch)

Prefer for new component / app code:

- `jsr:@dreamer/view/reactivity` — Signal / Memo / Effect / Context
- `jsr:@dreamer/view/csr` — mount + control-flow + Suspense
- Form / router / Resource via their subpaths

Main `@dreamer/view` remains a **convenience barrel** (larger). Full map: README
§2.3. This guide does **not** redo the subpath migration doc.

---

## 9. Checklist

- [ ] Does the root `return` path synchronously read hot Signals / Memos?
- [ ] Are Signal-reading UIs split into the smallest child / thunk / `Show`?
- [ ] Is each `createMemo` created once at setup — not re-allocated as a “stable store”?
- [ ] Are function `ref` identities stable? Is transient `ref(null)` ignored via `isConnected`?
- [ ] Do gesture / scroll callbacks avoid subscribing to shell-rebuilding Signals?
- [ ] Is Context `value` an object / primitive, not a bare function used as a getter?
- [ ] Do controlled props accept Signal / getter, and is that documented?

---

## 10. Non-goals (this knife)

- No default `insert` / Effect / `createMemo` / `ref` runtime semantics changes
- No new dev-only “over-subscription” runtime warnings (separate knife)
- No ui-view / dweb-admin product edits; no JSR / npm publish
- No P0-2 bundle work, P0-3 compiler optimization, or P1\* in this knife
