# 变更日志

@dreamer/view 的变更均记录于此。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [1.3.8] - 2026-03-27

### 修复

- **`view-cli init`（`cmd/init.ts`）**：生成的 **`src/main.tsx`** 改为使用
  **`mountWithRouter`**，与 **`examples/src/main.tsx`** 一致；原先 **`mount` +
  `insert`** 未订阅路由 signal，导致站内导航地址栏变化但主内容不更新。

### 变更

- **Init 模板文案**：生成 **`main.tsx`** 中 **`getRoot`** 的 JSDoc 改为引用
  **`init.template.mainGetRootDesc`**、**`mainGetRootParamRouter`**、
  **`mainGetRootReturns`**（各语言 locale），与文件头
  **`mainMountWithRouterComment`** 一并随 init 语言输出。

---

## [1.3.7] - 2026-03-26

### 新增

- **`readWhenInput`（`when-shared.ts`）**：除无参 getter 与静态快照外，支持
  **`SignalRef<T>`**；在 memo/effect 内读 **`.value`** 以正确登记依赖。手写 JSX
  可写 **`when={flag}`**、**`component={tagRef}`**，减少处处包一层
  **`() => flag.value`**。
- **`<For>` / `<Index>`（`for.ts`）**：**`ListEachInput<T>`** 可为
  **`SignalRef<readonly T[] | null | undefined>`**；内部 **`readEach`** 对
  **`SignalRef`** 解 **`.value`**，**`each={listRef}`** 与
  **`() => listRef.value`** 语义对齐订阅行为。
- **`<Show>`（`show.ts`）**：**`ShowWhenInput<T>`** 纳入
  **`SignalRef`**；**`when`** 与 **`Switch` / `Match`** 分支共用
  **`readWhenInput`** 语义。
- **`<Dynamic>`（`dynamic.ts`）**：**`component`** 经 **`readWhenInput`**
  解析，支持 本征标签名或组件描述的 **`SignalRef`**，在 memo 内订阅切换。
- **示例**：**`examples/src/views/home/index.tsx`** 增加首页卡片入口
  **`/list-insert`**（列表插入 / `insertIrList` 等 API 演示），含
  **`listInsert`** 图标分支；**`examples/src/views/control-flow/index.tsx`**
  展示控制流上 **`each` / `when` / `component`** 直接传 **`SignalRef`** 的写法。
- **文档**：**`README.md`**、**`docs/zh-CN/README.md`** — 控制流表格说明
  **`SignalRef` 直传** 与 **`prop={ref.value}`**
  快照陷阱；**`docs/*/TEST_REPORT.md`** 按最新跑数更新（Deno **892** / Bun
  **826**、命令 **`deno test -A --no-check tests`**、 **67**
  个测试文件及按文件用例表、功能摘要与结论）。
- **测试**：**`for.test.ts`**、**`show.test.ts`**、**`dynamic.test.ts`** 增补
  **`SignalRef`** 场景；**`insert-reactive-mountfn-untrack.test.ts`** 校验
  MountFn 同步挂载不误订阅外层
  **`insertReactive`**；**`view-example-browser.test.ts`**
  标题断言兼容中英文（**`/控制流|Control Flow/i`**、**`/列表插入|List Insert/i`**），
  列表插入页交互（null fallback、点击条目）。

### 变更

- **JSX
  编译器（`jsx-compiler/transform.ts`）**：对「一侧为编译期可证常量、另一侧含
  JSX」的表达式做 **编译期折叠**，在安全时改为静态 **`insert`** /
  **`markMountFn`**， 减少多余的 **`insertReactive`** 与结构抖动：
  - 短路运算符 **`&&` / `||` / `??`**：如
    **`true && <div />`**、**`false || <jsx>`**、
    **`null ?? <jsx>`**、**`void 0 ?? <jsx>`** 等；JSX
    须落在可到达分支；支持嵌套逻辑 表达式递归折叠。
  - **三元表达式**：条件不含 JSX
    且编译期恒真/恒假时折叠为单支；覆盖字面量、**`typeof`**、 与 **`null` 的
    `==` / `!=`**、算术比较、字符串拼接、**`BigInt`** 等（与
    **`jsx-compiler.test.ts`** 用例一致）。
  - **逗号表达式**：摊平操作数，仅对**最后一项**含 JSX
    时折叠，保留左侧求值顺序；避免
    将「块体首条字符串字面量」误判为逗号表达式体而错误折叠。
  - 核心辅助：**`tryFoldStaticLogicalJsxForInsert`**、
    **`tryFoldStaticConditionalJsxForInsert`**、**`flattenCommaOperandsRoot`**
    及 AST 常量求值 / nullish / 真假判定工具。
- **`jsx-compiler.test.ts`**：大量新增用例覆盖上述折叠规则及与之相关的 import
  注入边界。
- **示例（Tailwind CSS
  v4）**：最小高度改用主题间距工具类——**`list-insert/index.tsx`** 使用
  **`min-h-16`** 替代 **`min-h-[4rem]`**；**`_app.tsx`** 加载占位区使用
  **`min-h-70`** 替代 **`min-h-[280px]`**，与默认刻度及编辑器/规范提示一致。

### 修复

- **`insertReactive`**（**`runtime`** 与 **`compiler/insert.ts`** 对齐）：当
  getter 返回 **`markMountFn`** 时，**同步**执行挂载体包在 **`untrack`** 中，使
  MountFn 内部的 signal 读**不会**挂到**外层** `insertReactive` 的
  effect，避免每次输入都整段重挂、 **焦点丢失**（例如 MountFn
  外壳内的搜索/筛选输入框场景）。

---

## [1.3.6] - 2026-03-23

### 新增

- **`setIntrinsicDomAttribute`**：供 **`compileSource`** 产物与
  **`spreadIntrinsicProps`** 共用的 DOM 字符串属性写入辅助；值为 **`null`** 或
  **`undefined`** 时 **`removeAttribute`**，否则调用 **`setAttribute`** 写入
  **`String(value)`**（空字符串仍表示显式空属性）。
- **导出**：主入口 **`@dreamer/view`** 与 **`@dreamer/view/compiler`** 均导出
  **`setIntrinsicDomAttribute`**（与 **`spreadIntrinsicProps`** 并列）。
- **测试**：**`spread-intrinsic.test.ts`**、**`jsx-compiler.test.ts`** 覆盖
  **`setIntrinsicDomAttribute`** 及动态 **`target` / `className`** 的代码生成。
- **文档**：**`TEST_REPORT`** 已按最新跑数更新（Deno/Bun 总数与各文件用例数）。

### 变更

- **JSX 编译器（`jsx-compiler/transform.ts`）**：动态本征字符串属性（如
  **`target`**、**`className`**）改为生成
  **`setIntrinsicDomAttribute(element,
  name, value)`**，不再裸调
  **`setAttribute`**，与 spread 路径及 **`null` / `undefined`** 语义一致。

### 修复

- 动态 DOM 属性在运行时为 **`undefined`** / **`null`** 时不再把字面量
  **`"undefined"`** 写到元素上（改为移除属性），避免错误导航或错误属性（例如
  **`target`**、链接场景）。

---

## [1.3.5] - 2026-03-23

### 新增

- **子路径 `@dreamer/view/jsx-handoff`**：手写 **`jsx`/`jsxs`**
  路径一站式导出——**`insertVNode`**、
  **`mergeProps`**、**`mountVNodeTree`**、**`hydrate`**、**`createRoot`/`render`**、
  **`enableViewRuntimeDevWarnings` /
  `disableViewRuntimeDevWarnings`**、**`formatVNodeForDebug`** 及常用
  runtime/compiler 符号；首行副作用 import 会注册 **`mountVNodeTree`** 所需的
  **`insertReactive`** 桥接。
- **子路径
  `@dreamer/view/vnode-debug`**：**`formatVNodeForDebug`**（及选项类型），便于开发态打印
  VNode。
- **`dev-runtime-warn.ts`**：可选开发期诊断（**`viewRuntimeDevWarn`**、**`warnIfMultiArgControlledProp`**、
  嵌套 **`style`** 等），由 **`globalThis.__VIEW_DEV__`**
  控制；**`jsx-handoff`** 再导出开关函数。
- **`route-mount-bridge.ts`**：**`coerceToMountFn`**、**`pageDefaultToMountFn`**、**`composePageWithLayouts`**——
  将 **MountFn**（compileSource）与 **VNode**（手写 JSX）统一为挂载函数，供
  **`RoutePage`**、布局链、 自定义 loading 共用；支持 **VNode** 数组。
- **构建配置 `AppBuildConfig.jsx`**：**`compiler`**（默认，esbuild 前
  **`compileSource`**）与 **`runtime`** （esbuild **`jsx: "automatic"`** +
  **`jsxImportSource: "@dreamer/view"`**）。环境变量 **`VIEW_FORCE_BUILD_JSX`**
  （**`compiler` | `runtime`**）经 **`getBuildConfigForMode`** 覆盖，供 CI/E2E。
- **`insert-reactive-siblings.ts`**：文档片段/锚点辅助（**`moveFragmentChildren`**、**`resolveSiblingAnchor`**
  等）， 使 **`insertReactive`** 更新时父节点已有其它兄弟时仍保持 DOM
  顺序（如侧栏 + 主内容）。
