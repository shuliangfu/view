# Bun compatibility (@dreamer/view)

## Coverage

| Scenario                  | Status      | Notes                                                              |
| ------------------------- | ----------- | ------------------------------------------------------------------ |
| Unit/integration tests    | ✅          | `bun test tests/` — `bunfig.toml` preloads `dom-setup` (happy-dom) |
| CSR (browser)             | ✅          | Same as Deno                                                       |
| SSR (no `document`)       | ✅ (2.0.5+) | Minimal `ssr-dom`, not happy-dom                                   |
| dweb hybrid `bun run dev` | ✅ (2.0.5+) | Needs complete Element-like SSR API                                |

## 2.0.6 tooling

- Root **`bunfig.toml`**: `[test] preload = ["./tests/unit/dom-setup.ts"]` so
  plain `bun test` matches Deno isolation (DOM + registry reset). Without it,
  some unit files fail under Bun isolation.

## Fix in 2.0.5

On Deno/Bun there is no browser `document`. SSR installs `SsrElement`. Missing
`hasAttribute` caused:

```text
TypeError: el.hasAttribute is not a function
```

during dweb hybrid SSR. **2.0.5** adds `hasAttribute` / `toggleAttribute`, style
`removeProperty`/`setProperty`/`getPropertyValue`, `id` accessors, and a
defensive `setProperty` attribute branch.

## Verify

```bash
bun test tests/unit tests/integration
bun test tests/unit/runtime/ssr-dom-element-api.test.ts
deno test -A tests/unit tests/integration
```
