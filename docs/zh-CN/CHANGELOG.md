# 变更日志

@dreamer/view 的变更均记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 变更

- **P0：examples 浏览器 E2E 入 CI（非破坏）**
  - 新增仅 ubuntu 的 workflow job `e2e-examples`：安装 Playwright Chromium
    `1.59.1`（`--with-deps`）并跑 `deno task test:e2e`；失败即红。**未**放宽断言
    （含 form `agree`）。
  - 9-job Deno／Bun／Node × OS **unit＋integration** 矩阵保持无浏览器；注释写明
    为何不把 E2E 塞进 Windows／无浏览器 runner。
  - 文档：[`P0-e2e-into-ci.md`](./P0-e2e-into-ci.md)／
    [`../en-US/P0-e2e-into-ci.md`](../en-US/P0-e2e-into-ci.md)；README／
    TEST_REPORT 写清本地 `deno task test:e2e`／`deno test -A tests` 与 CI 关系。
  - 禁 JSR／npm；**未**放宽 `size:check`／`consumer:bundle:check`。


### 文档

- **P1-2：水合质量 opt-in 试点（`mismatchMode` · 2.x 加法，非破坏）**
  - 新增 [`P1-2-hydration-opt-in-pilot.md`](./P1-2-hydration-opt-in-pilot.md)／
    [`../en-US/P1-2-hydration-opt-in-pilot.md`](../en-US/P1-2-hydration-opt-in-pilot.md)：
    文档化 `continue`／`assert`／`remount` 与推荐用法；说明渐进／分片水合钩子**尚未**提供。
  - `/csr` 加法导出类型 `HydrationMismatchMode` 与 `resolveMismatchMode`（主入口本已
    `export *` hydration）；单测锁死默认 **`continue`**；examples `/runtime` 三档试点。
  - **未**改生产默认 `mismatchMode`（仍 `continue`）；禁 JSR／npm；**未**放宽
    `size:check`／`consumer:bundle:check`／E2E 断言。


### 修复

- **P0-hotfix：examples form E2E `page.evaluate` 宿主超时（非破坏）**
  - 根因：`/form` 示例 `createForm` 规则要求勾选 `agree`；E2E 未勾选即点「立即提交」，
    `handleSubmit` 不进入 onValid → 「提交成功」永不出现。`t.browser.waitFor` 宿主 timeout
    与 Playwright `waitForFunction` 同值，条件不成立时易误报 `page.evaluate` 宿主超时
    （非业务主线程卡死／非 CDP 必挂）。
  - 修复：勾选「我已阅读并同意服务条款」后再提交；用 Playwright heading locator 等待
    「提交成功」；重置后断言用户名恢复为初始值 `dreamer`。**未**放宽断言；E2E **未**入 CI 矩阵。
  - 禁 JSR／npm。

### 修复

- **P0-hotfix：examples 从 `/reactivity` 导入 `batch` 失败（非破坏）**
  - 根因：`batch` 实现在 `scheduler/batch`，主入口／`/scheduler`／`/csr` 已导出，但
    `src/reactivity/mod.ts` **未** re-export；README §7.4 与 `examples/.../signal` 却从
    `@dreamer/view/reactivity` 导入 → `deno task dev` 报 `No matching export ... "batch"`。
  - 修复：在 `/reactivity` **便利 re-export** `batch`（规范入口仍为 `/scheduler`）；同步
    README（根／zh／en）子路径表说明。
  - **无**运行时语义变更；禁 JSR／npm；**未**放宽 `size:check`／`consumer:bundle:check`。

### 文档

- **P1-1：主入口 barrel 弃用预告（策略 A · 2.x 加法，非破坏）**
  - 新增 [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md)／
    [`../en-US/P1-1-main-entry-deprecation-preview.md`](../en-US/P1-1-main-entry-deprecation-preview.md)：
    子路径优先、迁移步骤、与 P0／P0-2 体积关系；**不**删 export、**不**改运行时默认。
  - `src/mod.ts` 模块级 JSDoc `@deprecated`（**无**运行时 `warn`／副作用）。
  - README（根／zh／en）「便捷全家桶」与架构 § 标明弃用预告并互链；分析索引更新。
  - **未**放宽 `size:check`／`consumer:bundle:check` 基线；禁 JSR／npm；**非** 3.0 瘦身落地。

### 新增