- **测试**：**`route-mount-bridge.test.ts`**、**`jsx-handoff.test.ts`**、**`dev-runtime-warn.test.ts`**、
  **`vnode-debug.test.ts`**、**`vnode-mount-runtime-props.test.ts`**、**`build-jsx-mode.test.ts`**；
  **`tests/e2e/e2e-env.ts`** 及 **`envForExamplesChildProcess()`**（子进程强制
  **`VIEW_FORCE_BUILD_JSX=compiler`**）。
- **文档**：**`ANALYSIS-full-compile-vs-handwritten-jsx.md`**（中英）、**`编译路径与运行时指南.md`**；
  **`examples/view.config.ts`** 注释说明 **`jsx`** 模式与 E2E 覆盖。
- **`compiler/vnode-mount.ts`**：在 **`bindIntrinsicReactiveDomProps`** 中为
  **`className`** 增加响应式绑定（无参 getter、**`SignalRef`**），手写
  **`jsx-runtime`** 子树可使用 **`className={() => …}`** /
  **`className={signalRef}`** 并正确更新 DOM。
- **测试**：**`vnode-mount-runtime-props.test.ts`** — 嵌套子 VNode + 响应式
  **`style`** getter 覆盖。

### 变更

- **`RoutePage`（`route-page.tsx`）**：HMR
  覆盖、懒加载/同步路由模块、**`tryCustomLoading`** 等路径改用挂载桥接；
  **`mount()`** 对 **`default(match)`** 包一层 try/catch，错误展示更清晰。
- **路由类型（`router.ts`）**：**`RouteComponentModule`** /
  **`LayoutComponentModule`** 标明 **`default`** 可为 **`MountFn | VNode`**。
- **`vnode-mount.ts`**：手写子树与本征节点行为进一步对齐
  compileSource——**`value`/`checked`/`disabled`** 等与 **`SignalRef`**、 getter
  的受控绑定；指令与 runtime 属性处理在适用场景与编译路径一致。
- **`insert.ts`**、**`hydrate.ts`**、**`props.ts`**：响应式兄弟插入、水合与
  spread 等配合上述能力。
- **`runtime.ts`**、**`jsx-runtime.ts`**、**`mod.ts`**：开发期告警与子路径导出接线。
- **`server/core/build.ts`**：客户端打包读取合并后的 **`jsx`** 模式。

### 修复

- **E2E（`cli.test.ts`）**：**`buildCommandInExamples()`** 增加
  **`env: envForExamplesChildProcess()`**，使 **`view build`** 与
  **`view start`** 子进程均带 **`VIEW_FORCE_BUILD_JSX=compiler`**。修复
  **`examples/view.config.ts` 为 `jsx: "runtime"`** 时 仅 build 走
  runtime、start 不重建导致的 **CI 首页空白**（断言「多页面示例」失败）。
- **JSX 编译器（`jsx-compiler/transform.ts`）**：**`compileSource`** 下响应式
  **`style`** 不再对「可订阅」表达式生成单次
  **`Object.assign(element.style,
  expr)`**（会把函数当对象、无法追踪依赖）。改为生成
  **`createEffect`**，在 effect 内解析样式对象（调用 getter / 解包 ref）、清除
  **`style`** 属性后 **`Object.assign`** 到 **`element.style`**，与手写
  **`bindIntrinsicReactiveDomProps`** 行为一致，修复 **`style`** 为函数或 memo
  引用时变换/缩放等不刷新的问题。

---

## [1.3.4] - 2026-03-22

### 新增

- **测试**：**`jsx-compiler.test.ts`** 增加 **`disabled={() => …}`**（无参
  getter） 用例，校验 **`createEffect`** 与 **`!!getter()`** 产物。

### 修复

- **JSX 编译器**：**`disabled`**、**`checked`** 等布尔属性若为**无参箭头/函数**
  （如 **`disabled={() => loading.value}`**），改为在 **`createEffect`** 内写
  **`el.x = !!getter()`**，不再生成 **`el.x = !!getter`**（函数恒为真，会导致
  控件永久禁用）。

---

## [1.3.3] - 2026-03-21

### 破坏性变更

- **`createSignal` 返回值**：不再返回 `[getter, setter]`，改为返回
  **`SignalRef<T>`**： 用 **`.value`** 读，用 **`ref.value = next`** 或
  **`ref.value = (prev) => next`** 写。赋值规则不变：若赋值为
  **function**，一律按 **updater**
  处理，不能把「函数类型的状态值」直接当普通值写入（Suspense / MountFn
  等见源码注释）。
- **`createMemo`**：对外仍为带标记的 **无参 getter** `() => T`；内部用
  `SignalRef` 存缓存。
- **路由 / `RoutePage`**：**`match.getState(key, initial)`** 现返回
  **`SignalRef<T>`**。 **`getCurrentRouteSignal()`** 返回
  **`markSignalGetter(() => currentRoute.value)`**， 保持「调用 getter
  读当前路由」的用法兼容。
- **`createResource`（带 source）**：**source** 可为
  **`(() => S) | SignalRef<S>`**。
- **`Transition`**：**`show`** 可为 **`() => boolean` 或
  `SignalRef<boolean>`**（可直接传布尔 ref）。
- **Context `Provider` 的 `value`**：可为
  **`T | (() => T) | SignalRef<T>`**；**`getContext`** 在栈顶为 `SignalRef` 时读
  **`.value`**。
- **JSX 编译器**：已 **移除 `v-for` / `v-show` 的编译产物**。列表请用 JS
  **`.map` / `insertReactive`** 等；显隐请用 **`vIf`**
  或条件渲染。**指令模块**不再导出 **`resolveVForFactory`**、
  **`getVForListAndFactory`**、**`getVShowValue`**；**`hasStructuralDirective`**
  仅识别 **`vIf`** （不再含 vFor）。常量 **`V_FOR_ATTR`** 已删除。

### 新增

- **`SignalRef<T>`**、**`SIGNAL_REF_MARKER`**、**`isSignalRef()`**；从主包、**`compiled`**、**`csr`**、
  **`hybrid`**、**`types`**、**`compiler`** 入口导出（compiler 同时补充
  **`isSignalGetter`** 与 **`unwrapSignalGetterValue`** 再导出）。
- **`unwrapSignalGetterValue`**：遇到 **`SignalRef`** 时读 **`.value`**（供
  **`insertReactive`**、 编译器文本插值与受控 **`value`/`checked`** 使用）。
- **手写 `jsx()` 的 VNode 挂载（`vnode-mount.ts`）**：与本征 **compileSource**
  行为对齐—— Fragment 子级 **`vIf` / `vElseIf` / `vElse`** 兄弟链、本征节点
  **`vOnce`**（`untrack`）、**`vCloak`** （`data-view-cloak`）、**`ref` 之后**
  调用 **`applyDirectives`** 跑自定义指令；写 DOM 属性时跳过
  **`isDirectiveProp`** 键。
- **测试**：**`tests/unit/vnode-mount-directives.test.ts`**（自定义指令挂载 +
  **`SignalRef` 触发 `updated`**）。
- **文档**：**`docs/en-US/ANALYSIS-full-compile-vs-handwritten-jsx.md`**、
  **`docs/zh-CN/ANALYSIS-full-compile-vs-handwritten-jsx.md`**（全量编译与手写
  JSX 对照分析）。

### 修复

- **`insertReactive`**：在插入边界对 **`SignalRef`** 解包，使文本/动态内容与
  **`.value`** 同步。
- **`applyDirectives`**：绑定值为 **`SignalRef`** 时同样用 effect 驱动
  **`updated`**。
- **JSX 编译器**：本征 **`value` / `checked`** 对非函数字面量包
  **`unwrapSignalGetterValue`**，避免 **`SignalRef`** 被当成字符串变成
  **`[object Object]`**。
- **SSR 伪 `CSSStyleDeclaration` 代理**：**`get` / `set` / `has` /
  `getOwnPropertyDescriptor`** 对 **symbol** 键安全返回，避免运行时探测 symbol
  时异常。
- **HMR**：**`getHmrVersionGetter`** 对外为 **markSignalGetter** 包装的内部
  **`SignalRef`**，兼容原 getter 订阅方式。
- **Router**：删除文件末尾误增的 **`"./globals.ts";`** 一行。

### 变更

- **内部实现** 全面改用 **`SignalRef`**：**Suspense**
  解析态、**`createRef`**、**`RoutePage`** 按 path 状态表、 路由
  **`currentRoute`**、**`Transition`** 阶段、**`createMemo`** 缓存单元等。
- **示例、`view init` 模板、集成与单测** 从元组 **`createSignal`** 迁移为
  **`.value` / `SignalRef`**。
- **`deno.json` / `package.json` 描述**：一行简介改为 **v-once /
  v-cloak**，不再写已移除的 **v-for / v-show**。
- **用户文档**：中英文 **README**、**《编译路径与运行时指南》**、测试徽章与
  README 测试表（**509** / **465**）、**`createSignal` → `SignalRef`**
  的迁移说明。
- **i18n 模块路径**：CLI/服务端文案桥接由 **`src/server/utils/i18n.ts`** 迁至
  **`src/i18n.ts`** （locale 仍从 **`src/server/locales/*.json`**
  加载）；**`@module`** 为 **`@dreamer/view/i18n`**。
- **CLI / 开发构建**：esbuild 插件无法读取 `.tsx` 源码以执行 **`compileSource`**
  时，告警走 **`cli.build.compileSourceReadFailed`**（全部
  **`src/server/locales/*.json`**），由 **`logger.warn` / `$tr`** 输出。
