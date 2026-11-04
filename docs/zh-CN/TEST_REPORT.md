# @dreamer/view 测试报告

[English](../en-US/TEST_REPORT.md) | 中文

## 1. 测试概览

| 项目     | 说明                                                            |
| -------- | --------------------------------------------------------------- |
| 包名     | `@dreamer/view`                                                 |
| 版本     | **2.2.0**（与 `deno.json` / `package.json` 一致）               |
| 测试框架 | `@dreamer/test` ^1.2.3                                         |
| 报告日期 | **2026-07-23**                                                  |
| DOM 环境 | 单元/集成：happy-dom **20.4.0**；E2E：Chromium（Playwright 等） |
| 主要命令 | 见下文「如何运行」                                              |

### 1.1 测试树规模（当前仓库）

| 层级             | 路径                       | 文件数                                       |
| ---------------- | -------------------------- | -------------------------------------------- |
| 单元             | `tests/unit/**`            | **~62** 个 `*.test.ts` / `*.test.tsx`        |
| 集成             | `tests/integration/**`     | **6** 个测试模块                             |
| E2E              | `tests/e2e/**`             | **1** 个模块（examples 多场景）              |
| 基准             | `tests/bench/**`           | **2** 个 `*.bench.ts`（不计入通过/失败用例） |
| **合计测试模块** | `tests/` 下 `*.test.ts(x)` | **~69**                                      |

---

## 2. 如何运行

在 **view 包根目录** 执行：

```bash
# 单元 + 集成（推荐日常 / CI 主路径）
deno task test
# 等价：deno test -A tests/unit tests/integration

# 仅集成
deno task test:integration

# 浏览器 E2E（需 Playwright Chromium；与 CI job `e2e-examples` 同命令）
deno task test:e2e
# 等价：deno test -A tests/e2e

# Deno 全量（unit + integration + e2e；本地需已装 Chromium）
deno test -A tests

# CI：`.github/workflows/ci.yml`
# - 9-job 矩阵：仅 unit + integration（无 Chromium）
# - ubuntu `e2e-examples`：安装 Chromium 后跑 `deno task test:e2e`；失败即红
# 详见 docs/zh-CN/P0-e2e-into-ci.md

# 性能基准（不计入 pass/fail）
deno task bench

# Bun（happy-dom 由 bunfig.toml preload；主路径）
bun test tests/unit tests/integration
# 若无 bunfig：bun test --preload ./tests/unit/dom-setup.ts …

# SSR 伪 DOM 专项
bun test tests/unit/runtime/ssr-dom-element-api.test.ts

# Node.js 22+（单元 + 集成；排除 e2e 与 dweb-import-ssr）
npm install
npm run test:node
# 等价：node --import tsx --test-force-exit test-node.mjs
```

| 注意            | 说明                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| DOM 注入顺序    | 部分套件依赖 `dom-setup`；**勿**在全局缓存 `typeof Node` 于模块顶层（happy-dom 可能晚于 import） |
| Deno / Bun 条数 | 两运行器对 `it`/钩子的计数方式不同，**以 0 失败为准**，不必强行对齐数字                          |
| SSR             | 无浏览器 `document` 时由框架安装极简 SSR DOM；见 `ssr-bootstrap`、`ssr-dom-element-api`          |

---

## 3. 最新结果（本报告统计）

> 本机重跑时间：**2026-07-10**（Apple Silicon 量级，视机器浮动）。\
> **注意命令范围不同，条数会不同——不是漏测：**

| 命令范围                           | 说明                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `tests/unit` + `tests/integration` | `deno task test` 默认；**不含** E2E                                        |
| `tests/`                           | `package.json` 的 `bun test … tests/`；**含** unit + integration + **e2e** |

### 3.1 Deno

| 范围                                       | 通过    | 失败  | 耗时             | 命令                                        |
| ------------------------------------------ | ------- | ----- | ---------------- | ------------------------------------------- |
| **unit + integration**（`deno task test`） | **394** | **0** | ~**11s**         | `deno test -A tests/unit tests/integration` |
| **全量 `tests/`**（含 e2e）                | **398** | **0** | ~**1m11s–1m13s** | `deno test -A tests/`                       |

说明：全量比 unit+integration 多约 **21** 条，主要来自
`tests/e2e/examples-e2e.test.ts`。

### 3.2 Bun

| 范围                                     | 通过    | 失败  | 文件   | 耗时     | 命令                                                                        |
| ---------------------------------------- | ------- | ----- | ------ | -------- | --------------------------------------------------------------------------- |
| **unit + integration**                   | **326** | **0** | 68     | ~**6s**  | `bun test --preload ./tests/unit/dom-setup.ts tests/unit tests/integration` |
| **全量 `tests/`**（`npm/bun test` 默认） | **331** | **0** | **68** | ~**48s** | `bun test --preload ./tests/unit/dom-setup.ts tests/`                       |

说明：全量比 unit+integration 多约 **20** 条，主要来自 e2e 文件（+1 文件 → 68
files）。