- **P0-2：消费方／examples bundle analyze + 独立体积预算（非破坏）**
  - 新增 `scripts/consumer-bundle/`：夹具覆盖具名导入、`export *`／namespace、examples 主入口镜像与 API 并集；
    `measure.mjs --write` → `consumer-bundle-baseline.json`；
    `check.mjs`／`deno task consumer:bundle:check` 默认 **+5%**；CI ubuntu `consumer-bundle-check`。
  - 关键结论（esbuild）：具名从主入口 vs 子路径 minify **Δ≈0**；`export *` 主入口相对 `/reactivity` 约 **+34 KiB minify（~4.26×）**／**+12 KiB gzip**。
  - 文档：[`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md)／
    [`../en-US/P0-2-consumer-bundle-analyze.md`](../en-US/P0-2-consumer-bundle-analyze.md)。
  - **未**放宽既有 `size:check`／`bundle-size-baseline.json`；**无**运行时语义变更；禁 JSR／npm。


### 文档

- **P0-4：组件作者指南（Memo／ref／订阅边界，非破坏）**
  - 新增 [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md)／
    [`../en-US/P0-4-component-author-guide.md`](../en-US/P0-4-component-author-guide.md)：
    心智模型（setup 一次）、**勿顶层读 Signal 致整段替换**、Memo 何时用／勿当稳定仓库、
    `ref(null)` 瞬态与 `isConnected`、Effect 订阅边界、`Context` 勿传裸函数 value、
    受控 props 传 Signal／getter；沉淀自分析 P0-4 与 ui-view 踩坑注释。
  - README §二十二／§二十五互链；**无**运行时语义变更；禁 JSR／npm。

### 修复

- **CI：消除 Node 20 动作在 Node 24 runner 上的弃用警告**
  - `actions/checkout@v4` → `@v5`，`actions/setup-node@v4` → `@v5`（均 `runs.using: node24`）。
  - 去掉 workflow 级 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`（升版后不再需要强制）。
  - **未**改业务测 Node 矩阵（仍为 22）；禁 JSR／npm。

### 新增

- **P0-3：编译器静态子树覆盖率基线 + golden（非破坏）**
  - `scripts/compiler-coverage/`：19 条 JSX 语料；`measure.ts --write` →
    `compiler-coverage-baseline.json` + `goldens/*.out.txt`；
    `check.ts`／`deno task compiler:coverage:check` 精确对齐指标与 golden 全文。
  - 指标（compile body）：`template`／`walk`／`insert`／`setAttribute`／`setProperty`／
    `spread`／`memo`／path；`staticDomOpFreeRatio` 基线约 **0.5789**（11/19）。
  - 单测 `tests/unit/compiler/golden.test.ts`；CI ubuntu `compiler-coverage-check`。
  - 文档：[`P0-3-compiler-static-coverage-and-golden.md`](./P0-3-compiler-static-coverage-and-golden.md)／
    [`../en-US/P0-3-compiler-static-coverage-and-golden.md`](../en-US/P0-3-compiler-static-coverage-and-golden.md)。
  - **无**默认编译／运行时语义变更；禁 JSR／npm。

### 修复

- **P0-3 CI：golden 单测跨 Deno／Bun／Node**
  - `tests/unit/compiler/golden.test.ts` 不再使用 `jsr:@std/path`／`Deno.readTextFile`；
    改为 `@dreamer/runtime-adapter` 的 `dirname`／`fromFileUrl`／`join`／`readTextFile`，
    与既有 unit（如 `version.test.ts`／`routers-codegen.test.ts`）一致。断言与覆盖率指标不变。


### 新增

- **P0-1：真实页 Profiling 对照 + Signal／Effect／For／insert bench 入 CI（非破坏）**
  - 新增 `tests/bench/insert.bench.ts`（静态文本／Signal thunk／数组子节点）；既有
    `signal.bench.ts`（含 Effect）与 `for.bench.ts` 一并纳入门禁。
  - `scripts/bench-baseline/`：`measure.mjs --write` → `bench-baseline.json`；
    `check.mjs`／`deno task bench:check` 按 **avgNs ≤ 基线 +100%**（可调）；
    CI ubuntu `bench-check` 使用 `BENCH_BUDGET_PCT=300` 防数量级回退、减 flake。
  - 文档：[`P0-1-profiling-and-bench-ci.md`](./P0-1-profiling-and-bench-ci.md)／
    [`../en-US/P0-1-profiling-and-bench-ci.md`](../en-US/P0-1-profiling-and-bench-ci.md)；
    可选本地探针 `scripts/profiling/local-probe-example.ts`（**不进** `src/` 热路径）。
  - **无**运行时默认语义变更；禁 JSR／npm。


### 文档

- **分析文档治理（P1-6，仅文档）**
  - 入库现行 [`view-framework-analysis.md`](./view-framework-analysis.md)（v2.2.0／2026-11-03）。
  - 新增 [`分析文档状态.md`](./分析文档状态.md)／[`../en-US/analysis-doc-status.md`](../en-US/analysis-doc-status.md)：标明本地 `analysis/`（gitignore）中 v1／早期架构文为过时／漂移，并指向现行分析与 README。
  - 本地 `analysis/` 对应旧文加水印；修订 [`3.0.0-规划分析.md`](./3.0.0-规划分析.md) 相关链接；中英 README §25 增加入口。
  - **无**运行时／导出变更；禁 JSR／npm。


### 修复

- **体积门禁：压 `/form` 入口（不改阈值、不刷基线）**
  - Form `field(as)`／`messageFromSafeParse` 胶水保留；收紧 `field` 实现（统一 `onChange`、省略默认 `"text"` 字面量等），使 `@dreamer/view/form` minify／gzip 回到基线 **+5%** 内。
  - **未**放宽 `size:check` 阈值、**未**改 CI job、**未**刷新 `bundle-size-baseline.json`；禁 JSR／npm。

### 新增


- **Form checkbox／select／schema 桥（2.x 加法）**
  - `field(name, { as? })`：可选 `checkbox`／`select`／`textarea`／`number`；省略第二参时与旧版文本绑定兼容。
  - 导出 `messageFromSafeParse`：把类 Zod `safeParse` 结果映射为 `rules` 文案（无 schema 运行时依赖）。
  - 示例页 `examples/src/views/form` 覆盖 checkbox／select／schema 桥；中英 README §16 同步。
  - 单测补 checkbox／select／`messageFromSafeParse`。**禁** JSR／npm 发版。

### 新增

- **体积 CI 门禁（2.x 非破坏）**
  - `scripts/size-baseline/check.mjs`＋`deno task size:check`：对照已提交
    `bundle-size-baseline.json`，主入口与关键子路径的 **minify／gzip(min)**
    不得超过基线 **+5%**（`Math.ceil`）；超限非 0 退出，可供 CI／本地 preflight。
  - 阈值可用 `--budget-pct` 或 `SIZE_BUDGET_PCT` 覆盖；故意涨包则
    `deno task size:baseline` 刷新 JSON 并入库。
  - 基线已按 Resource Abort（`b0c8786`）后的当前体积重打（resource／主入口等随之更新）。
  - CI 增加 ubuntu `size-check` job。**无**运行时默认行为变更；禁 JSR／npm 发版。


### 新增

- **Resource 可选 AbortSignal＋inflight 去重文档（2.x 加法）**
  - `createResource` 每次 load 向 fetcher 传入第二参 `{ signal: AbortSignal }`；
    source 变化／`refetch` 会 abort 上一趟；可选第三参
    `{ signal }` 供路由离开等外层取消。不传／不用 signal 时默认行为与现网一致；
    abort **不**写入 `error`。
  - 导出 `createInflightDedupe()`（按 key 复用 in-flight Promise；**非** HTTP 缓存）。
  - 中英 README §11 同步 Abort／去重用法；补 `resource-abort` 单测。

### 文档

- **强推子路径导入（2.x 非破坏）**
  - 中英 README／入门默认示例改为优先
    `@dreamer/view/reactivity`／`/csr`／`/ssr`／`/router`／`/form`／`/resource` 等；
    主入口仅保留「便捷全家桶」小节，并引用 P0 体积数字（minify 主入口 ~43.5 KiB vs
    `/reactivity` ~10.5 KiB）。
  - 修正架构说明中「不存在 /router／/csr」的过时表述；同步 `docs/en-US/README.md`。
  - 仓库 `examples/` 与 `view-cli init` 脚手架导入改为子路径；**无**运行时／导出破坏。

### 新增

- **P0 工程基线（体积／性能，非破坏）**
  - `scripts/size-baseline/`：用本仓库 esbuild 测量主入口与子路径
    （`reactivity`／`csr`／`ssr`／`router`／`form`／`resource`）的 raw／minify／gzip；
    命令 `node scripts/size-baseline/measure.mjs --write` 或 `deno task size:baseline`。
  - `scripts/size-baseline/bundle-size-baseline.json`、`docs/zh-CN/P0-bench-baseline.md`、
    `analysis/P0-基线-体积与性能.md`（gitignore 工作副本）／`docs/zh-CN/P0-基线-体积与性能.md`（入库）：可复现数字与「下一条 2.x 优化」建议
    （文档强推子路径导入）。
  - `deno task size:baseline`／`bench:baseline` 任务入口。

### 说明

- **无运行时／API 行为变更**；未发 JSR／npm；响应式内核未改。
- 真实页 Effect／DOM 计数：见报告「如何测」——本刀不向核心加计数器。

---

## [2.2.0] - 2026-07-23

### 新增

- **Node.js 22+ 兼容** — `@dreamer/view` 现可运行于 Deno 2.9+、Bun 1.3+、
  Node.js 22+，核心运行时/编译器/响应式源码零改动。
  - `package.json`：`engines.node >= 22`，`test:node` 脚本经 tsx 执行。
  - `test-node.mjs`：Node 测试运行器——每文件在主进程执行（无 `--test`
    fork/IPC），规避测试向 stdout 输出时 "Unable to deserialize cloned data"
    问题。排除 E2E 与 Deno 专属集成测试。
  - `tsconfig.json`：Bundler 模块解析 + `dom` lib，跨运行时类型一致。
  - CI：9-job 矩阵（3 Deno v2.9 + 3 Bun + 3 Node 22，无 Chromium）。
- **CLI Node 支持**：`upgrade` 命令在 Node 上用 `npx jsr run`；`update` 命令
  在 Node 上用 `npm update`。`getRuntime()` 不再对 Node 抛错。

### 变更

- **deno.json**：全部 `@dreamer/*` 依赖升至 Node 兼容版本
  （runtime-adapter ^1.2.2、i18n ^1.1.2、console ^1.1.0、esbuild ^1.3.0 等）；
  `compilerOptions.lib` 加 `deno.ns` 以在 `nodeModulesDir: "auto"` 加载
  `@types/node` 时保留 `import.meta.main`；`minimumDependencyAge: "0"`。
- **publish.yml**：移除 `deno check` 门槛（JSR 发布内部用 `--no-check`）；
  Deno 升至 v2.9。

### 测试

- **Deno** 单元+集成 **394** / **Bun** **326** / **Node.js 22** **65/65 文件**
  — 三端 0 失败。
- 排除 `tests/integration/dweb-import-ssr.test.ts` 于 Node CI（起 Deno 子进程，
  依赖 dweb 项目的 `deno.json`）。

---

## [2.1.0] - 2026-07-22

### 新增

- **按需子路径（tree-shake 友好，主入口仍完整 re-export）**：
  - `@dreamer/view/reactivity` — Signal / Effect / Memo / Owner / Store /
    Context
  - `@dreamer/view/scheduler` — `batch` / 优先级调度
  - `@dreamer/view/router` — `createRouter` / `Link` / …
  - `@dreamer/view/form` — `createForm`
  - `@dreamer/view/resource` — `createResource`
  - `@dreamer/view/control-flow` — `Show` / `For` / `Switch` / `ErrorBoundary`
    等
  - `@dreamer/view/csr` — CSR 聚合（signal + mount/hydrate + 控制流 +
    Suspense，无 SSR/router）
- **水合选项
  `HydrateOptions`**（第三参可为数组绑定表，或对象；**兼容**旧数组写法）：
  - `bindings` / `warnMismatch` / `onMismatch`
  - **`mismatchMode`**：`continue`（默认）| `assert` | `remount`
  - `getHydrationMismatches()` 读取本轮错位
- **`package.json` `sideEffects: false`**：利于 bundler 摇树。

### 变更

- **编译器**：组件静态/非响应式 props 不再包 `() => …`；静态 `&&` / `||`
  可折叠进 模板。
- **文档**：中英文 README 子路径表与示例；推荐按需导入写法。

### 测试

- 增补 `subpaths`、hydration assert/remount、编译器逻辑与/或 等用例。
- **Deno** 单元+集成 **394** / **Bun** 单元+集成 **326**，0 失败。

### 说明

- **无破坏性变更**：既有 `import { … } from "@dreamer/view"` 与
  `hydrate(fn, el, bindings[])` 仍有效。
- 主入口删除 re-export 瘦身属未来 **3.0** 议题，不在本版。

---

## [2.0.6] - 2026-07-22

### 安全

- **`setProperty` / URL 属性**：`href` / `src` / `action` 等经 `sanitizeUrl`
  消毒； 拦截 `javascript:` / `vbscript:` /
  `data:text/html`（含零宽字符与空白混淆）。
- **事件 handler**：仅接受函数；字符串 `onClick="..."` 等不再写入。
- **`on*` 判定**：第三字符须为大写（`onClick`），避免误伤 `open` / `once`
  等属性。
- **内联 style**：剥离 `expression(` / `javascript:`。
- **props 拒绝** `innerHTML` / `outerHTML` 直接写入（控制台警告）。

### 变更（性能 / 精简，公共 API 不变）

- **For + key 重排**：基于当前 DOM 行序的 **LIS** 最小移动；整序正确仍为 no-op；
  错位有安全兜底。
- **`insert`**：Signal 专用 Effect 快路径；数组插入统一 `isDomNode`。
- **escape / SSR**：`escapeForText` / `escapeForAttr` 单路径实现， `ssr-dom`
  复用共享转义。
- **编译器**：扩大静态表达式（`void` / `typeof` 字面量 / `satisfies` 等），
  更多属性进模板、更少 Effect；`isStaticExpression` 集中复用。
- **依赖**：`@dreamer/runtime-adapter` ^1.1.0、`@dreamer/test` ^1.1.10 等对齐。

### 测试 / 工程

- Bun：`bunfig.toml` 默认 preload `tests/unit/dom-setup.ts`（与 `package.json`
  test 脚本一致，避免隔离环境缺 DOM）。
- 增补：For 反转/洗牌与中间插入、props 安全、escape URL 混淆、编译器
  typeof/void、`for.bench.ts` 等。
- **Deno** 单元+集成 **384** / **Bun** 单元+集成 **317**，0 失败。

### 说明

- **无** 公共 API / `exports` 破坏性变更；适合作为 2.0.x 的 patch。
- Tree-shake 子路径已在 **2.1.0** 落地。

---

## [2.0.5] - 2026-07-10

### 修复

- **SSR 伪 DOM（Deno/Bun 无 document）**：`SsrElement` 补齐 **`hasAttribute`** /
  **`toggleAttribute`**；`style` 支持 **`removeProperty` / `setProperty` /
  `getPropertyValue`**；同步 **`id`** getter/setter。修复 dweb hybrid 等在
  `setProperty` 属性分支对 `null`/`undefined` props 时
  `TypeError: el.hasAttribute is not a function`。
- **`setProperty` 防御**：attribute 分支在宿主无 `hasAttribute` 时回退
  `getAttribute`，避免非 Element 宿主再次硬崩。

### 变更（SSR 伪 DOM 补全）

- **节点基类**：`nodeName`、`parentElement`、`isConnected`、`contains`、
  `hasChildNodes`、`lastChild`、`getRootNode`、`dispatchEvent`。
- **元素**：`classList`、`dataset`、`matches` / `closest`、
  `querySelector(All)`、`children` / `firstElementChild` / `lastElementChild`、
  `append` / `prepend` / `before` / `after` / `replaceWith`、NS 属性、
  `name`/`type`/`href`/`src`/`disabled`/`tabIndex`、`focus`/`blur` 空操作。
- **document**：惰性 `head` / `body`、`querySelector(All)`、`importNode`、
  `defaultView`。
- **简易选择器**：`*`、tag、`#id`、`.class`、`[attr]`、`[attr=value]`、空格后代、逗号
  OR。

### 测试

- 新增并扩展 `tests/unit/runtime/ssr-dom-element-api.test.ts`（**18** 条）：
  属性/NS、style、setProperty null、classList 全套、dataset、matches/closest/
  query（含后代与逗号）、节点关系、Text/Comment、append/before/after/replaceWith、
  反射属性、innerHTML、document.head/body/importNode、Fragment、renderToString。
- **Deno + Bun** 均通过。

---

## [2.0.4] - 2026-07-10

### 新增

- **路由 SSR 同构**：`CreateRouterOptions.url` / `ssr`、`parseRouterUrl`、
  `matchRoute`；`@dreamer/view/ssr` 的 `renderRouterToString` 一站式渲染。
- **路由 render**：带 `params`/`query` 的同步页面组件不再误走异步 Resource
  （避免 SSR 空 HTML）。
- **编译器**：扩大静态表达式提升（三元、模板串、`as`/非空断言）；模块级 `walk`
  路径常量 `_path$N`；明显静态属性更少 Effect。
- **受控输入**：IME 组合期禁止回写 `value`；与 DOM 按字符串比较；必要时尽量
  恢复选区。
- **Bench**：`tests/bench/signal.bench.ts` 与 `deno task bench`。
- **测试**：Router SSR、焦点/IME、escape、For 键控无壳、编译器静态用例等。

### 变更

- **For + key**：注释锚点替代 `span` 壳；顺序正确时跳过重排；仅追踪 item 以便
  纯重排复用节点。
- **Signal**：生产环境匿名信号不进全局 registry；`VIEW_DEV` 下仍注册以支持 HMR。
- **Store**：匿名 id 不再使用 `Error().stack`；代理 set 使用 `Object.is`。
- **运行时微优化**：mount 清空、template 有界缓存、className/cssText 同值跳过、
  priority drain 缓冲、path 分段、form errors 初值、SSR stringify、cleanNode
  等热路径分配收敛。
- **文档**：中英文 `TEST_REPORT.md` 更新（Deno 单元+集成 359 通过）。

### 修复

- **失焦/丢光标**：number Signal 与 DOM 字符串 `value` 不再每键强制赋值；IME
  组合期间不冲刷输入框。

---

## [2.0.3] - 2026-07-06

### 变更

- **依赖**：`@dreamer/esbuild` 由 `^1.1.9` 升至 `^1.2.0`（`deno.json` 与
  `package.json` 同步），获得 jsr: 运行时回退与动态 `import()` 缓存覆盖。

### 新增

- **响应式（`signal.ts`）**：`Observer` 新增 `hasObservers` 标记，替代 `notify`
  / `notifyCheck` 中的 `"observers" in` 运行时检查，避免原型链遍历 开销。
- **响应式（`signal.ts`）**：`cleanupObserver` 断开订阅时清理 `Subscription`
  节点的交叉引用（source/observer/prev/next 指针），辅助 GC 回收。
- **响应式（`owner.ts`）**：`adoptChild` 用 `Set` 做 O(1) 包含检查替代
  `Array.includes` O(n)；`cleanNode` 移除时同步清理 Set。
- **调度器（`batch.ts`）**：`runPendingSlice` 原地交换 pending 数组，不再
  `[...core.pending]` 展开，避免每次 flush 分配新数组。
- **测试**：新增 `cycle-detection`、`signal-optimization`、`insert-reactive`
  单元测试。

### 修复

- **响应式（`effect.ts`、`memo.ts`）**：Memo 上游检测由 `"run" in sub.source`
  改为 `typeof run === 'function'`，避免非 Memo 源恰好有 `run` 属性时的误判。

---

## [2.0.2] - 2026-04-18

### 变更

- **依赖**：`deno.json` 中 JSR 版本区间上调 — `@dreamer/server` 至 `^1.1.2`、
  `@dreamer/test` 至 `^1.1.3`、`@dreamer/plugins` 至 `^1.1.0`；`package.json` 中
  npm 别名与之对齐。
- **示例**：`examples/package.json` 与 `examples/deno.json` 中将
  `@dreamer/plugins` 调至 `^1.1.0`、`@dreamer/esbuild` 调至 `^1.1.6`。

## [2.0.1] - 2026-04-10

### 新增

- **`RefObject<T>`**：**`current`** 必存在（初始可为 `null`）；**`createRef`**
  现返回 **`RefObject<T>`**，便于类型收窄。
- **`MaybeAccessor<T>`** 与 **`readAccessor`**：控制流入参可为**静态值**、**零参
  getter** 或 **`createSignal` 元组 getter**；用于
  **`Show`**、**`For`**、**`Index`**、**`Match`**、
  **`ErrorBoundary.resetKeys`**。
- 主包再导出 **`isSignal`**、**`readAccessor`**、**`unwrap`**，供组件库与
  `insert` 对 Signal/函数的判定保持一致。
- **`@dreamer/view/jsx-runtime`** 与 **`jsx` 一并再导出 **`createRef`**、**
  `getDocument`**， 仅打 JSX 子路径时也可使用 ref 容器。
- **`createRef` / `getDocument` JSDoc** 与 **`mod.ts`** 架构说明补充。

### 修复

- **`insert`（数组）**：子项**依次插入真实父节点**，不再经
  **`DocumentFragment`** 中转（fragment 进文档后会被搬空，Effect
  仍指向已脱离文档的 fragment，导致多节点场景 如密码多行不可见等问题）。
- **数组段**：尾锚注释 **`<!--view:array-end-->`** + **`WeakMap`**
  记录首节点，响应式重跑时 整段摘除/替换；文档说明勿再套 **`display:contents`
  壳**（会破坏 Tailwind **`space-y-*`**、 **`:first-child`**
  等）；**`<details>`** 多子路径保证 **`summary`** 为首个**元素**子节点，
  满足内容模型。
- **事件委托**：**`onMouseEnter` / `onMouseLeave` / `onPointerEnter` /
  `onPointerLeave`** 改为元素上 **直连 `addEventListener`**（上述事件不冒泡到
  `document`**）。
- **DOM 属性**：**`id`**、**`name`**、**`for`** 等在值为 **`undefined` /
  `null`** 时 **移除特性**，避免浏览器写成字面量 **`"undefined"`**（破坏 label
  与表单语义）。

### 变更

- **`ViewRefObject`**：标明为宽松形态（**`current`** 可选）；**`RefObject`** 为
  **`createRef`** 的严格返回类型。

### 测试

- 补充
  **`insert`**（数组、**`<details>`**）、**`props`**（非冒泡事件、移除属性）、
  **`dom`/ref**、**控制流 `MaybeAccessor`** 等单元测试。

## [2.0.0] - 2026-04-06

本版本将 **2.0.0** 作为文档与发布基线。下文按能力维度**汇总框架提供的功能**（与
1.x 逐条差异无关）。

### 响应式与状态

- **Signal**：同一返回值支持 **`.value`**、调用式 **`s()` / `s(x)`**、元组解构
  **`const [get, set] = createSignal(initial)`**；可选**具名信号**便于
  HMR/调试。
- **Effect**：**`createEffect`**、偏同步的 **`createRenderEffect`**（响应式 DOM
  属性等）；依赖收集与 Owner 上的清理。
- **Memo**：**`createMemo`** 与别名 **`memo`**。
- **批处理与调度**：**`batch`**、**`untrack`**，以及 **`scheduler/batch`**、
  **`scheduler/priority`** 的微任务/优先级排空。
- **生命周期与错误**：**`onMount`**、**`onCleanup`**、**`onError`**、
  **`catchError`**，与 **ErrorBoundary**、Owner 冒泡配合。
- **延迟与过渡**：**`createDeferred`**、**`useTransition`**、
  **`startTransition`**。
- **Selector**：**`createSelector`**，列表选中态等按 key 缓存，避免整表重算。
- **Context**：**`createContext`**、**`Provider`**、**`useContext`**（透明
  Provider，不新建 Owner）。
- **Store**：深度代理、**`setState`**、**`produce`**、**`reconcile`**，可选
  **具名单例**与 **persist**（**`key`**、**`storage`**、**`serialize`** /
  **`deserialize`**）；数组根状态有独立更新路径。

### 运行时与 DOM

- **无虚拟 DOM**：JSX 为 Thunk；**`insert(parent, value, current?, before?)`**
  做细粒度 DOM 更新与订阅。
- **`template` / `walk`**：静态 HTML 克隆与路径寻址，供编译产物与高级用法。
- **属性与事件**：**`setProperty`**、**`spread`**、**`setAttribute`**，委托事件与
  受控输入；**`getDocument`**、**`createRef`** 安全访问文档与 ref。
- **挂载**：**`mount`**（清空容器、处理 **`data-view-cloak`**）、**`hydrate`**
  （可选编译器 **binding map**）；**`createRoot` + `insert`** 拿 **`dispose`**
  做整树卸载。

### 控制流与异步 UI

- **组件**：**`Show`**、**`For`**、**`Index`**、**`Switch` / `Match`**、
  **`Dynamic`**、**`lazy`** + **`Suspense`**。
- **异步数据**：**`Suspense`**、**`createResource`**（含 **`source + fetcher`**
  重载），loading/error、**`mutate` / `refetch`**；含 **ErrorBoundary** 恢复后
  对新边界的再注册。
- **错误边界**：**`ErrorBoundary`**，**`fallback`**、**`reset`**、**`resetKeys`**。
- **传送门**：声明式 **`Portal`** 与命令式 **`createPortal`**（亦可从
  **`@dreamer/view/portal`** 单独引用）。

### 路由、配置与 CLI

- **SPA 路由**：**`createRouter`**、**`mountWithRouter`**、**`Link`**、
  **`useRouter`**、**`navigate` /
  `replace`**，动态段、尾缀捕获、**`beforeEach`**、
  **`basePath`**、滚动行为、可选同源 **`a`** 委托、**`router.render()`** 做布局
  嵌套。
- **文件式工程**（**`view-cli init`**）：**`view.config.ts`**、**`src/views/`**
  约定（**`_app`**、**`_layout`**、**`_loading`**、**`_404`**、**`_error`**），由
  扫描生成的 **`src/router/routers.tsx`**，支持
  **`routePath`**、**`metadata`**、 **`inheritLayout`**、**`loading`**
  等静态解析（扫描器不依赖 JSX 环境的动态 **`import()`**）。
- **服务端辅助**：**`loadViewConfig`**、布局链、**`generateRoutersFile`**、
  **`createApp`**，dev/prod 服务与构建编排（见 **`server/core`**）。
- **全局 CLI**：安装 **`deno run -A jsr:@dreamer/view/setup`** 后使用
  **`view-cli init | dev | build | start | upgrade | update | version`**；CLI
  与框架文案内置 **i18n**。
- **CSR 客户端构建映射**：**`toClientConfig`** 将 **`view.config` 的
  `build.sourcemap`** （**`boolean` 或对象**）传入 **`@dreamer/esbuild` 的
  `ClientConfig.sourcemap`**； 仅在布尔或未配置时写入
  **`bundle.sourcemap`**，避免对象形式的 map 配置被压成 **`true`**，保证生产构建
  source map 选项生效（**`dev`** 仍为 HMR 强制 sourcemap）。

### 表单

- **`createForm`**：**`field(name)`**（**`value` + `onInput`**），可选
  **`rules`**、 **`validate` / `validateField`**、**`validateOn`**（**`submit` /
  `change` / `blur`**）、**`handleSubmit`**、**`reset`**，Store 型 **`data` /
  `errors`**，**`produce`** 更新。

### 编译器、优化与 SSR

- **`@dreamer/view/compiler`**：**`compileSource`**、**`transformJSX`**，DOM/SSR
  生成、水合标记、HMR 包装注入，分析器与路径生成、指令转换等。
- **`@dreamer/view/optimize`**：**`optimize`** 压缩 **`template("…")`** 字面量，
  **`createOptimizePlugin`** 接入 esbuild。
- **`@dreamer/view/ssr`**：**`renderToString`**、**`renderToStringAsync`**、
  **`renderToStream`**、**`generateHydrationScript`**，极简 SSR **`document`**
  与 **`enterSSRDomScope` / `leaveSSRDomScope`**、**`queueSsrAsyncTask`**、
  **`registerSSRPromise`**、**`isServer`** 等。

### 开发体验

- **HMR**：**`createHMRProxy`**（**`VIEW_DEV`** 下由 CLI/编译注入为主）。
- **JSX 运行时**：**`jsx` / `jsxs` / `Fragment`** 与 dev 入口，兼容 Deno/Bun 对
  **`jsxDEV`** 的解析需求。
- **类型**：**`@dreamer/view/types`** 导出 **`VNode`**、**`JSXRenderable`**
  等公共类型。

### 已发布的子路径（与 JSR `deno.json` 一致）

**`.`**、**`./types`**、**`./cli`**、**`./setup`**、**`./jsx-runtime`**、
**`./jsx-dev-runtime`**、**`./portal`**、**`./compiler`**、**`./optimize`**、
**`./ssr`**。除单独子路径说明外，上述能力均可从**主入口**使用。

### 破坏性变更

- **npm `package.json` 的 `exports`**：移除
  **`./csr`**、**`./hybrid`**（仅指向主 入口的别名），请改用主包导出；新增
  **`./portal`** 与 JSR 对齐。
