# P1-4: Router split (match / history / Link) + SSR isomorphism

> **Status:** Unreleased (2.x non-breaking)\
> **Constraints:** Public API and behavior unchanged; no JSR/npm; do not relax
> size / consumer-bundle / E2E assertions.

## Module boundaries

The former monolithic `src/integrations/router.ts` is split into:

| Module      | Path                                 | Responsibility                                                                         |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| **types**   | `src/integrations/router/types.ts`   | `RouteConfig` / `RouteLocation` / `RouteMatch` / `CreateRouterOptions` / `Router`      |
| **match**   | `src/integrations/router/match.ts`   | Pure `parseRouterUrl` / `matchRoute` and path compilation; **no** history / singleton  |
| **history** | `src/integrations/router/history.ts` | `createRouter` / `useRouter`: History, link intercept, `navigate` / `render`, SSR mode |
| **link**    | `src/integrations/router/link.ts`    | `Link` / `mountWithRouter`                                                             |

`src/integrations/router.ts` remains the **barrel** (same public surface as
`jsr:@dreamer/view/router` and the main entry re-exports).

## SSR isomorphism (recommended)

1. **Prefetch / match without an instance:**
   ```ts
   import { matchRoute } from "@dreamer/view/router";
   const m = matchRoute(routes, req.url);
   ```
2. **One-shot HTML:**
   ```ts
   import { renderRouterToString } from "@dreamer/view/ssr";
   const html = renderRouterToString({ routes, url: req.url });
   ```
3. **Manual:** `createRouter({ routes, url, ssr: true })` →
   `renderToString(() => router.render())` → `router.destroy()`.\
   With `ssr: true` (or inside a `renderToString` DOM scope / `VIEW_SSR`),
   **no** `popstate` / `<a>` intercept is attached. After client hydrate, create
   a normal router or call `router.start()` on an existing instance.

**Guarantee:** for the same `routes` + `url`, `matchRoute(...)` and
`createRouter({ url, ssr: true }).match()` agree on `path` / `pattern` /
`params` / `query` / `pathname` (see
`tests/unit/integrations/router-ssr.test.ts`).

## Non-goals (still HOLD)

- Nested route-tree config API, route-level transitions, async guards on
  `popstate`
- Breaking main-entry slimming in 3.0