### 3.3 Node.js 22+

| 范围                                    | 通过      | 失败  | 文件   | 耗时     | 命令                                             |
| --------------------------------------- | --------- | ----- | ------ | -------- | ------------------------------------------------ |
| **unit + integration**（排除 e2e/dweb） | **65/65** | **0** | **65** | ~**60s** | `node --import tsx --test-force-exit test-node.mjs` |

说明：`tests/integration/dweb-import-ssr.test.ts` 排除——该测试起 Deno 子进程，
依赖 dweb 项目的 `deno.json`，Node 上无法运行。

### 3.4 与「你本地数字」对齐

若你看到：

```text
331 pass / 0 fail / 68 files / ~48s   # Bun
ok | 398 passed | 0 failed (~1m13s)   # Deno
```

这与上表 **全量 `tests/`** 一致，**是对的**。\
此前报告若只写 377 / 311，对应的是 **不含 e2e 的 unit+integration**，不是全量。

### 3.4 SSR 伪 DOM 专项（`ssr-dom-element-api`）

| 项       | 值                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **用例** | **18**                                                                                                                          |
| **Deno** | 18 passed / 0 failed                                                                                                            |
| **Bun**  | 18 passed / 0 failed                                                                                                            |
| **说明** | 覆盖 hasAttribute、classList、matches/query、节点关系、反射属性、document.head/body、renderToString null props 等（2.0.5 补全） |

### 3.5 E2E

- 模块：`tests/e2e/examples-e2e.test.ts`（全量 `tests/` 会带上）
- 覆盖 examples 多页交互（Signal、Form、Store、Router、Boundary、布局、404 等）
- **单独**：`deno task test:e2e`；**默认 `deno task test` 不含 e2e**

### 3.6 Bench

- `tests/bench/signal.bench.ts`：Signal 写、同值跳过、batch + 多 Effect。
- `deno task bench`／`bench:check`：Signal／Effect／For／insert 微型 bench；CI `bench-check` 对照 `scripts/bench-baseline/bench-baseline.json`（见 [P0-1](./P0-1-profiling-and-bench-ci.md)）。体积门禁仍为 `size:check`。

---

## 4. 按模块覆盖说明

### 4.1 单元测试 `tests/unit/`