- **库内诊断**：**`cmd/`**、**`server/`** 以外的运行时/编译器路径中 **`throw`**
  与 **`console`** 文案统一为 **英文**，便于工具链输出一致。

### 移除

- **编译器**：**`v-for` / `v-show`** 相关转换与生成代码。
- **指令模块**：内置集合中的 **`vFor`/`v-for`/`vShow`/`v-show`** 及 v-for
  结构处理、对应工具导出（见上破坏性变更）。

## [1.3.2] - 2026-03-21

### 修复

- **JSX 编译器（vIf）**：根节点带 `vIf` 时走与 Fragment 链一致的
  `insertReactive`， signal 变化会重新求值条件（修复「已为 false
  仍显示」）。单分支 `vIf`/`vElseIf` 在 false 时生成空
  MountFn，保证上一帧子树可被 detach；修复并列多个仅 `vIf`
  兄弟块错误地全部显示的问题。
- **VNode 挂载**：编译产物/自定义组件的单参 MountFn 经
  `insertReactiveForVnodeSubtree` 包裹，与 `insertReactive` 对齐，避免深层布局中
  v-if/signal 更新后 DOM 残留（如 dweb 根树下布局）。

### 变更

- **`getDocument()`**：返回 `Document | null`，SSR 或无 DOM 时不再抛错；优先使用
  SSR 影子 document（`KEY_VIEW_SSR_DOCUMENT`），便于 Hybrid 同构。
- **依赖**：`@dreamer/esbuild` 提升至 `^1.1.5`（含 `serverSideRouteBundle`
  等服务端打包相关修复）。

### 新增

