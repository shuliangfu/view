# Full compile (`compileSource`) vs hand-written JSX (VNode) — behavior comparison

This document compares **build-time `compileSource` (full compile)** vs
**hand-written JSX** using **`react-jsx` + `jsxImportSource`** (`jsx` / `jsxs` →
**VNode** → **`mountVNodeTree`**): what each path **supports**, **does not
support**, and where they **differ**. Behavior is described from
`view/src/jsx-compiler/transform.ts`, `view/src/jsx-runtime.ts`,
`view/src/compiler/vnode-mount.ts`, and `view/src/compiler/insert.ts`; after
refactors, trust the source.

Chinese version:
[ANALYSIS-full-compile-vs-handwritten-jsx.md](../zh-CN/ANALYSIS-full-compile-vs-handwritten-jsx.md)

Related: [编译路径与运行时指南.md](../编译路径与运行时指南.md) (Chinese pipeline
guide).

---

## 1. Terms and data flow

| Term                 | Meaning                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full compile**     | Run `compileSource` (or view-cli / esbuild plugin, etc.) on TSX so JSX becomes `insert` / `createElement` / `insertReactive` / `createEffect` / `applyDirectives` calls; component roots are often `(container) => void`.           |
| **Hand-written JSX** | No `compileSource`: TS `jsx: "react-jsx"` + `jsxImportSource: "@dreamer/view"` (or `jsr:@dreamer/view`). JSX desugars to `jsx` / `jsxs`, producing a **VNode**, then **`insert` → `insertReactive` → `mountVNodeTree`** builds DOM. |
| **MountFn**          | `(parent: Node) => void` — mounts a subtree onto `parent` synchronously; typical for compiled component roots.                                                                                                                      |
| **VNode expansion**  | `mountVNodeTree` handles intrinsic tags, function components, `Fragment`, `#text`, Context, etc.                                                                                                                                    |

---

## 2. Matrix (✓ first-class · partial · ✗ not equivalent / DIY)

| Capability                                               | Full compile                                                                       | Hand-written JSX + `mountVNodeTree`                                                                                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Root mount**                                           | `createRoot((el) => { insert(el, …); }, container)`; same `fn` as `renderToString` | Same; if you only call `mountVNodeTree` without an outer `insertReactive`, you only get that one mount pass                                                                                                                                |
| **Intrinsic elements**                                   | `createElement` + generated statements                                             | `jsx("div", props)` → `mountVNodeTree`                                                                                                                                                                                                     |
| **`{ expr }` children**                                  | `insert(parent, () => expr)`                                                       | Ends up in VNode `children`; function/getter children use `insertReactiveForVnodeSubtree` (bridge must be registered from main/compiler)                                                                                                   |
| **Signal in text**                                       | Compiler can inject `unwrapSignalGetterValue`                                      | Rely on reactive child getters; **do not** pass getters as plain attributes expecting DOM updates                                                                                                                                          |
| **vIf / vElseIf / vElse chain**                          | ✓; root `vIf` wrapped in **`insertReactive`**                                      | ✓ **Root** and **`Fragment`** sibling chains: if **`vIf` / `vElseIf` is reactive** (**SignalRef**, zero-arg fn, signal getter), the whole chain is wrapped in **`insertReactiveForVnodeSubtree`**; **all-static** conditions stay one-shot |
| **vOnce / vCloak**                                       | ✓                                                                                  | ✓                                                                                                                                                                                                                                          |
| **Custom directives (`registerDirective`, e.g. vFocus)** | `applyDirectives`                                                                  | ✓ after **`append` + `bindIntrinsicRef`** (same order as compile)                                                                                                                                                                          |
| **v-insert / vInsert**                                   | Via `applyDirectives`                                                              | ✓                                                                                                                                                                                                                                          |
| **ref (callback / `createRef`)**                         | `scheduleFunctionRef`                                                              | ✓ (`bindIntrinsicRef`)                                                                                                                                                                                                                     |
| **Events `onClick` / …**                                 | `addEventListener`                                                                 | ✓                                                                                                                                                                                                                                          |
| **Controlled `value` / `checked` as signal getter**      | **`createEffect`** writes `el.value` / `checked`                                   | ✓ **`bindIntrinsicReactiveDomProps`**: same class of expressions as compile path; do not mistake multi-arg functions for controlled getters                                                                                                |
| **Intrinsic multi-segment props**                        | compile emits `spreadIntrinsicProps` / merge chains                                | **`mergeProps` + `jsx`** or **`jsxMerge`** (`jsx-runtime`); `mergeProps` proxy enumerates via `Object.keys` / object spread. Imperative apply to an existing element: **`spreadIntrinsicProps`**                                           |
| **Component multi-segment props**                        | `mergeProps` / helpers                                                             | same: **`mergeProps` + `jsx(Comp, …)`** or **`jsxMerge(Comp, …)`**                                                                                                                                                                         |
| **`className` / `htmlFor`**                              | mapped to `class` / `for`                                                          | ✓                                                                                                                                                                                                                                          |
| **`style` object**                                       | compile path handles                                                               | ✓ static **`Object.assign`**; reactive (**SignalRef**, etc.) clears `style` then assigns each run (`bindIntrinsicReactiveDomProps`)                                                                                                        |
| **SVG / `createElementNS`**                              | ✓                                                                                  | ✓                                                                                                                                                                                                                                          |
| **Fragment**                                             | ✓                                                                                  | ✓ (incl. vIf sibling chain)                                                                                                                                                                                                                |
| **Context Provider**                                     | per compile / component                                                            | ✓                                                                                                                                                                                                                                          |
| **Component return type**                                | Usually MountFn                                                                    | MountFn, `() => VNode`, raw `VNode`, array — MountFn / zero-arg fn use `insertReactiveForVnodeSubtree`                                                                                                                                     |
| **Suspense / ErrorBoundary**                             | Compiler-specific child shapes                                                     | Must match expected APIs; not automatic parity                                                                                                                                                                                             |
| **optimize / constant folding**                          | optional compile plugin                                                            | none                                                                                                                                                                                                                                       |