| 目录 / 主题                      | 覆盖要点                                                                                                                                                                                                                                 | 状态 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **reactivity/**                  | Signal（含 `.value`/元组/调用）、Effect、Memo、Owner/`cleanNode`、Store（含 `Object.is`）、Selector、Context、生命周期、错误冒泡、cycle、createDeferred / useTransition                                                                  | ✅   |
| **runtime/**                     | `insert`、数组锚点、details、props/setProperty、**受控 value 焦点稳定**、IME 组合期、事件委托、`Show`/`For`/`Index`/`Switch`、键控列表（无 span 壳）、Suspense、Portal、Hydration、HMR、template/walk、mount、stress、**SSR 伪 DOM API** | ✅   |
| **compiler/**                    | analyzer 静态提升、transformer（template/walk 路径常量、少 Effect）、directive、path-gen、SSR 生成模式、HMR 注入                                                                                                                         | ✅   |
| **integrations/**                | Form 校验/handleSubmit、Resource + Suspense/ErrorBoundary、**Router 全功能**、**Router SSR 同构**（`matchRoute` / `renderRouterToString`）                                                                                               | ✅   |
| **scheduler/**                   | batch 微任务合并、priority 队列                                                                                                                                                                                                          | ✅   |
| **server/**                      | view.config、layout 链、routers codegen、createApp 冒烟、semver 工具                                                                                                                                                                     | ✅   |
| **utils/**                       | `escapeForText` / Attr / AttrHtml 快路径与转义                                                                                                                                                                                           | ✅   |
| **ssr-bootstrap / ssr-complete** | 无预置 document 的 SSR、SSR→hydrate 响应式                                                                                                                                                                                               | ✅   |
| **ssr-dom-element-api**          | **2.0.5**：hasAttribute/toggle、style、classList、dataset、matches/closest/query、节点关系、append 系、反射属性、document.head/body、Fragment、renderToString                                                                            | ✅   |
| **optimize / i18n**              | optimize 插件形态、locale / `$tr`                                                                                                                                                                                                        | ✅   |

### 4.2 集成测试 `tests/integration/`

| 模块                | 说明                                         | 状态 |
| ------------------- | -------------------------------------------- | ---- |
| `view-workflow`     | 配置 → 路由 codegen → SSR 串联               | ✅   |
| `view-config-ts`    | `view.config.ts` 动态加载                    | ✅   |
| `view-routers-rich` | 富路由表 / metadata / 404                    | ✅   |
| `view-ssr-async`    | 异步 / 流式 SSR                              | ✅   |
| `view-compiler-ssr` | 编译产物 + renderToString                    | ✅   |
| `dweb-import-ssr`   | 可选 dweb 式 import 冒烟（目录不存在则跳过） | ✅   |

### 4.3 E2E `tests/e2e/`

| 模块           | 说明                         | 状态           |
| -------------- | ---------------------------- | -------------- |
| `examples-e2e` | examples 开发服 + 浏览器交互 | ✅（单独命令） |

---

## 5. 近期增补（相对 2.0.0 / 2.0.4 报告）

| 主题                | 代表测试                                           | 说明                                                                                       |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 受控表单焦点        | `runtime/props-advanced.test.ts`                   | 同值不写 `el.value`、**number 与 DOM 字符串**、**IME composition**、节点身份稳定           |
| For 键控无壳        | `runtime/control-flow.test.ts`、`stress.test.ts`   | 注释锚点、同引用重排复用、直接子元素                                                       |
| Signal registry     | `reactivity/signal-optimization.test.ts`           | 生产匿名不进 registry；`VIEW_DEV` 供 HMR                                                   |
| Router SSR          | `integrations/router-ssr.test.ts`                  | `parseRouterUrl`、`matchRoute`、`renderRouterToString`                                     |
| 编译少 Effect       | `compiler/transformer.test.ts`、`analyzer.test.ts` | 静态三元/模板串提升、walk `_path$N`                                                        |
| escape 快路径       | `utils/escape.test.ts`                             | 无特殊字符零分配                                                                           |
| **SSR 伪 DOM 补全** | `runtime/ssr-dom-element-api.test.ts`（**18** 条） | **2.0.5**：Element/Document API + `renderToString` null props（Deno/Bun dweb hybrid 相关） |
| Bench               | `tests/bench/signal.bench.ts`                      | 可选性能基线                                                                               |

---

## 6. 运行时与适配说明

### 6.1 跨运行时（Deno / Bun）

- 异步用例多用 **`waitUntilComplete`** / 微任务，保证
  Suspense、路由导航等中间态可断言。
- 路由 codegen 对 **metadata / routePath / inheritLayout**
  等采用**源码静态解析**，降低 Bun 下动态 `import()` TSX 的依赖。
- **Bun 兼容说明**见 `docs/zh-CN/BUN_COMPAT.md`（SSR 无 document、happy-dom
  仅测试）。

### 6.2 响应式与 Resource / Suspense

- ErrorBoundary 恢复后 Resource 须**重新注册**到 Suspense（有专门用例）。
- Super Signal：元组、`.value`、调用式均在 `signal.test.ts` 覆盖。

### 6.3 受控输入与焦点（重要）

- 框架在 `setProperty("value")` 路径：字符串化比较、IME
  组合期禁止回写、必要时尝试恢复选区。
- 业务侧若用 `Show`/`For` **整段拆掉** input
  节点，焦点仍会丢——属结构重建，需稳定 key。

### 6.4 SSR

- `renderToString` / `renderRouterToString` 在 SSR 作用域内安装临时 DOM；结束后
  `cleanNode` + 拆除，避免泄漏到后续请求。
- 2.0.5 起极简 SSR DOM 对齐常用 Element/Document
  API（`hasAttribute`、`classList`、 `querySelector` 等），防止 dweb hybrid 在
  Deno/Bun 再踩洞。

---

## 7. 已知缺口（摘要）

完整历史清单见包内 `docs/测试覆盖缺口.md`（部分路径名仍带 v1 痕迹，以 `tests/`
现树为准）。

| 类型                     | 说明                                                   |
| ------------------------ | ------------------------------------------------------ |
| CLI 大段逻辑             | `cli/init` 等体积大，以 E2E/烟测为主，纯函数单测可再拆 |
| 水合 Mismatch / 渐进水合 | 细粒度恢复策略覆盖有限                                 |
| 覆盖率门槛               | 未强制 `deno coverage` CI 阈值                         |
| Bench 门禁               | bench 可选，默认不 fail CI                             |
| SSR 选择器               | 伪 DOM 仅简易 CSS（非完整浏览器选择器引擎）            |

---

## 8. 结论

**@dreamer/view 2.1.0** 主路径门禁（**0 失败**）：

| 运行时 | 范围                                           | 结果                  |
| ------ | ---------------------------------------------- | --------------------- |
| Deno   | unit + integration（`deno task test`）         | **394 通过 / 0 失败** |
| Bun    | unit + integration（`bun test` + bunfig 预载） | **326 通过 / 0 失败** |

- 覆盖核心响应式、运行时 DOM、**受控表单焦点**、**props/URL 安全**、键控 **`For`
  LIS 重排**、编译器静态提升、SSR/水合（**mismatch 策略**）、**SSR 伪 DOM
  API**、路由、表单、调度、**子路径导入**与集成
- **2.1.0** 新增细粒度 `exports`（`/reactivity`、`/csr` 等）、水合
  `mismatchMode` 及更多子路径/编译器用例（相对 2.0.6 约 384 / 317）
- 含 e2e 的全量 `tests/` 为可选；引用总数时请对齐命令范围

本报告随 `tests/` 与发版节奏更新。