- **CI**：工作流级 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`，便于 GitHub Actions
  提前验证 Node 24。

---

## [1.3.1] - 2026-03-21

### 变更

- **依赖**：将 `@dreamer/esbuild` 提升至 `^1.1.2`（JSR 子路径缓存匹配修复，避免
  `jsr:@dreamer/view/router` 等误解析）。

### 重构

- **CLI 目录**：将 view-cli 子命令实现由 `src/server/cmd/` 迁至 **`src/cmd/`**；
  `cli.ts` 动态导入 `./cmd/{init,dev,build,start,upgrade,update}.ts`。对外 CLI
  行为不变。

### 修复

- **锁文件**：依赖对齐后刷新 `bun.lock`。

---

## [1.3.0] - 2026-03-21

### 重构

- **根挂载 API 统一为
  `fn(container) + insert`**：`createRoot`、`render`、`hydrate` 均接收
  **`(container: Element) => void`**；**`fn` 在整个根生命周期内只执行一次**， 在
  `fn` 内通过 **`insert` / `insertReactive` / `createElement` + `appendChild`**
  建立 DOM 与响应式插入点，后续更新全部由插入点上的 **effect** 驱动，不再在根层
  反复执行整棵 `fn`。该形状与 **view-cli `compileSource`
  产物**一致，手写与编译共用 同一心智模型。
- **SSR / CSR 共用同一 `fn`**：服务端 **`renderToString(fn)`**（或流式
  SSR）与客户端 **`hydrate(fn, container)`**（自 **`@dreamer/view/compiler`**
  导出）使用**同一份** 编译后的 `fn`；水合时按插入点顺序**复用已有 DOM**，只绑定
  effect，避免整容器 `innerHTML` 级替换。
- **`mount` 职责收敛**：**`mount(selector | Element, fn, options?)`**
  仅负责解析挂载 目标（选择器或元素），再调用
  **`render(fn, el)`**；**不会**根据容器是否已有子节点
  自动切换为水合。混合应用需在客户端**显式**调用 **`hydrate`**。
- **移除 `createReactiveRoot`**：原先「外部状态 getter + 每次变更重建子树」的
  API 已删除。请改用
  **`createRoot((container) => { … insert(…, getter) … }, el)`** 配合
  **`createSignal` / `createStore` / `createEffect`**，或使用
  **`mountWithRouter`** 等路由集成方式；与细粒度 `insert`
  模型一致，避免根级整树重跑。

### 变更

- **对外 API 与模块 JSDoc 完善** 所有对外导出的入口与 API 均补充完整
  JSDoc。各导出 路径均包含 `@module` 与
  `@packageDocumentation`，并列出导出清单；导出函数与类型均 补充
  `@param`、`@returns`，必要时增加 `@example`。面向用户的模块说明中已去掉团队
  内部架构代号，改为可直接理解的表述（例如：JSX 经 compileSource 编译、由
  insert/createRoot 等 API 驱动）。
- **compiler/mod.ts** 模块标签由 `@dreamer/view/runtime` 更正为
  `@dreamer/view/compiler`，并完整列出导出（insert、createRoot、hydrate、SSR、
  props、signal/effect 再导出及类型）。
- **主入口与子路径** `mod.ts`、`mod-ssr.ts`、`mod-csr.ts`、`mod-hybrid.ts`
  现均写明 全部导出及使用说明（如 hybrid/csr 不导出 `insert`，需时从主入口或
  compiler 引入）。
  `dom.ts`、`globals.ts`、`ref.ts`、`compiled.ts`、`jsx-compiler/mod.ts`、
  `compiler/insert-replacing.ts`、`optimize.ts` 及 `compiler/active-document.ts`
  的模块 说明已统一风格。
- **运行时与编译器** `runtime.ts` 文件头及
  `insertReactive`、`InsertValueWithMount` 的 JSDoc 已扩充；`compiler/insert.ts`
  与 `jsx-compiler/transform.ts` 的模块描述已更新 并与对外用法一致。JSX
  编译器中的 `compileSource` 与 `jsxToRuntimeFunction` 已补充
  完整参数与返回值说明。
- **Examples** `examples/package.json` 的 imports 与 dependencies 已与
  `examples/deno.json` 同步：新增 `@dreamer/view/ssr`、`@dreamer/view/compiler`
  及 `@dreamer/esbuild`；所有 JSR/npm
  依赖（image、plugins、esbuild、tailwindcss）版本与 `deno.json` 一致。

### 测试

- 新增单元测试：`spread-intrinsic`、`insert-replacing`、`escape`、`active-document`、
  `compiled-contract`、`route-page`、`version-utils`、`logger-server`、
  `vnode-insert-bridge`；扩展 `boundary`（嵌套 ErrorBoundary）、`router-mount`
  （notFound）。`entry-mod-smoke` 增加 `@dreamer/view/ssr` 的 `renderToString`
  烟测。
- 测试文件表与用例数已随本轮对齐：`compiled-runtime`、`form-page-compile`、
  `jsx-compiler`、`ref-dom`、`ref`、`router-mount`、`runtime-props`、`ssr-compiled`、
  `unmount` 等；`e2e/view-example-browser` 浏览器 E2E 共 72
  条（Gallery、Layout2、persist、v-once/vCloak、路由与 404 等）。

### 修复

- **`package.json` exports** 补充 `./ssr` → `./src/mod-ssr.ts`，与 `deno.json`
  对齐，Bun 可解析 `@dreamer/view/ssr`。

### 文档

- **TEST_REPORT（中/英）**、**README（中/英）**：用例数
  **500**（Deno）/**457**（Bun）、 **44** 个测试文件、日期
  **2026-03-21**；耗时约 **1m38s**（Deno）/**~85s**（Bun）；
  徽章与「测试报告简要」已同步；E2E 与文件表与上述一致。
- **README（中/英）** 已补充 **`fn(container)`**、显式 **`hydrate`**、**`mount`
  不自动 水合**、**`createReactiveRoot` 移除**等迁移说明，与 1.3.0 重构一致。
- **`docs/测试覆盖缺口.md`** 已对照本轮补测更新状态说明。

---

## [1.2.0] - 2026-03-19

### 修复

- **动态 getter 单节点为组件时：用展开结果做 patch** 当 getter 返回单个组件（如
  `{ () => ( <Carousel ... /> ) }`）时，`getDynamicChildEffectBody` 改为用
  `expandVNode` 取得组件输出（如轮播根 div）并以此做 `patchRoot`，不再传入组件
  VNode。这样会对同一棵 DOM 做增量更新（只改
  style/children）而不是整块替换，轮播 滑动过渡生效，且仅该槽位状态（如
  current）变化时不会触发整页重渲染或其它状态重置。

---

## [1.1.14] - 2026-03-19

### 修复

- **组件返回 getter 时只产生一层 data-view-dynamic** 当函数组件返回 getter（如
  `return () => ( <div>...</div> )`）时，`createElement` 不再先创建占位再调用
  `appendDynamicChild`（会再建一层动态容器）。改为只创建一个容器并在其上直接注册
  effect，因此仅出现一个 `data-view-dynamic` 节点（如 Carousel 等返回 getter 的
  组件下）。

---

## [1.1.13] - 2026-03-18

### 变更

- **SSR 与客户端：同时支持 class/className 与 for/htmlFor** stringify 中将
  `class` 与 `className` 均输出为 HTML 的 `class`，`htmlFor` 与 `for` 均输出为
  `for`。`getStaticPropsFingerprint` 中规范化为统一 key 以便等效 props 共享
  缓存。`props.ts` 中设置属性时 `for` 与 `htmlFor` 同等处理。

---

## [1.1.12] - 2026-03-16

### 修复

- **动态子节点单节点：保留占位并 patch 不 replace** 在
  `getDynamicChildEffectBody` 中，当 getter 返回单个原生根节点（如 Form/FormItem
  根）时，不再用该节点 replace 占位容器；改为在占位内渲染单节点， 后续重跑时用
  `patchRoot` 增量更新。彻底修复 Form + FormItem + Password
  输入时光标丢失。patch 后同步 `singleMountedNode`，保证 ContextScope
  等被替换子节点仍正确。
- **E2E Boundary/Portal** 使用 `waitForMainToContain` 轮询 main 内容（最多
  3s），在断言前等待路由切换与渲染完成，避免加载慢时 main 为空导致偶发失败。
- **SSR document shim 单测** 其中一条用例增加 `sanitizeOps: false`，避免 timer
  泄漏误报。

### 新增

- **Form 示例页** 新增 `examples/src/views/form/`，含 Form + FormItem +
  密码框（与 ui-view 结构一致），用于焦点保留验证。
- **首页 Form 卡片** 示例首页增加 Form 入口，链接至 `/form`。
- **E2E：Form 页与密码框焦点** 进入 Form 页、在密码框输入后断言
  `document.activeElement` 仍为该 input（焦点保留）。
- **单测：密码焦点** 在 `reconcile-focus-reuse.test.ts` 中新增用例：getter
  返回单根 div 包 input，signal 更新后复用同一 input 节点（证明 patch
  路径，真实浏览器下焦点保留）。

### 文档

- 变更日志（中/英）与 README 变更章节更新至 1.1.12。

---

## [1.1.11] - 2026-03-16

### 修复

- **patchNode：同组件且返回 getter 时复用容器** 当现有 DOM 为动态容器
  （`data-view-dynamic`）且旧/新 VNode 为同一组件（如 `<Password />`）时，协调器
  改为调用 `getComponentGetter` 与 `updateDynamicChild`，不再整节点
  replace。修复 父组件重渲染时 Password 等组件内 input 失焦（此前 patchNode
  对组件槽位一律 replace）。

### 新增

- **zh-TW 语言** CLI 与 server i18n 现支持繁体中文（`zh-TW`）。新增
  `src/server/locales/zh-TW.json`，`Locale` 与 `VIEW_LOCALES` 共 10 种语言。
- **协调器焦点/容器复用测试** 新增
  `tests/unit/reconcile-focus-reuse.test.ts`（10 个用例）：同槽 getter
  复用、同组件 patch 复用、getter/静态边界、getter 返回 null。

### 文档

- 测试报告（中英文）更新：454
  用例（Deno）、427（Bun），协调器焦点/容器复用覆盖。

---

## [1.1.10] - 2026-03-16

### 修复

- **Reconcile：同槽两 getter 引用不同时复用容器** 当旧、新槽项均为组件 getter
  但引用不同（如父组件重渲染时 `() => <Password />`）时，协调器不再整块
  替换动态子节点容器，而是复用已有容器并调用
  `updateDynamicChild(container, newGetter, ...)`，对新 getter 结果做原地
  patch，避免 Password 等使用 `return () => ( ... )` 的组件内 input 失焦。

---

## [1.1.9] - 2026-03-16

### 新增

- **SSR document shim** 在 `renderToString` 与 `renderToStream` 执行期间，运行时
  会临时将 `globalThis.document` 替换为占位对象，使组件内访问 `document`（如
  `document.body.style.overflow`）不抛错。占位提供
  `body`、`head`、`createElement`、 `getElementById`（返回
  null）、`querySelector`（null）、`querySelectorAll`（空数组）
  等。渲染结束后恢复原始 `document`。
- **SSR document shim 测试** 新增 `tests/unit/ssr-document-shim.test.ts`（9
  个用例）， 覆盖 SSR 期间组件访问 document 及 `renderToString` /
  `renderToStream` 执行后恢复。

### 文档

- 测试报告与 README（中英文）更新：444 用例（Deno）、418（Bun），测试日期
  2026-03-16，并补充 SSR document shim 覆盖说明。

---

## [1.1.8] - 2026-03-15

### 修复

- **appendDynamicChild replaceChild NotFoundError** 从单节点模式切回多节点（或
  切到单节点）时，先判断 `container.parentNode === parent` 再执行
  `parent.replaceChild(...)`；若 container 已被移出（如被兄弟 effect 或 keyed
  协调替换），则改为 `appendChild`，避免 DOM 操作抛错。

---

## [1.1.7] - 2026-03-15

### 变更

- **SSR/keyed：不再包一层节点** 带 key 的子节点不再包在 `<span data-view-keyed>`
  内；`data-key` 在 SSR 时注入到该 keyed 项的首元素上，客户端在内容根上设置；
  协调时直接以内容根做 patch 或按范围替换，避免多余 DOM 与布局问题（如
  Grid/Flex）。
- **SSR/dynamic：不再包 div** 动态子节点（getter/函数）不再输出包裹用
  `<div data-view-dynamic>`；每个动态块的首元素打 `data-view-dynamic` 与
  `data-view-dynamic-index`；当块内容为纯文本时，改为输出一个 `<span>` 包裹
  以便打标。
- **动态占位改为 div** `createDynamicContainer(doc)` 改为创建无样式 `div`（替代
  原 span）。已移除 `createDynamicSpan`，所有调用改为 `createDynamicContainer`。

### 修复

- 测试随新 SSR 输出更新（不再含 `data-view-keyed`；`<span>` 可带属性）。E2E
  勾选断言允许「checked：」与「true」之间换行。

---

## [1.1.6] - 2026-03-15

### 修复

- **SSR 下组件返回 getter 函数时的渲染**：在 `walkVNodeForSSR` 中，当组件返回
  函数（如 `return () => <div>...</div>`）时，服务端会先调用该函数一次并遍历
  得到的 VNode，从而正确输出内容，不再跳过。此前这类组件在服务端不输出 HTML，
  可能导致首屏空白（例如使用“组件返回 getter”写法的 ui-view 等）。不插入额外包装
  节点。

---

## [1.1.5] - 2026-03-14

### 变更

- **vIf 单元素优化**：当响应式 `vIf` 内容（getter 或 signal）渲染为单个 DOM
  元素（如根节点 `<div>`）时，框架改为直接以该元素为根，并在 effect 中通过
  `style.display` 切换显隐，不再外包一层 `<span data-view-v-if>`，从而去掉
  弹窗、Toast 等单根 + vIf 组件外多余的一层 span；多根或非元素内容仍使用 span
  占位。

---

## [1.1.4] - 2026-03-14

### 新增

- **统一 escape 模块（`src/escape.ts`）**：集中提供
  `escapeForText`、`escapeForAttr`、`escapeForAttrHtml`，供
  stringify、meta、runtime 使用，替代原先各文件内联转义，保证输出一致且防
  XSS，仅需维护一处。
- **runtime-shared 中 `getCreateRootDeps(deps)`**：返回 createRoot
  所需依赖对象，runtime、runtime-csr、runtime-hybrid
  均通过该契约传入各自实现，减少重复键列表并在新增/修改依赖时避免漏改。
- **指令名规范化模块（`src/directive-name.ts`）**：将 `directiveNameToCamel` 与
  `directiveNameToKebab` 抽离到独立模块；`directive.ts` 引用并 re-export，对外
  API 不变，仅在一处维护名称转换规则。
- **优化分析文档（`docs/OPTIMIZATION_ANALYSIS.md`）**：记录性能、安全与代码复用方面的可优化点及完成状态（如
  escape、removeCloak、reconcileKeyedChildren、applyProps、getStaticPropsFingerprint、flushQueue、getCreateRootDeps、directive-name）。
- **内存泄漏分析文档（`docs/MEMORY_LEAK_ANALYSIS.md`）**：说明
  effect、根卸载、signal、指令、缓存、router 的生命周期与清理；记录 store/proxy
  订阅者修复及低风险项（getterWarnedKeys、router.stop()、ref）。

### 变更

- **性能 – removeCloak**：先处理 container 自身的 `data-view-cloak`，再对
  `querySelectorAll("[data-view-cloak]")` 结果用 for 循环遍历，不再使用
  `Array.from(…)` 与 `unshift(container)`，减少一次数组分配。
- **性能 – reconcileKeyedChildren**：通过 for 索引遍历 `container.children` 构建
  `keyToWrapper`，不再使用 `Array.from(container.children)`，减少一次数组分配。
- **性能 – applyProps**：用 for-in 配合 hasOwn 替代 `Object.entries(props)` 及
  style 对象的 `Object.entries(value)`，热点路径不再分配迭代器与条目数组。
- **性能 – getStaticPropsFingerprint**：用 for-in
  收集条目；用基于排序后条目的确定性键（`k1\0v1\0…`）替代
  `JSON.stringify(entries)`，避免大字符串分配；style 分支改为 for-in
  与单串拼接。
- **性能 – flushQueue**：对 `state.queueCopy` 使用索引 for 循环替代
  for-of，避免迭代器分配，语义不变，对部分引擎更友好。
- **generateHydrationScript**：nonce 与 scriptSrc 改为使用统一 escape 模块的
  `escapeForAttr`，保证属性转义一致。

### 修复

- **内存泄漏 – store 与 proxy 订阅者**：当曾读取 store（或 createNestedProxy /
  响应式状态）的 effect 被 dispose 时，未从 store 或 proxy 的 `subscribers` Set
  中移除，导致已销毁的 effect 被长期引用、Set 可能持续增长。现已在
  `store.ts`（createRootStoreProxy get trap）与 `proxy.ts`（createNestedProxy
  get trap）中，在将当前 effect 加入 subscribers 时调用
  `onCleanup(() => subscribers.delete(effect))`，effect 清理或重跑时会从 Set
  中移除，与 signal 订阅行为一致。

---

## [1.1.3] - 2026-03-12

### 修复

- **动态子节点（无包装 span）**：当动态子节点（signal getter 或函数）返回 单个非
  Fragment 的 VNode 且渲染为单一 DOM 元素（如 button）时，框架现在
  直接以该元素为挂载点并设置 `data-view-dynamic`，不再外包一层 `<span>`，
  避免多余 DOM 节点及对布局/样式（如 flex、grid）的影响；多子节点或 Fragment
  仍使用内层 span 作为容器。

---

## [1.1.2] - 2026-02-25

### 新增

- **init .vscode**：生成项目现包含 `.vscode/settings.json`（按 Deno 或 Bun
  区分：格式化、编辑器、i18n-ally）与
  `.vscode/i18n-ally-custom-framework.yml`（识别 `$t`/`$tr`）。

### 变更

- **version -v 输出**：`setVersion()` 字符串末尾加 `\n\n`，与 shell 提示符
  之间留空行（由 @dreamer/console 根 Command 处理）。

### 修复

- **e2e CLI start afterAll**：改用 SIGKILL 并限制 cleanup 等待时间，在 Bun macOS
  上 5s 内完成，避免测试超时。

---

## [1.1.1] - 2026-02-25

### 新增

- **CLI i18n（9 种语言）**：与 dweb 一致，支持 de-DE、en-US、es-ES、fr-FR、
  id-ID、ja-JP、ko-KR、pt-BR、zh-CN；新增各语言 locale JSON，并更新
  `src/server/utils/i18n.ts`（v1.3.3 起迁至 `src/i18n.ts`）中的 `Locale`
  类型与列表。
- **init 模板 i18n**：UnoCSS 的 `view.config.ts` 中 content 注释与 `uno.css`
  的头部/ reset/ body/ 自定义层注释均使用 i18n（
  `unocssContentComment`、`unoCssHeaderComment`、`unoCssResetComment`、
  `unoCssBodyComment`、`unoCssCustomComment`），9 种语言均已翻译。
- **init deno.json 模板**：生成项目的 `deno.json` 增加
  `version: "1.0.0"`、`description`（项目名 + 脚手架说明）、`author`（
  `USER`/`USERNAME`）、`license: "MIT"`、`keywords`、`nodeModulesDir: "auto"`。
- **init UnoCSS**：`view.config.ts` 中 `unocssPlugin` 增加 `content` 数组（ 如
  `./src/**/*.{ts,tsx}`、`./src/**/*.html`、`./src/assets/index.html`） 及 i18n
  多行 JSDoc 注释；UnoCSS 依赖改为 `@unocss/core`（不再使用 `unocss`）。
- **init uno.css 模板**：由仅含 `@unocss` 的占位改为完整基础样式：reset（
  box-sizing、html/body/a）、默认 body 与 `.dark body` 渐变与文字色（
  首屏一致）、可选自定义层注释；段落注释均 i18n。
- **setup 安装成功**：安装成功后输出当前安装的 @dreamer/view 版本（如
  `view-cli  v1.1.1  安装成功。`）；成功文案使用 `{version}` 占位与 i18n。

### 变更

- **init 插件模板**：抽出共用的 `staticPlugin` 配置，tailwind/unocss/无样式
  三处复用同一片段。
- **init 布局**：项目名为 view-app 时头部标题显示 `@dreamer/view`；导航 `<ul>`
  增加 `list-none`；主题切换与 GitHub 链接按钮增加
  `border-0 bg-transparent outline-none`，去除默认边框与焦点框。
- **init 主题图标**：主题为 dark 时显示月亮图标，为 light 时显示太阳图标（
  与当前主题一致）。
- **Logger 配置类型**：`AppConfig.logger` 与 `setLoggerConfig()` 改为直接使用
  `@dreamer/logger` 的 `LoggerConfig`；移除 `src/server/types.ts` 中的本地
  `AppLoggerConfig`。
- **examples/view.config.ts**：logger 段注释改为写在字段上方（JSDoc 风格）；
  `color`、`output.console` 注释补充 `true | false | "auto"` 及自动行为说明。
- **init 模板**：生成的 `view.config.ts` 中 logger 块取消注释并与 examples
  一致（注释在字段上方，`color: "auto"`、`console: "auto"`、`path:
  "logs/app.log"`）；9
  种语言的 logger 注释 i18n 已更新（
  `viewConfigLoggerComment`、`loggerColorComment`、`loggerOutputConsoleComment`
  含 "auto" 说明）。

### 修复

- **zh-CN init 模板**：补全 404 页标题的 `notFoundRouteTitle` 文案。
- **e2e CLI start afterAll**：改用 SIGKILL 并限制 cleanup 等待时间，在 Bun macOS
  上 5s 内完成，避免测试超时。

### 依赖

- `@dreamer/runtime-adapter`: ^1.0.17 → ^1.0.18
- `@dreamer/plugins`: ^1.0.7 → ^1.0.8

---

## [1.1.0] - 2026-02-25

### 新增

- **init 样式选择**：交互式选择样式方案（Tailwind CSS / UnoCSS /
  不需要），按选择写入 `deno.json` 或 `package.json` 依赖及 `view.config.ts`
  插件；支持 `options.style` 非交互 调用（如 CI：`style: "none"`）。
- **init 模板增强**：生成
  `src/assets/index.html`、`favicon.svg`、`global.css`、`index.css`
  占位；`view.config.ts` 增加顶层
  `name`、`version`、`language`（语言自动检测），以及 完整注释的 `logger`
  配置（level/format/showTime/showLevel/color/output.file 等）， 默认日志路径
  `runtime/logs/app.log`；logger 各字段注释支持 i18n（中英文）。
- **版本管理集中**：版本逻辑迁至 `src/server/utils/version.ts`，通用方法
  `getPackageVersion(packageName, useBeta)`，`getViewVersion` /
  `getPluginsVersion` 复用； init 与 setup 动态获取
  @dreamer/view、@dreamer/plugins 最新版本（支持 --beta）。

### 变更

- **开发服务器重构**：服务端与 CLI 结构重写。`src/cmd/` 拆分为 `src/server/`（含
  `core/`：app、serve、build、config、routers、route-css 等）与顶层
  `src/cli.ts`。 CLI 入口仍为 `@dreamer/view/cli`（现指向 `src/cli.ts`）。dev
  时由 `ViewServer` + pathHandlers 提供内存构建产物，静态与 SPA 回退由插件（如
  staticPlugin）通过 middlewares 提供；index.html 自 `src/assets` 由插件返回。
- **init 执行顺序**：运行时与样式选择完毕后再创建项目目录与文件；成功提示使用
  `logger.info` 输出并保留绿色，空行使用 `console.log`。
- **路由 CSS 清理**：切路由时移除上一路由由 esbuild 内联注入的
  `style[data-dweb-css-id]`（通过 `data-view-route-path` 标记），避免无 CSS
  的页面 仍残留上一页样式；main 包全局样式（入口 import 的
  CSS）不参与标记与移除。
- **图片压缩与 hash 化**：构建配置 `build.assets` 支持生产构建时对图片压缩、hash
  化，并在编译产物（HTML/CSS/JS）中直接替换为带 hash 的路径，无需运行时
  asset-manifest；与 @dreamer/esbuild 的 AssetsProcessor 行为一致。
- **插件配置**：配置支持 `plugins` 数组，可注册 Tailwind、UnoCSS 等样式插件及
  用户自定义插件；插件按注册顺序执行（如先 tailwind 再 static），通过
  onRequest/onResponse 参与请求与响应处理。

### 修复

- **init 依赖**：选择 Tailwind 或 UnoCSS 时，生成的 `deno.json` / `package.json`
  现会包含 `tailwindcss` 或 `unocss`，生成项目可直接构建。
- **CI（Deno Mac）**：CLI e2e 测试为 build/start 子进程传入 `stdin: "null"` 并
  延长超时（build 45s、start 120s），在无 TTY 的 CI 下通过；需 @dreamer/esbuild
  ^1.0.40（buildModuleCache 为 deno info/eval 传入 stdin）。

---

## [1.0.32] - 2026-02-24

### 新增

- **Router / 布局**：从 `@dreamer/view/router` 导出常量 `KEY_VIEW_ROUTER` 及
  `getGlobal` / `setGlobal`，便于根 _layout 等从 global 读取 router。
- **init（非交互）**：`main(options)` 支持可选 `options.runtime`（`"deno"` 或
  `"bun"`）。 传入时跳过运行时选择菜单，CI 与测试可无 stdin 执行 init（如
  `initMain({ dir: "...", runtime: "deno" })`）。

### 变更

- **布局继承**：完全由 codegen（layout.ts 布局链 + routers.ts）决定。_app
  不再判断 `inheritLayout`，仅将 router 挂到 global 并始终渲染 `RoutePage`，由
  RoutePage 根据 路由的 `layouts` 数组应用布局（继承时含根 _layout）。根 _layout
  为 _layout.tsx 的 default 导出；Layout 的 `routes` / `currentPath`
  改为可选（不再从 global 补 currentPath）。
- **生成路由的布局链**：继承时输出完整 `layoutImportPaths`（含根）；页面设置
  `inheritLayout = false` 时仅过滤掉根路径，当前目录的 _layout 仍会包裹页面。
- **RoutePage 布局顺序**：按倒序应用
  layouts，使数组中第一项（根）为最外层，嵌套顺序 正确（根 > 子布局 > 页面）。
- **layout.ts**：`readInheritLayoutFromLayoutFile` 与
  `readInheritLayoutFromPageFile` 改为通过 动态 `import(pathToFileUrl(path))`
  从模块读取 `inheritLayout`，不再用正则解析文件内容。

### 修复

- **页面 `inheritLayout = false`**：当页面（或目录 _layout）设置
  `inheritLayout = false` 时， 仅从链中移除根布局，当前目录的 _layout
  不再被误删，本地布局（如虚线框）会正常显示。

---

## [1.0.31] - 2026-02-22

### 修复

- **renderToString（Bun / 无 DOM）**：在无 `document` 的环境（如 Bun
  测试进程）下执行时，`finally` 中在原先没有 document 的情况下将
  `globalThis.document` 恢复为 `undefined`，不再保留 SSR 用的
  guard。避免后续代码（如 `getDocument()`）读到该 guard 而抛出 "document is not
  available during server-side rendering"，使同一进程中先跑 SSR 再跑依赖 DOM 的
  Bun 测试能通过。

### 变更

- **TEST_REPORT**：Bun 运行命令更新为
  `bun test --preload ./tests/dom-setup.ts tests/`，并补充执行时间与说明（无 DOM
  时 preload 注入 happy-dom）。中英文报告均已更新。
- **发布**：`publish.include` 增加 `src/**/*.tsx`，使被 `router.ts` 引用的
  `route-page.tsx` 纳入 JSR 包。

---

## [1.0.30] - 2026-02-21

### 新增

- **SSR stringify**：将字符串与流式 SSR 统一为单一路径。`walkVNodeForSSR`
  同时驱动 `createElementToString` 与 `createElementToStream`；`collectWalk` 与
  `walkElementChildrenStream` 负责拼接与元素子节点遍历。减少重复逻辑，
  便于维护。
- **runtime-shared**：抽公共根 effect 循环 `createRootEffectLoop`，供
  `createRoot` 与 `hydrate` 复用。统一处理 disposed 检查、时间与 scope、
  防抖占位及策略回调（`readDeps`、`shouldSkip`、`runBody`、`onBeforeRun`）。
  根状态（`RootEffectState`）与 `getNow()` 共用；各根仅提供自己的 runBody
  与跳过逻辑。
- **dom/reconcile**：新增 `reconcile.ts`，通过 `createReconcile(deps)` 返回
  `reconcileKeyedChildren`、`reconcileChildren`、`patchRoot`。协调与 patch
  逻辑从 `element.ts` 迁出；element 注入 deps 并将 `patchRoot` 委托给 reconcile
  模块。对外导出 `hasAnyKey`、`collectVIfGroup` 供 element 使用。
- **element 占位
  API**：`registerPlaceholderContent(placeholder, effectBody,
  options?: { preserveScroll })`
  统一 v-if 组、单 v-if、v-for 的占位逻辑 （清空、执行
  body、补绑延迟事件；可选保留滚动）。替代原先多处重复的
  unmount/replaceChildren/bind 代码。

### 变更

- **runtime-shared**：`createRoot` 与 `hydrate` 默认不再向控制台输出日志。
  调试日志由 `globalThis.__VIEW_DEBUG__` 门控；设为 `true` 可恢复 "[view]
  createRoot() root created #" 及 hydrate effect 运行次数等输出。
- **element.ts**：将 reconcile/patch 迁至 `reconcile.ts`，占位 + effect 改用
  `registerPlaceholderContent`，单文件行数减少。对外 API 不变；`patchRoot`
  仍由本包导出，内部委托给 `rec.patchRoot`。

### 修复

- **SSR stringify（vFor）**：当 vFor 项出现 `parsed === null`（如 props 中
  `vFor` 被清空）时，原先错误地 return 导致无 HTML 输出。现改为继续走普通
  元素分支，vFor 列表项在 SSR 下能正确渲染。

---

## [1.0.29] - 2026-02-20

### 修复

- **createReactiveRoot**：修复根 effect 在等价状态下重复执行的问题，子组件及 其
  `createEffect` 不再被多次触发。

---

## [1.0.28] - 2026-02-20

### 修复

- **SSR stringify**：在 `createElementToString` 与 `createElementToStream`
  中对非 字符串的 `vnode.type` 做防护，避免在 Bun 下 SSR（如 dweb hybrid）时出现
  `tag.toLowerCase is not a function`。此类节点跳过并输出空；设置
  `globalThis.__VIEW_SSR_DEBUG__` 可在触发防护时输出调试日志。

---

## [1.0.27] - 2026-02-19

### 修复

- **setup（JSR 路径）**：在安装成功提示前后增加空行，使通过
  `deno run -A jsr:@dreamer/view/setup` 运行时也能看到空行（与本地运行一致）。

---

## [1.0.26] - 2026-02-19

### 修复

- **CLI 语言**：在 CLI 入口调用 `setLocaleFromEnv()`，使通过 JSR 安装的 view-cli
  正确遵循 `LANGUAGE` / `LC_ALL` / `LANG`（如中文环境下 `view-cli init`
  输出中文）。
- **init**：将「项目已成功创建于」前的空行与成功文案合并为同一次
  `console.log`，避免从 JSR 安装运行 view-cli 时空行被吞掉。
- **setup**：在 `await child.status` 之后再调用 `child.unref()`（不再提前
  unref），避免通过 `deno run -A jsr:@dreamer/view/setup` 运行时安装未完成
  即退出。
- **upgrade**：与 setup 一致，改为先等 status 再 unref。

---

## [1.0.25] - 2026-02-19

### 变更

- **CLI i18n**：`cli.ts` 中所有命令与选项描述改为使用 i18n（`$tr`）。键从
  `cli.cli.*` 展平为 `cli.*`；init/dev/build/start 描述使用
  `cli.initDesc`、`cli.devDesc`、`cli.buildDesc`、`cli.startDesc`。
- **upgrade/update**：`upgrade.ts`、`update.ts` 中所有用户可见文案改为
  `$tr`（cli.upgrade._、cli.update._）。`serve.ts` 中 HTTP
  响应正文保持固定英文，不翻译。

---

## [1.0.24] - 2026-02-19

### 变更

- **依赖**：更新 @dreamer/server 至 ^1.0.9。

---

## [1.0.23] - 2026-02-19

### 变更

- **CLI i18n**：i18n 在加载 `cmd/i18n` 时自动初始化；`initViewI18n` 不再导出。
  已从 `cli.ts` 与 `setup.ts` 中移除显式 `initViewI18n()` 调用；`$tr`
  调用时仍会确保完成初始化。
- **依赖**：升级
  @dreamer/runtime-adapter、@dreamer/console、@dreamer/esbuild、@dreamer/test。

---

## [1.0.22] - 2026-02-19

### 变更

- **i18n**：翻译方法由 `$t` 重命名为 `$tr`，避免与全局 `$t`
  冲突。请将现有代码中本包消息改为使用 `$tr`。

---

## [1.0.21] - 2026-02-18

### 新增

- **Bun 支持**：E2E 与 CLI 测试在 Bun 下通过 `@dreamer/runtime-adapter`
  （`createCommand`、`execPath`、`IS_BUN`）运行。为 `package.json` 增加
  `globals`、`stream`、`jsx-dev-runtime` 导出；新增 `tsconfig.json` 的
  `jsxImportSource: "@dreamer/view"`；在 `jsx-runtime.ts` 中导出 `jsxDEV`。
  文档：`BUN_COMPATIBILITY.md`、`JSX_EXPRESSIONS.md`。
- **测试报告**：中英文 `TEST_REPORT.md` 现包含 Bun 结果（410 用例、26 文件） 与
  Deno（435 用例）；两种运行时的运行命令均已记录。

### 变更

- **E2E / CLI 测试**：`view-example-browser.test.ts` 与 `cli.test.ts` 使用
  `createCommand(execPath(), ...)`，按 `IS_BUN` 区分参数（Bun 不含 `-A`）。
  服务就绪判断同时接受 "Server started" 与「服务已启动」。

---

## [1.0.20] - 2026-02-18

### 修复

- **e2e init 测试**：在测试中调用 initMain 前先初始化 view i18n 并设置 locale 为
  zh-CN，使生成的 view.config.ts 包含翻译后注释（「view 项目配置」）。修复
  不经过 CLI 入口（如 CI）时未调用 initViewI18n 导致的失败。

---

## [1.0.19] - 2026-02-18

### 变更

- **i18n**：迁至 `src/cmd/`（i18n.ts 与
  locales），客户端入口（`mod.ts`）不再拉取服务端 代码。仅在 CLI
  入口（`cli.ts`、`setup.ts`）初始化；`mod.ts` 不再调用 `initViewI18n()`。`$t()`
  内不再调用 `ensureViewI18n()` 或设置 locale。

---

## [1.0.18] - 2026-02-17

### 新增

- **CLI i18n：** view-cli
  服务端国际化：`i18n.ts`、由环境变量（LANGUAGE/LC_ALL/LANG） 检测语言的
  `detectLocale()`、`ensureViewI18n()`、`$t()`；`en-US.json` 与 `zh-CN.json`
  覆盖 setup、serve、init、build、config、dev、HMR 等文案。
- **init 模板 i18n：** 所有 init 生成文件中的注释与 TSX 文案均使用
  `init.template.*` 键（view.config、main、_app、_layout、_loading、_404、
  _error、home、about、router、routers）；路由 metadata 标题与 `routers.ts`
  默认首页标题、路由表注释使用 `$t`。

### 变更

- **init：** 从 main.tsx 模板中移除多余的
  `container.removeAttribute("data-view-cloak")`（运行时已在首次 append 后调用
  `removeCloak`）。在「项目已创建」提示前增加空行。locale 中 `countLabelHigh`
  改为 `count &gt; 5` 以符合 TSX 语法。
- **generate：** `titleFromRelative` 与生成的路由表注释使用 `$t`；新增
  `routers.tsNocheckComment` 文案键。
- **build/config：** `getRoutePathForChangedPath` 与 `getBuildConfigForMode` 的
  JSDoc 参数说明改为英文。

---

## [1.0.17] - 2026-02-17

### 修复

- **setup：** deno install 的 spawn 使用 `stdin: "null"`，避免子进程等待终端
  输入；spawn 后立即调用 `child.unref()` 便于 setup 进程退出；入口在
  `installGlobalCli()` resolve 后调用 `exit(0)`，确保进程退出（否则 Deno 会因
  ref 不退出）。
- **upgrade：** 以 `stdin: "null"` spawn setup，spawn 后调用 `child.unref()`，
  成功时 `exit(0)`、失败时 `exit(1)`，使 CLI 在命令结束时退出。

---

## [1.0.16] - 2026-02-17

### 修复

- **upgrade 命令（Deno）：** 在 await spawn 的 status 后调用 `child.unref()`，使
  CLI 在安装子进程结束后能正常退出（与 dweb 一致，避免 Deno 下挂起）。

---

## [1.0.15] - 2026-02-17

### 新增

- **文档 – 链接拦截：** README（中英文）与 router 模块 JSDoc 现明确说明
  `interceptLinks: true` 时哪些 `<a>` 点击会被拦截、哪些不会：不拦截情形包括
  `target` ≠ `_self`、`download`、`data-native`、同页锚点（pathname+search
  相同且仅 hash）、hash 模式下 `#section`（与 `#/path`
  区分）、修饰键或非左键、跨域或非 http(s)、无效或空 `href`。中英文 README
  均增加表格与说明。

