# P2: DEV floating DevTools overlay (Next-inspired)

| Item | Value |
|------|-------|
| Nature | **Additive DX**: floating indicator + multi-tab inspector |
| Package | `@dreamer/view` **v2.2.0** (`dev`) |
| Entry | **`@dreamer/view/devtools/overlay`** only |
| Baselines | Does **not** raise `size:check` / `consumer:bundle:check` |
| Forbidden | JSR / npm; auto-mount in production; kernel rewrites; ui-view / dweb-admin / xlang |
| ZH | [`../zh-CN/P2-devtools-overlay-ui.md`](../zh-CN/P2-devtools-overlay-ui.md) |

---

## Capabilities

| Tab | Content |
|-----|---------|
| **Overview** | Effects / memos / nodes / upstream edges + health + top sources |
| **Tree** | Expandable Owner forest (`inspectOwnerIndexed` paths), filter, select → detail (upstream / downstream / depth / disposables) |
| **Signals** | Registry sources with live search / filter |
| **Warnings** | Oversubscribe / remount warnings; **click** deep-links to Tree path |
| **Settings** | Corner, refresh interval, shortcut hint, reset position / clear warnings |

**Extras:** `⌘/Ctrl+Shift+D` toggle, `Esc` close, drag header/indicator, snap to corners, `localStorage` position & prefs.

## Production never appears

- Separate subpath (not on measured size / consumer entries)
- `mountDevtoolsOverlay()` → `null`, **no DOM** unless `VIEW_DEV === true`
- Framework never auto-mounts; examples gate with `if (VIEW_DEV)`

## API

```ts
import { mountDevtoolsOverlay } from "@dreamer/view/devtools/overlay";

const ui = mountDevtoolsOverlay({ corner: "bottom-left" });
ui?.setTab("tree");
ui?.selectNode("0/1");
ui?.unmount();
```

Probe helpers used by the overlay (also public on `/devtools`):
`inspectOwnerIndexed`, `flattenIndexedOwner`, `getOwnerByPath`, warning `path` fields.

## Demo

`examples/src/main.tsx` under `VIEW_DEV` (`examples` → `deno task dev`).

## Acceptance

- `deno test -A tests` green (incl. E2E)
- size / consumer-bundle green without rewriting baselines
- CI green including `e2e-examples`
