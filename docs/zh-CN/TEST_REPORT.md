# @dreamer/view 测试报告

[English](../en-US/TEST_REPORT.md) | 中文

## 1. 测试概览

| 项目     | 说明                                                            |
| -------- | --------------------------------------------------------------- |
| 包名     | `@dreamer/view`                                                 |
| 版本     | **2.0.4**（与 `deno.json` / `package.json` 一致）               |
| 测试框架 | `@dreamer/test` ^1.1.8                                          |
| 报告日期 | **2026-07-10**                                                  |
| DOM 环境 | 单元/集成：happy-dom **20.4.0**；E2E：Chromium（Playwright 等） |
| 主要命令 | 见下文「如何运行」                                              |

### 1.1 测试树规模（当前仓库）

| 层级             | 路径                       | 文件数（约）                                     |
| ---------------- | -------------------------- | ------------------------------------------------ |
| 单元             | `tests/unit/**`            | **~60** 个 `*.test.ts` / `*.test.tsx`            |
| 集成             | `tests/integration/**`     | **6** 个测试模块                                 |
| E2E              | `tests/e2e/**`             | **1** 个模块（examples 多场景）                  |
| 基准             | `tests/bench/**`           | **1** 个 `*.bench.ts`（不计入「通过/失败」用例） |
| **合计测试模块** | `tests/` 下 `*.test.ts(x)` | **67**                                           |

---

## 2. 如何运行

在 **view 包根目录** 执行：

```bash
# 单元 + 集成（推荐日常 / CI 主路径）
deno task test
# 等价：deno test -A tests/unit tests/integration

# 仅集成
deno task test:integration

# 浏览器 E2E（需 examples 环境 / 浏览器依赖）
deno task test:e2e

# 性能基准（不计入 pass/fail）
deno task bench

# Bun（preload happy-dom）
bun test --preload ./tests/unit/dom-setup.ts tests/
```

| 注意            | 说明                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| DOM 注入顺序    | 部分套件依赖 `dom-setup`；**勿**在全局缓存 `typeof Node` 于模块顶层（happy-dom 可能晚于 import） |
| Deno / Bun 条数 | 两运行器对 `it`/钩子的计数方式不同，**以 0 失败为准**，不必强行对齐数字                          |
| SSR             | 无浏览器 `document` 时由框架安装极简 SSR DOM；相关用例见 `ssr-bootstrap`、`runtime/server`       |

---

## 3. 最新结果（本报告统计）

### 3.1 Deno：`tests/unit` + `tests/integration`

| 项         | 值                                                 |
| ---------- | -------------------------------------------------- |
| **通过**   | **359**                                            |
| **失败**   | **0**                                              |
| **通过率** | **100%**                                           |
| **耗时**   | 约 **27s**（Apple Silicon 笔记本量级，视机器浮动） |
| **命令**   | `deno test -A tests/unit tests/integration`        |

### 3.2 Bun

- 历史基线（同结构树）：**0 失败**；用例条数通常 **低于 Deno**（报告方式差异）。
- 建议在发版前再跑：`bun test --preload ./tests/unit/dom-setup.ts tests/`。

### 3.3 E2E

- 模块：`tests/e2e/examples-e2e.test.ts`
- 覆盖 examples 站点多页交互（Signal、Form、Store、Router、Boundary、布局、404
  等，约 **20+** 场景）。
- 需本机浏览器与 examples 服务；**默认 `deno task test` 不包含 E2E**。

### 3.4 Bench

- `tests/bench/signal.bench.ts`：Signal 写、同值跳过、batch + 多 Effect。
- `deno task bench` 仅作性能回归参考，**不**作为 CI 红绿门禁（除非另行配置）。

---

## 4. 按模块覆盖说明

### 4.1 单元测试 `tests/unit/`