### 变更

- **测试报告与 README：** 更新为 435 个用例（router 40、integration 14）；英文与
  中文 README 的测试徽章与摘要表更新为 435 通过；测试日期 2026-02-17，
  报告内版本为 1.0.15。

---

## [1.0.14] - 2026-02-16

### 变更

- **Store：** 重写 `createStore` 实现：抽出 `makeActionContextProxy` 与
  `makeStoreObjectProxy`，在 getters/actions/asObject 各分支间复用 Proxy
  逻辑；重载与 API 不变。
- **Version：** 将 `getVersionCachePath` 内联到 `readVersionCache` 与
  `writeVersionCache`，删除该辅助函数以减小源码体积。
- **Router：** 新增 `buildMatch` 辅助函数，在 `matchPath` 中统一构建
  `RouteMatch`，去掉匹配与 notFound 两处重复的对象字面量。
- **DOM（element）：** 新增 `registerPlaceholderEffect` 与 `getItemKey`；
  `reconcileKeyedChildren` 现接受 `oldItems`，当 key 相同且存在旧 VNode 时 对
  wrapper 子节点做原地 `patchNode`，不再整块替换，减少 keyed 列表的 DOM 变动。
- **DOM（props）：** 在 `applySingleProp` 中，当 className、style（字符串与
  对象）、表单 value、checked/selected 及通用 attribute 的值与当前 DOM
  一致时跳过写入。