---

## 3. Built-in directives (details)

### 3.1 vIf / vElseIf / vElse

- **Full compile**: root intrinsic `vIf` goes through **`insertReactive`** so
  signal updates re-run the branch.
- **Hand-written**: **`Fragment` sibling chains** with **reactive** `vIf` /
  `vElseIf` use **`insertReactiveForVnodeSubtree`** for the whole chain (same
  idea as compile). **All-static** chain conditions are still one-shot. **Root
  intrinsic** reactive `vIf` uses the same mechanism.

### 3.2 vOnce / vCloak

Same ideas on both paths (`untrack` subtree; `data-view-cloak`).

### 3.3 Removed built-ins

**vFor** and **vShow** are removed from the compiler and built-in directive set;
use JS iteration and `vIf` (or other UI logic).

---

## 4. Custom directives

Both paths call **`applyDirectives`** for intrinsic elements (hand-written:
after append + ref). Ensure `registerDirective` runs before mount and registry
is shared across chunks.

---

## 5. Component return shapes

`mountVNodeTree` for function `type`:

1. **`(parent) => void`** → `insertReactiveForVnodeSubtree`
2. **`() => …` zero-arg** (VNode getter) → `insertReactiveForVnodeSubtree`
3. **Raw VNode / array** → synchronous recursive `mountVNodeTree`

Compiled components almost always return **MountFn** (case 1).

---

## 6. SSR, streaming, hydration

- **`renderToString` / `renderToStream`**: same **`fn(container)`** contract as
  full compile; may still hit **`mountVNodeTree`** when getters return VNodes.
- **Hydration**: same `fn` and insert-point ordering as SSR; **full compile** is
  recommended for stable `data-view-*` / slot contracts. Hand-only VNode trees
  that diverge from SSR output increase hydration risk.

---

## 7. Tooling

|                           | Full compile                                              | Hand-written JSX                                                          |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Build**                 | Must wire `compileSource` (or official plugin / view-cli) | TS JSX config + runtime package only                                      |
| **dweb / dynamic import** | Prefer compile on `.tsx` for CSR parity                   | Uncompiled dynamic imports historically diverged; align in project config |

---

## 8. When to choose which

| Need                                                                        | Recommendation                                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Production app, SSR/hydrate, controlled inputs, spread, reactive root `vIf` | **Full compile**                                                                                          |
| Library-only VNode output, embed in other renderers                         | **Hand-written JSX** — avoid VNode + reactive `value` on inputs without compile or outer reactive rebuild |
| Custom directives                                                           | Both support intrinsics; mind registration timing                                                         |

---

## 9. Maintenance

Update this file (and the Chinese copy) when `transform.ts` / `vnode-mount.ts`
behavior changes.