| 目录 / 主题                      | 覆盖要点                                                                                                                                                                                                                         | 状态 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **reactivity/**                  | Signal（含 `.value`/元组/调用）、Effect、Memo、Owner/`cleanNode`、Store（含 `Object.is`）、Selector、Context、生命周期、错误冒泡、cycle、createDeferred / useTransition                                                          | ✅   |
| **runtime/**                     | `insert`、数组锚点、details、props/setProperty、**受控 value 焦点稳定**、IME 组合期、事件委托、`Show`/`For`/`Index`/`Switch`、键控列表（无 span 壳）、Suspense、Portal、Hydration、HMR、template/walk、mount 细节、stress 大列表 | ✅   |
| **compiler/**                    | analyzer 静态提升、transformer（template/walk 路径常量、少 Effect）、directive、path-gen、SSR 生成模式、HMR 注入                                                                                                                 | ✅   |
| **integrations/**                | Form 校验/handleSubmit、Resource + Suspense/ErrorBoundary、**Router 全功能**、**Router SSR 同构**（`matchRoute` / `renderRouterToString`）                                                                                       | ✅   |
| **scheduler/**                   | batch 微任务合并、priority 队列                                                                                                                                                                                                  | ✅   |
| **server/**                      | view.config、layout 链、routers codegen、createApp 冒烟、semver 工具                                                                                                                                                             | ✅   |
| **utils/**                       | `escapeForText` / Attr / AttrHtml 快路径与转义                                                                                                                                                                                   | ✅   |
| **ssr-bootstrap / ssr-complete** | 无预置 document 的 SSR、SSR→hydrate 响应式                                                                                                                                                                                       | ✅   |
| **optimize / i18n**              | optimize 插件形态、locale / `$tr`                                                                                                                                                                                                | ✅   |

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

## 5. 近期相对 2.0.0 报告的增补（与优化相关）

下列能力在 **2.0.4** 周期内加强了自动化覆盖，便于对照 CHANGELOG / 源码：

| 主题            | 代表测试                                           | 说明                                                                             |
| --------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| 受控表单焦点    | `runtime/props-advanced.test.ts`                   | 同值不写 `el.value`、**number 与 DOM 字符串**、**IME composition**、节点身份稳定 |
| For 键控无壳    | `runtime/control-flow.test.ts`、`stress.test.ts`   | 注释锚点、同引用重排复用、直接子元素                                             |
| Signal registry | `reactivity/signal-optimization.test.ts`           | 生产匿名不进 registry；`VIEW_DEV` 供 HMR                                         |
| Router SSR      | `integrations/router-ssr.test.ts`                  | `parseRouterUrl`、`matchRoute`、`renderRouterToString`                           |
| 编译少 Effect   | `compiler/transformer.test.ts`、`analyzer.test.ts` | 静态三元/模板串提升、walk `_path$N`                                              |
| escape 快路径   | `utils/escape.test.ts`                             | 无特殊字符零分配                                                                 |
| Bench           | `tests/bench/signal.bench.ts`                      | 可选性能基线                                                                     |

---

## 6. 运行时与适配说明

### 6.1 跨运行时（Deno / Bun）

- 异步用例多用 **`waitUntilComplete`** / 微任务，保证
  Suspense、路由导航等中间态可断言。
- 路由 codegen 对 **metadata / routePath / inheritLayout**
  等采用**源码静态解析**，降低 Bun 下动态 `import()` TSX 的依赖。

### 6.2 响应式与 Resource / Suspense

- ErrorBoundary 恢复后 Resource 须**重新注册**到 Suspense（有专门用例）。
- Super Signal：元组、`.value`、调用式均在 `signal.test.ts` 覆盖。

### 6.3 受控输入与焦点（重要）

- 框架在 `setProperty("value")` 路径：字符串化比较、IME
  组合期禁止回写、必要时尝试恢复选区。
- 业务侧若用 `Show`/`For` **整段拆掉** input
  节点，焦点仍会丢——属结构重建，需稳定 key / 避免条件换根节点。

### 6.4 SSR

- `renderToString` / `renderRouterToString` 在 SSR 作用域内安装临时 DOM；结束后
  `cleanNode` + 拆除，避免泄漏到后续请求。

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

---

## 8. 结论

**@dreamer/view 2.0.4** 在当前主路径自动化套件下：

- **Deno 单元 + 集成：359 通过 / 0 失败（100%）**
- 覆盖核心响应式、运行时 DOM、**受控表单焦点**、编译器、SSR/水合、路由（含 **SSR
  同构**）、表单、调度、工具链与集成场景
- E2E 与 bench 作为补充：发版建议单独跑 E2E；bench 用于性能观察

本报告随 `tests/` 与发版节奏更新；数字以本机最新
`deno test -A tests/unit tests/integration` 为准。
