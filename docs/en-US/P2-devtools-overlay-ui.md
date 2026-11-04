# P2: DEV floating DevTools overlay (Next-inspired)

| Item      | Value                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Nature    | **Additive DX**: floating indicator + multi-tab inspector                          |
| Package   | `@dreamer/view` **3.0.0** (`dev`; overlay since 2.2)                               |
| Entry     | **`@dreamer/view/devtools/overlay`** only                                          |
| Baselines | Does **not** raise `size:check` / `consumer:bundle:check`                          |
| Forbidden | JSR / npm; auto-mount in production; kernel rewrites; ui-view / dweb-admin / xlang |
| ZH        | [`../zh-CN/P2-devtools-overlay-ui.md`](../zh-CN/P2-devtools-overlay-ui.md)         |

---

## Capabilities

| Tab          | Content                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** | Effects / memos / nodes / upstream edges + health + top sources. **3.0:** resnapshots on route change (`popstate` + history push/replace); page-scoped, not whole-app cumulative                           |
| **Tree**     | Expandable Owner forest (`inspectOwnerIndexed` paths), filter, select → detail (upstream / downstream / depth / disposables / DOM count). **Click** a row to mark it selected and outline that Owner's DOM |
| **Signals**  | Registry sources with live search / filter                                                                                                                                                                 |
| **Warnings** | Oversubscribe / remount / `component-rerun`; toolbar **clear**; **click** deep-links to Tree path                                                                                                          |
| **Settings** | Corner, refresh interval, shortcut hint, reset position / clear warnings                                                                                                                                   |

**Extras:** `⌘/Ctrl+Shift+D` toggle, `Esc` close, drag header/indicator, snap to
corners, `localStorage` position & prefs.

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
`inspectOwnerIndexed`, `flattenIndexedOwner`, `getOwnerByPath`, warning `path`
fields.

## Inspect highlight

Under `VIEW_DEV`, `createRootTracked` (and `mountDevtoolsOverlay`) install
`globalThis.__DREAMER_OWNER_DOM__` **before** the tracked render. `jsx()`
records the host element against the Owner that was current when `jsx()` was
called (the component), not the Effect that later runs the thunk. The overlay
does not write attributes onto application nodes. The outline is a
`pointer-events: none` layer (`data-dreamer-view-inspect`) under the panel; it
hides when the panel closes and is removed on unmount. Owners with no connected
DOM (for example a bare effect) keep the selected row and show “No connected
DOM”.

`installOwnerDomTracking` / `collectOwnerDomElements` live on
`@dreamer/view/devtools`. No `src/i18n.ts` import.

## Demo

`examples/src/main.tsx` under `VIEW_DEV` (`examples` → `deno task dev`). Open
the indicator → Tree → click a node: the row stays selected and a blue rect
tracks that Owner's DOM. Scroll or resize repositions the rect.

## Acceptance

- `deno test -A tests` green (incl. E2E)
- size / consumer-bundle green without rewriting baselines
- CI green including `e2e-examples`

## i18n (zh / en, browser-safe)

Overlay chrome follows the **page language** (`html[lang]` /
`document.documentElement.lang`) via `overlay-l10n.ts` +
`devtools/locales/{en,zh}.json`. **No** language switcher. Does **not** import
`src/i18n.ts` (keeps `node:*` out of the client bundle). Still `VIEW_DEV` only.

## HMR

With `@dreamer/server` DEV HMR: overlay `claimUi` hides the capsule and Overview
→ HMR shows status; degrades without a bridge. Never in production.