- **Directive：** 自定义指令的 `mounted` 在支持时改为通过 `queueMicrotask`
  执行（否则回退到 `setTimeout(..., 0)`），在元素入文档后 更早执行。
- **Runtime：** 根 effect 在根 VNode 引用未变（如 memo 或稳定引用）时跳过 expand
  与 patch，避免重复计算。

---

## [1.0.13] - 2026-02-16

### 新增

- **RoutePage match.getState(key, initial)：** 按 path 稳定的页面状态，页面组件
  可在组件体内使用 getState 写状态，点击仍能触发更新（无需缓存页面 VNode）。
  路由 path 变化时清理上一 path 的状态。
- **Router 类型：** 从 `@dreamer/view/router` 导出 `GetState` 与
  `RoutePageMatch`， 供使用 `match.getState` 的页面组件导入。
- **Portal 与 Transition：** 文档中补充并突出 Portal（渲染到指定容器）与
  Transition（显隐 + enter/leave class 与 duration）。
- **视图文件导入 CSS：** 视图与组件文件中可导入 CSS（如
  `import "../../assets/index.css"`）；默认内联进 JS，或配置
  `cssImport.extract: true` 产出独立 .css。

### 修复

- **文档：** README 与中文 README 的 createContext 示例将 `theme()` 改为
  `themeValue()`，避免 Tailwind 工具解析代码块时报 “'' does not exist in your
  theme config”。

