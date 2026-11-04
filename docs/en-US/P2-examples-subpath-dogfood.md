# P2: examples subpath dogfood

| Item | Value |
|------|-------|
| Nature | **Non-breaking dogfood**: align examples / codegen / Bun import map with subpaths |
| Baselines | Does **not** change `size:check` / `consumer:bundle:check` numbers |
| Forbidden | JSR / npm publish |

## 1. Goal

Move the consumer demo (`examples/`) and related generators off the convenience
main barrel onto subpaths (`/reactivity`, `/csr`, `/router`, `/form`,
`/resource`, `/control-flow`, `/ssr`, …), matching
[P1-1](./P1-1-main-entry-deprecation-preview.md) /
[P0-2](./P0-2-consumer-bundle-analyze.md). **Behavior unchanged**; E2E / full
suite stay green.

## 2. This change

| Area | What |
|------|------|
| Router codegen | `generateRoutersContent`: `RouteConfig` from `@dreamer/view/router` (same as `cli/init` template) |
| SSR hydrate script | `generateHydrationScript`: `hydrate` from `@dreamer/view/csr` |
| Hand-written examples | Prefer dedicated subpaths: control-flow demos → `/control-flow`; signals/stores/selectors → `/reactivity`; CSR-only (`Suspense` / `Dynamic` / hydrate) stay on `/csr` |
| Bun | `examples/package.json` `imports` mirror `examples/deno.json` subpath maps |
| Locks | `tests/unit/examples-subpath-dogfood.test.ts` bans bare main entry in hand-written sources; codegen / hydrate unit tests assert subpaths |

`examples/src/router/routers.tsx` remains gitignored; next `dev` / `build`
regenerates with the new template.

## 3. Out of scope

- **No** mass rewrite of unit/integration tests that deliberately compare the
  main barrel (e.g. `subpaths.test.ts`).
- **No** relaxing or rewriting consumer-bundle / size baselines.
- Compiler default `insertImportPath` (`@dreamer/view`) is a separate cut.

## 4. Acceptance

- Local: `deno task test:e2e` + `deno test -A tests`; `deno task size:check`;
  `deno task consumer:bundle:check`
- CI green including `e2e-examples`
