# P2：examples 子路径 dogfood

| 项   | 值                                                              |
| ---- | --------------------------------------------------------------- |
| 性质 | **非破坏 dogfood**：examples／生成器／Bun import map 对齐子路径 |
| 基线 | **未**改 `size:check`／`consumer:bundle:check` 数字             |
| 禁   | JSR／npm 发布                                                   |

## 1. 目标

把消费方示范（`examples/`）与相关生成路径，从主入口便利 barrel 迁到子路径
（`/reactivity` `/csr` `/router` `/form` `/resource` `/control-flow` `/ssr`
…）， 对齐
[P1-1](./P1-1-main-entry-deprecation-preview.md)／[P0-2](./P0-2-consumer-bundle-analyze.md)。
**行为不变**；E2E／全测不红。**3.0：** 主入口已不再 re-export 集成 — examples
本就走子路径；迁移后保持 dogfood
锁测绿（[`MIGRATION-3.0.md`](./MIGRATION-3.0.md)）。

## 2. 本件改动

| 面               | 内容                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 路由 codegen     | `generateRoutersContent`：`RouteConfig` 改为 `@dreamer/view/router`（与 `cli/init` 模板一致）                                         |
| SSR hydrate 脚本 | `generateHydrationScript`：`hydrate` 改为 `@dreamer/view/csr`                                                                         |
| examples 手写源  | 能拆的再拆：控制流页走 `/control-flow`；signal／store／selector 走 `/reactivity`；CSR 专用（`Suspense`／`Dynamic`／hydrate）留 `/csr` |
| Bun              | `examples/package.json` `imports` 补齐与 `examples/deno.json` 一致的子路径映射                                                        |
| 锁测             | `tests/unit/examples-subpath-dogfood.test.ts` 扫描手写源禁裸主入口；codegen／hydrate 单测断言子路径                                   |

`examples/src/router/routers.tsx` 仍 gitignore；下次 `dev`／`build`
会按新模板生成。

## 3. 未做

- **未**批量改 unit／integration 里刻意对比主入口的用例（如
  `subpaths.test.ts`）。
- **未**放宽或重写 consumer-bundle／size 基线（本件数字对照应绿、基线不动）。
- 编译器默认 `insertImportPath`（`@dreamer/view`）属编译产物约定，另刀。

## 4. 验收

- 本地：`deno task test:e2e` +
  `deno test -A tests`；`deno task size:check`；`deno task consumer:bundle:check`
- CI 全绿（含 `e2e-examples`）