---

## [1.0.12] - 2026-02-16

### 修复

- **view-cli upgrade 与 setup：** upgrade 命令与 setup 脚本此前以
  `stdout`/`stderr` 为 `"piped"` 启动子进程但未读取管道，子进程在管道写满后
  会阻塞，CLI 表现为卡住。现已改为 `stdout`/`stderr` `"null"`，输出被丢弃，
  安装完成后进程正常退出且不阻塞。

---

## [1.0.11] - 2026-02-15

### 修复

- **子节点：** JSX 子节点中的布尔值 `false` 和空字符串 `""`
  此前会被渲染成文本（"false" 或空文本节点），现已视为空并跳过，不再输出 DOM。

### 新增

- **isEmptyChild(value)：** `dom/shared.ts` 中的辅助函数；对
  `null`、`undefined`、`false`、`""` 返回 true，供客户端
  `normalizeChildren`（element.ts）与 SSR
  `normalizeChildrenForSSR`（stringify.ts）统一过滤，不再转为文本节点。

---

## [1.0.10] - 2026-02-15

### 变更

- **依赖：** 将 `@dreamer/esbuild` 升级至 `^1.0.24`（Windows CI
  解析器修复：`deno info` 使用相对入口路径与原生 cwd）。

---

## [1.0.9] - 2026-02-15

### 修复

- **vIf/vShow 指令导致的 input/textarea value 问题。** 在
  `applySingleProp`（props.ts）中， 表单 `value` 改为在通用的 `value == null`
  分支之前处理。vIf/vShow 切换时 patch 传入 `undefined` 或 `null` 时，会正确清空
  DOM 输入框的值，而不会跳过 value 分支导致仍显示旧值。

### 新增

- **测试：** 扩展单元测试：**applyProps**（ref、vShow/vCloak、value/checked
  响应式、事件、class、style、attribute、自定义指令 — 55
  条），**store**（persist 边界、getters/actions、同一 key 实例、setState
  updater、Proxy ownKeys — 29 条），**meta**（getMetaHeadFragment 与
  applyMetaToHead 边界 — 21 条），**compiler**（常量折叠除数为 0/取模为
  0、一元加号、.tsx、onLoad catch — 13 条）。集成 14 条、E2E 浏览器 52 条。合计
  **381 条**，全部通过（约 2 分钟）。

### 变更

- **props.ts：** 移除调试 log 与未使用的 `_isFocusedFormElement`。测试报告与
  README 已更新为 381 条。

---

## [1.0.8] - 2026-02-13

### 修复

- **SSR：子节点为普通函数。** 在 `normalizeChildrenForSSR`（stringify.ts）中，
  当子节点为普通函数（非 signal getter）时改为先执行再对返回值做规范化，不再
  直接字符串化。修复了 hybrid/SSR 首屏把 JS 函数源码当 HTML 输出的问题。
- **getter 返回单个 Fragment 时 input 不丢焦点。** 在 `appendDynamicChild`
  （element.ts）中，当规范化后的动态子节点仅有一项且为 Fragment 时，将该
  Fragment 展开为多项再参与 reconcile，使 lastItems 与 DOM 槽位一致，不再误删 /
  替换含 input 的节点，输入框保持焦点。

### 新增

- **测试：** 扩展 renderToString / renderToStream 的 SSR 分支与边界用例；集成
  测试：getter 返回 Fragment 内 input 在 signal 更新后仍为同一 DOM 节点（不丢
  焦点）。测试报告与 README 已更新为 290 条、约 1m37s。

---

## [1.0.7] - 2026-02-13

### 修复

- **appendDynamicChild（无 key）：** 改为用 `lastItems` 做 reconcile，不再每次
  getter 重跑都整块 `replaceChildren`。动态 getter 内的受控 input（如
  `value={input()}`）输入时不再丢失焦点。
- **patchNode：** Fragment 对 Fragment 时在父节点上做子节点 reconcile；组件
  （function type）节点改为替换以重新执行并读取最新 context/signal；
  ContextScope 节点改为替换，使 Provider value 更新（如主题切换）能正确更新
  消费者 DOM。

---

