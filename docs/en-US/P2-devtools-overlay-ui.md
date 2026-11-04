# P2: DEV floating DevTools overlay (Next-inspired)

| Item | Value |
|------|-------|
| Nature | **Additive DX**: floating indicator + panel for local development |
| Package | `@dreamer/view` **v2.2.0** (`dev`) |
| Entry | **`@dreamer/view/devtools/overlay`** only (not main barrel / `/reactivity` / `/devtools`) |
| Baselines | Does **not** change or raise `size:check` / `consumer:bundle:check` numbers |
| Forbidden | JSR / npm publish; auto-mount in production; rewriting reactive kernel; touching ui-view / dweb-admin / xlang |
| ZH | [`../zh-CN/P2-devtools-overlay-ui.md`](../zh-CN/P2-devtools-overlay-ui.md) |

---

## 1. Goal

Ship a **Next.js Dev indicator–style** floating control for View:

- Collapsed: circular **V** button (bottom-left by default)
- Expanded: glass dark panel with clear sections — **Overview** / **Warnings** / **Sources**
- Close via **✕** or **Escape**; **Refresh** re-scans

Reuses `@dreamer/view/devtools` (Owner summaries, registry sources, oversubscribe / remount warnings). No browser extension.

## 2. Production never appears

| Mechanism | Behavior |
|-----------|----------|
| Separate subpath | Unmeasured by size / consumer-bundle fixtures |
| `VIEW_DEV` gate | `mountDevtoolsOverlay()` returns `null` and creates **no DOM** when `VIEW_DEV` is not `true` |
| Explicit opt-in | Framework **never** auto-mounts; examples / scaffolds call it under `if (VIEW_DEV)` |
| Dev server inject | `view dev` prepends `VIEW_DEV = true`; `build` / `start` do not |

## 3. Usage

```ts
import { mountDevtoolsOverlay } from "@dreamer/view/devtools/overlay";

// Only in DEV (examples already gate on VIEW_DEV):
const overlay = mountDevtoolsOverlay({
  corner: "bottom-left", // or "bottom-right"
  refreshMs: 1000,       // 0 = manual refresh only
  watchMisuse: true,     // wires enableOversubscribeWarnings → Warnings
});

overlay?.open();
overlay?.refresh();
overlay?.unmount();
```

### Demo

`examples/src/main.tsx` mounts the overlay when `VIEW_DEV` is true (`deno task dev` / `bun run dev` under `examples/`).

## 4. UI notes (beauty acceptance)

| State | Look |
|-------|------|
| Default | 42px frosted circle, blue **V** mark, green status dot |
| Open | ~380px panel, blur glass, uppercase section labels, tabular stats, mono source rows |
| Typography | System UI sans; 11–13px hierarchy; high contrast on dark `#0e0e12` |
| Motion | Short opacity / translate (≈140–160ms), restrained |

## 5. Acceptance

- `deno test -A tests` (includes E2E) green
- `deno task size:check` + `deno task consumer:bundle:check` green **without** rewriting baselines
- CI green including `e2e-examples`
