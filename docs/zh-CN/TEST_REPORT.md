# @dreamer/view 测试报告

## 测试概览

| 项目     | 说明                                                                 |
| -------- | -------------------------------------------------------------------- |
| 测试包   | @dreamer/view                                                        |
| 版本     | 2.0.0                                                                |
| 测试框架 | @dreamer/test ^1.1.1                                                 |
| 测试时间 | 2026-04-06                                                           |
| DOM 环境 | happy-dom 20.4.0（单元/集成）, Chromium（E2E）                       |
| 运行命令 | 仓库内 `deno test -A`（扫描全部 `tests/`）；包目录 `bun test`        |

## 测试结果总结

框架在 **Deno** 与 **Bun** 下均为 **100% 通过**。两种运行器的**用例计数方式不同**，因此报表中的「条数」**不必一一对应**；两侧均覆盖 **`tests/` 下 62 个测试模块**（**60** 个 `*.test.ts` + **2** 个 `*.test.tsx`）。

### 运行时统计

- **Deno**：**290** 通过 / **0** 失败（约 **38s**，视机器而定）
- **Bun**：**229** 通过 / **0** 失败（约 **23s**，**62** 个文件）
- **通过率**：100%
- **覆盖范围**：单元测试、集成测试、E2E（拉起 examples + 浏览器）、无 `document` 的 SSR 自举等

### 为何 Deno 与 Bun 条数不同

- **Deno** 将多个 `it()` 及框架钩子分别计步，部分套件在 Deno 侧显示的步数更细。
- **Bun** 的默认汇总方式不同，以 **0 失败** 与**同源树**为准即可。

### 测试模块统计

| 测试目录 / 模块        | 说明                                                                 | 状态        |
| ---------------------- | -------------------------------------------------------------------- | ----------- |
| `reactivity/`          | Signal、Effect、Memo、Store、Selector、Context、Lifecycle、Owner       | ✅ 全部通过 |
| `runtime/`             | Template、Insert、Props、控制流、Suspense、Component、Hydration、HMR、Portal、DOM 辅助、mount 细节、SSR 异步/流式 | ✅ 全部通过 |
| `compiler/`            | Analyzer、Transformer、Path-gen、Directive、SSR Mode、HMR          | ✅ 全部通过 |
| `integrations/`        | Resource、Router、Form                                               | ✅ 全部通过 |
| `scheduler/`           | Batch、Priority                                                      | ✅ 全部通过 |
| `server/`（工具链）    | 配置加载（JSON/TS）、布局链、路由 codegen、`createApp` 冒烟、版本工具 | ✅ 全部通过 |
| `optimize` / `i18n`    | 模板优化插件形态、语言归一与 `$tr`                                   | ✅ 全部通过 |
| `tests/integration/`   | 配置+codegen+SSR 串联、`view.config.ts`、富路由、dweb 可选冒烟、编译器与 SSR 同路径等 | ✅ 全部通过 |
| `ssr-bootstrap` / `ssr-complete` | 极简 DOM 自举 SSR、完整 SSR→水合→响应式                         | ✅ 全部通过 |
| `e2e/`                 | 浏览器端到端（examples 站点 **21** 个交互场景）                      | ✅ 全部通过 |

## 关键适配与说明

### 1. 跨运行时（Bun）

- 异步用例配合 **`waitUntilComplete`** / 微任务控制，保证 Suspense 等与调度相关的中间态可稳定断言。
- 路由表生成对 **`metadata` / `routePath` / `inheritLayout`** 等采用**源码静态解析**，避免在 Bun 下对 `.tsx` 做依赖 JSX 环境的动态 `import()`。

### 2. 响应式与 Resource / Suspense

- **ErrorBoundary** 恢复后 Resource 与 **Suspense** 边界的重新注册行为有专门用例覆盖。
- **超级信号**多种访问形式在 `signal.test.ts` 中验证。

### 3. E2E（`tests/e2e/examples-e2e.test.ts`）

- 覆盖首页、Gallery、Signal、性能页、Form、Store、Boundary、Context、控制流、Resource、Portal、Transition、Runtime SSR 片段、Router、路由守卫、嵌套布局、404 等。
- 通过 examples 的 dev 服务验证 HMR 与 CSR/SSR 片段一致性。

## 结论

@dreamer/view **2.0.0** 在当前自动化套件下，于 **Deno** 与 **Bun** 均为 **0 失败**。范围包含核心响应式、编译器、SSR/水合、集成能力、与 CLI 相关的服务端配置/codegen 工具，以及浏览器 E2E。