## [1.0.6] - 2026-02-13

### 修复

- **Hydrate 时组件返回函数：** 当组件返回函数（如为细粒度更新写的
  `() => ( <> ... </> )`）时，hydrate 现将其视为动态槽：创建占位节点、替换 对应
  DOM 并调用 `appendDynamicChild`，而不再当作 VNode 递归，从而避免 HYDRATE
  渲染时报错 "Cannot use 'in' operator to search for 'vIf' in undefined"。
- **hasStructuralDirective：** 对 `null` 或非对象 `props`（如 hydrate 路径下
  传入的“函数 vnode”）安全处理，返回 `null` 而非抛错。

---

## [1.0.5] - 2026-02-14

### 新增

- **Init 模板 (home.tsx)：** v-if 演示区块 — 条件分支（count ≤ 2 → AAA，3～5 →
  BBB，否则 CCC），使用 getter 形式的 `vIf`/`vElseIf`/`vElse`，并配有区分色标签
  （翠绿 / 琥珀 / 灰）便于展示。

---

## [1.0.4] - 2026-02-14

### 变更

- **Init 模板 (home.tsx)：** 计数器使用模块顶层 `createSignal` 与 `{count}`
  展示（与示例项目一致），根 effect 不订阅 count，计数正常。
- **组件返回函数：** 组件返回 `() => VNode` 时，该槽位在独立 effect
  中渲染（expandVNode + createElement），组件体只执行一次，组件内 state（如
  createSignal）得以保持。
- **响应式 v-if：** 条件请用 getter，例如 `vIf={() => count() <= 2}`，仅 v-if 的
  effect 订阅 signal；使用 `vIf={count() <= 2}`
  会让根订阅并在更新时可能重置组件状态。

---

## [1.0.3] - 2026-02-13

### 新增

- **mount(container, fn, options?)** — 统一挂载 API，适用于 CSR、hybrid
  与全量入口。`container` 可为 CSS 选择器（如 `"#root"`）或 `Element`。在
  hybrid/全量下：若容器有子节点则 hydrate，否则 render。选项：`hydrate`（强制
  hydrate 或 render）、`noopIfNotFound`（选择器 查不到时返回空
  Root）。从主入口、`@dreamer/view/csr`、`@dreamer/view/hybrid`
  导出。一步到位减少 客户端入口分支与心智负担。
- **MountOptions** 类型 — `hydrate?: boolean`、`noopIfNotFound?: boolean`。
- **resolveMountContainer**（内部）— 将选择器解析为 Element；根据
  `noopIfNotFound` 在未找到时抛错或返回 null。
- **Root.forceRender** — `createRoot`/`render`（以及 `mount`）返回的 `Root`
  上提供 **forceRender()**，用于强制重跑一次根 effect
  并重渲染整树，适用于外部路由或其它非响应式状态源。

### 变更

- **createRoot / render：** 首次 append 后自动调用
  `removeCloak(container)`，无需在业务中手动移除 `data-view-cloak`。hydrate
  路径行为不变（原本即会 removeCloak）。
- **测试：** 为 mount 新增 6
  个单元测试（Element、选择器、noopIfNotFound、选择器缺失时抛错、hydrate
  路径、render 路径）。总用例数 262。
- **文档：** README（中英文）与 TEST_REPORT（中英文）补充 mount
  API、MountOptions 及 262 用例摘要。

---

## [1.0.2] - 2026-02-14

### 新增

- **createReactiveRoot(container, getState, buildTree)** — 创建由外部状态驱动的
  根：当 `getState()`（如 signal）的返回值变化时，会按新状态重新建树并在原地
  patch，不整树卸载。从主入口、`@dreamer/view/csr` 与 `@dreamer/view/hybrid`
  导出。适用于 SPA 外壳由外部维护页面/路由状态、View 只根据该状态渲染的场景。

### 变更

- **测试：** 为 createReactiveRoot 新增 5 个单元测试（初始挂载、signal 驱动
  patch、unmount 清理、对象状态 patch、unmount 后再 set 的边界）。总用例数 252。

- **文档：** 测试报告（中英文）与 README（中英文）补充 createReactiveRoot 说明、
  用法与示例。

---

## [1.0.1] - 2026-02-14

### 变更

- **文档：** 许可证徽章与 README 许可证说明由 MIT 改为 Apache-2.0；链接指向
  LICENSE 与 NOTICE。

---

## [1.0.0] - 2026-02-12

### 新增

- **核心**
  - `createSignal(initialValue)` — 响应式 signal，getter/setter；在 effect
    中读取会登记依赖。
  - `createEffect(fn)` — 副作用，依赖的 signal 变化时重新执行（微任务）；返回
    dispose；支持 `onCleanup`。
  - `createMemo(fn)` — 派生值，依赖变化时重新计算并缓存。
  - `createRoot(fn, container)` / `render(fn, container)` — 挂载响应式根；细粒度
    DOM 更新，不整树替换。
  - `renderToString(fn, options?)` — SSR/SSG 输出 HTML；可选
    `allowRawHtml: false` 对 v-html 转义。
  - `hydrate(fn, container)` — 在服务端已有 HTML 的容器上激活，挂载事件与
    effect。
  - `generateHydrationScript(options?)` —
    为混合应用注入初始数据与可选客户端脚本。
  - `isDOMEnvironment()` — 检测是否存在 DOM，用于 SSR/CSR 分支。

- **Store**（`@dreamer/view/store`）
  - `createStore(config)` — 响应式 store，支持 `state`、可选
    `getters`、`actions` 与 `persist`（如 localStorage）。

- **Reactive**（`@dreamer/view/reactive`）
  - `createReactive(initial)` — 用于表单 model 的代理对象；在 effect
    中读取会追踪，赋值会触发更新。

- **Context**（`@dreamer/view/context`）
  - `createContext(defaultValue)` — 返回 `Provider`、`useContext` 与
    `registerProviderAlias`，用于跨层注入。

- **Resource**（`@dreamer/view/resource`）
  - `createResource(fetcher)` — 异步数据 getter，返回
    `{ data, loading, error, refetch }`。
  - `createResource(source, fetcher)` — source getter 变化时自动重新请求。

- **Router**（`@dreamer/view/router`）
  - `createRouter(options)` — 基于 History 的 SPA
    路由：路由表、basePath、链接拦截、`beforeRoute`/`afterRoute`、notFound、`back`/`forward`/`go`、meta。

- **Boundary**（`@dreamer/view/boundary`）
  - `Suspense` — 在 Promise 或 getter 解析前的 fallback 占位。
  - `ErrorBoundary` — 捕获子树错误并渲染 fallback(error)。

- **指令**（`@dreamer/view/directive`）
  - 内置：`vIf`、`vElse`、`vElseIf`、`vFor`、`vShow`、`vOnce`、`vCloak`（JSX
    中驼峰）。
  - 自定义指令：`registerDirective(name, { mounted, updated, unmounted })`。
  - 辅助：`hasDirective`、`getDirective`、`directiveNameToCamel`、`directiveNameToKebab`、`getDirectiveValue`、`hasStructuralDirective`、`createBinding`
    等。
  - 表单双向绑定：使用 `value` + `onInput`/`onChange` 配合 signal 或
    createReactive，无需 v-model 指令。

- **流式 SSR**（`@dreamer/view/stream`）
  - `renderToStream(fn, options?)` — 返回 HTML 字符串生成器，用于流式响应。

- **JSX**
  - 通过 `@dreamer/view`（jsx-runtime）提供 `jsx`/`jsxs` 与 `Fragment`；可通过
    `jsxImportSource` 配置。

- **DOM**
  - 细粒度更新：动态子节点（getter）、带 key 的列表协调、vShow 等指令的 getter
    在 effect 中更新。
  - 事件：`onClick`、`onInput`、`onChange` 等通过 addEventListener 绑定。
  - Ref：回调或 `{ current }` 在挂载后获取 DOM 引用。
  - SVG 命名空间与指令应用顺序（vShow 等指令，再通用 props）。

- **编译器**（`@dreamer/view/compiler`）
  - 构建时优化：`optimize`、`createOptimizePlugin`，可配合 esbuild 等打包器
    （可选）。

- **CLI（view-cli）**
  - 全局安装：`deno run -A jsr:@dreamer/view/setup`；安装后可在任意目录使用
    `view-cli`。
  - `view-cli init [dir]` — 脚手架生成项目（views、view.config.ts、_app、
    _layout、_loading、_404、_error）。
  - `view-cli dev` — 构建并启动静态服务（开发模式）。
  - `view-cli build` — 仅构建（输出到 dist/）。
  - `view-cli start` — 仅启动静态服务（需先执行 build）。
  - `view-cli upgrade` — 将 @dreamer/view 升级到最新（加 `--beta` 使用 beta）。
  - `view-cli update` — 更新项目依赖与 lockfile（加 `--latest` 使用最新版本）。
  - `view-cli version` / `view-cli --version` — 显示版本。
  - `view-cli --help` — 显示完整帮助。

### 说明

- 无虚拟 DOM；更新由 signal/store/reactive 的订阅驱动。
- 根组件为响应式；在根函数中读取 signal 会触发重新展开与 patch，而非整树替换。
- 所有 API 支持 Deno/JSR；示例与测试在适用处使用 `@dreamer/test` 与 happy-dom。

[1.0.0]: https://github.com/dreamer-jsr/view/releases/tag/v1.0.0
