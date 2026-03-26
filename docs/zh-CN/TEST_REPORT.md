# @dreamer/view 测试报告

## 测试概览

| 项目     | 说明                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 测试包   | @dreamer/view                                                                                                                              |
| 版本     | 1.3.3                                                                                                                                      |
| 测试框架 | @dreamer/test ^1.0.15                                                                                                                      |
| 测试时间 | 2026-03-26                                                                                                                                 |
| DOM 环境 | happy-dom 20.4.0（单元/集成）、浏览器（E2E）                                                                                               |
| 运行命令 | **Deno**：`deno test -A --no-check tests`；**Bun**：在包根目录 `bun test`（无 DOM 时可加 `--preload ./tests/dom-setup.ts` 注入 happy-dom） |

## 测试结果

### Deno

- **总测试数**：892
- **通过**：892
- **失败**：0
- **通过率**：100%
- **执行时间**：约 3 分 14 秒

### Bun

- **总测试数**：826
- **通过**：826
- **失败**：0
- **通过率**：100%
- **执行时间**：约 139.6 秒（**67** 个测试文件，含 E2E 浏览器与 CLI）
- **说明**：无 DOM 环境时建议使用 `--preload ./tests/dom-setup.ts`，否则依赖
  `document` 的单元/集成用例可能因 SSR guard 或缺少 document 而失败。

> **Deno** 与 **Bun** 的用例数量不同来自运行器统计口径（例如 `describe`/`it` 与
> `Deno.test` 的计数方式）；两侧均覆盖同一 `tests/`
> 目录下的文件与场景，本次记录均全部通过。

### 测试文件统计

（与 `deno test -A --no-check tests` 按文件汇总一致，共 **67** 个测试文件，合计
**892** 条用例。）

| 测试文件                                             | 测试数 | 状态        |
| ---------------------------------------------------- | ------ | ----------- |
| e2e/cli.test.ts                                      | 6      | ✅ 全部通过 |
| e2e/view-example-browser.test.ts                     | 75     | ✅ 全部通过 |
| integration/integration.test.ts                      | 5      | ✅ 全部通过 |
| unit/active-document.test.ts                         | 3      | ✅ 全部通过 |
| unit/boundary.test.ts                                | 22     | ✅ 全部通过 |
| unit/build-hmr.test.ts                               | 5      | ✅ 全部通过 |
| unit/build-jsx-mode.test.ts                          | 5      | ✅ 全部通过 |
| unit/compiled-contract.test.ts                       | 3      | ✅ 全部通过 |
| unit/compiled-runtime.test.ts                        | 26     | ✅ 全部通过 |
| unit/compiler.test.ts                                | 13     | ✅ 全部通过 |
| unit/context.test.ts                                 | 7      | ✅ 全部通过 |
| unit/dev-runtime-warn.test.ts                        | 4      | ✅ 全部通过 |
| unit/directive.test.ts                               | 19     | ✅ 全部通过 |
| unit/dynamic.test.ts                                 | 5      | ✅ 全部通过 |
| unit/effect.test.ts                                  | 50     | ✅ 全部通过 |
| unit/entry-mod-smoke.test.ts                         | 4      | ✅ 全部通过 |
| unit/escape.test.ts                                  | 6      | ✅ 全部通过 |
| unit/for.test.ts                                     | 5      | ✅ 全部通过 |
| unit/form-page-compile.test.ts                       | 3      | ✅ 全部通过 |
| unit/globals.test.ts                                 | 6      | ✅ 全部通过 |
| unit/hmr.test.ts                                     | 3      | ✅ 全部通过 |
| unit/insert-reactive-array-coerce.test.ts            | 8      | ✅ 全部通过 |
| unit/insert-reactive-cleanup-single-to-array.test.ts | 3      | ✅ 全部通过 |
| unit/insert-reactive-intrinsic-ruler.test.ts         | 4      | ✅ 全部通过 |
| unit/insert-reactive-keyed-patch-isolated.test.ts    | 10     | ✅ 全部通过 |
| unit/insert-reactive-metrics.test.ts                 | 4      | ✅ 全部通过 |
| unit/insert-reactive-mountfn-untrack.test.ts         | 3      | ✅ 全部通过 |
| unit/insert-reactive-nested-dispose.test.ts          | 3      | ✅ 全部通过 |
| unit/insert-replacing.test.ts                        | 4      | ✅ 全部通过 |
| unit/jsx-compiler-dependency-graph.test.ts           | 4      | ✅ 全部通过 |
| unit/jsx-compiler.test.ts                            | 112    | ✅ 全部通过 |
| unit/jsx-handoff.test.ts                             | 6      | ✅ 全部通过 |
| unit/jsx-runtime.test.ts                             | 14     | ✅ 全部通过 |
| unit/logger-server.test.ts                           | 4      | ✅ 全部通过 |
| unit/meta.test.ts                                    | 21     | ✅ 全部通过 |
| unit/portal.test.ts                                  | 6      | ✅ 全部通过 |
| unit/proxy.test.ts                                   | 5      | ✅ 全部通过 |
| unit/reactive.test.ts                                | 7      | ✅ 全部通过 |
| unit/ref-dom.test.ts                                 | 4      | ✅ 全部通过 |
| unit/ref.test.ts                                     | 4      | ✅ 全部通过 |
| unit/resource.test.ts                                | 14     | ✅ 全部通过 |
| unit/route-mount-bridge.test.ts                      | 5      | ✅ 全部通过 |
| unit/route-page.test.ts                              | 4      | ✅ 全部通过 |
| unit/router-mount.test.ts                            | 4      | ✅ 全部通过 |
| unit/router.test.ts                                  | 40     | ✅ 全部通过 |
| unit/runtime-insert-reactive-vnode-array.test.ts     | 7      | ✅ 全部通过 |
| unit/runtime-props.test.ts                           | 34     | ✅ 全部通过 |
| unit/runtime.test.ts                                 | 22     | ✅ 全部通过 |
| unit/scheduler-focus-restore.test.ts                 | 6      | ✅ 全部通过 |
| unit/scheduler.test.ts                               | 17     | ✅ 全部通过 |
| unit/show.test.ts                                    | 7      | ✅ 全部通过 |
| unit/signal.test.ts                                  | 22     | ✅ 全部通过 |
| unit/spread-intrinsic.test.ts                        | 62     | ✅ 全部通过 |
| unit/ssr-compiled.test.ts                            | 21     | ✅ 全部通过 |
| unit/ssr-document-shim.test.ts                       | 3      | ✅ 全部通过 |
| unit/store.test.ts                                   | 29     | ✅ 全部通过 |
| unit/stream.test.ts                                  | 4      | ✅ 全部通过 |
| unit/switch-match.test.ts                            | 5      | ✅ 全部通过 |
| unit/transition.test.ts                              | 8      | ✅ 全部通过 |
| unit/unmount.test.ts                                 | 6      | ✅ 全部通过 |
| unit/version-utils.test.ts                           | 9      | ✅ 全部通过 |
| unit/vnode-debug.test.ts                             | 4      | ✅ 全部通过 |
| unit/vnode-insert-bridge.test.ts                     | 3      | ✅ 全部通过 |
| unit/vnode-mount-directives.test.ts                  | 3      | ✅ 全部通过 |
| unit/vnode-mount-getter-mountfn.test.ts              | 6      | ✅ 全部通过 |
| unit/vnode-mount-runtime-props.test.ts               | 30     | ✅ 全部通过 |
| unit/vnode-reconcile.test.ts                         | 16     | ✅ 全部通过 |

## 功能测试详情

### 1. Boundary (unit/boundary.test.ts) - 22 tests

- ✅ isErrorBoundary 对 ErrorBoundary 组件返回 true、对其它函数返回 false
- ✅ getErrorBoundaryFallback：fallback 为函数/VNode/undefined/null 等边界
- ✅ ErrorBoundary 直接返回 children；无 children 时返回 null
- ✅ Suspense：同步 VNode、Promise 先 fallback 再解析、fallback 为 null 边界
- ✅ **嵌套 ErrorBoundary**：内层抛错时仅内层 fallback 生效、错误不外冒

### 2. E2E CLI (e2e/cli.test.ts) - 6 tests

- ✅ view init &lt;dir&gt;：在目标目录生成
  view.config.ts、deno.json、src、views、router 等
- ✅ examples 目录下 view build：产出 dist/ 且含 main.js
- ✅ build 后 view start：启动服务并用浏览器打开首页（多页面示例）

### 3. E2E 浏览器示例 (e2e/view-example-browser.test.ts) - 75 tests

- ✅ 首页挂载与多页面入口、各卡片进入
  Signal/Store/Boundary/指令/Reactive/Resource/Context/Form/Runtime/Router
  等；**控制流**、**列表插入**等子页
- ✅ Signal 页：count/double、name 输入与「你好，xxx」
- ✅ Store 页：count、greeting 与名字输入；**persist**：清空 key 后
  +1、localStorage 写入、再次进入页面 count 仍恢复
- ✅ Boundary 页：抛错展示、Suspense 异步内容
- ✅ 指令页：vIf/vElse 链、表单 `value`/`checked`（`SignalRef`）与
  onInput/onChange、 v-focus；**main 文案含 v-once / vCloak 说明区块**
- ✅ Reactive 页：createReactive 表单、多字段 summary、下拉与选项
- ✅ Resource 页：重新请求、id 切换、Suspense 与 Promise 区块
- ✅ Context 页：light/dark 主题切换
- ✅ **Form 页**：密码框输入后焦点保留（getter 重跑 patch 不 replace）
- ✅ Runtime 页：输入后生成 HTML（renderToString）；**页面展示
  generateHydrationScript、renderToStream / `@dreamer/view/stream` 文档块**
- ✅ **控制流页**：/control-flow 含 For、Show 等说明
- ✅ **列表插入页**：/list-insert API 说明；置 null fallback、点击条目等
- ✅ **Layout 页**：/layout 显示布局示例与 _layout、inheritLayout 说明
- ✅ **Layout 2 页**：/layout/layout2 嵌套路由与说明；**document.title 兼容
  Layout2 / Layout 2**
- ✅ **Loading 页**：/loading 懒加载完成后显示加载态示例与 _loading 说明
- ✅ **Gallery**：/gallery 网格、/images
  静态图加载完成；首张缩略图预览、放大、关闭； **顶栏「示例」下拉进入相册**（nav
  标签中英兼容：相册 / Gallery）
- ✅ **Globals / Portal / Transition** 等卡片与顶栏导航；Layout 主题、404
  与返回首页

### 4. Context (unit/context.test.ts) - 7 tests

- ✅ createContext 返回 Provider 与 useContext；无 Provider 时返回 defaultValue
- ✅ 边界：defaultValue 为 undefined 时无 Provider 则 useContext() 为 undefined
- ✅ 有 Provider 时 pushContext 后 useContext 返回 value；Provider value 为 null
  边界

### 5. Directive (unit/directive.test.ts) - 19 tests

- ✅ directiveNameToCamel / directiveNameToKebab（v-if / vElseIf 等）
- ✅ getDirectiveValue、getVIfValue、getVElseShow、getVElseIfValue
- ✅ hasDirective / hasStructuralDirective / isDirectiveProp
- ✅ registerDirective / getDirective、createBinding

### 6. Effect (unit/effect.test.ts) - 50 tests

- ✅ runWithScope / EffectScope、Owner 别名；**on**
  显式依赖、**createReaction**、**createRenderEffect**、**catchError**、**onMount**
- ✅ createEffect：非函数抛错、立即执行、signal
  变更后再次执行、dispose、清理函数与 onCleanup；边界：回调抛错
- ✅ createMemo / **children** / **createDeferred**：缓存、equals、推迟提交等

### 7. 集成 (integration/integration.test.ts) - 5 tests

- ✅ createRoot(fn(container)) + signal：按钮 onClick 更新
  signal；insert(getter) 处 DOM 随 signal 更新；unmount 后容器清空
- ✅ 多事件类型：onClick 与 change 等绑定正确
- ✅ insert(getter) 读 signal，外部 `.value` 赋值后视图更新
- ✅ unmount 后再次 set signal 不抛错、不更新 DOM

### 8. JSX Runtime (unit/jsx-runtime.test.ts) - 14 tests

- ✅ jsx / jsxs / jsxDEV：type/props/children、key 提取与第三参覆盖、Fragment 为
  Symbol
- ✅ jsxMerge / jsxMerges 与 mergeProps 等价语义

### 9. Meta (unit/meta.test.ts) - 21 tests

- ✅ getMetaHeadFragment：title、titleSuffix、fallbackTitle、name 类 meta、og 类
  meta、HTML 转义；边界：meta 为 null、空 title、value 为 null/空/非字符串、og
  数组或 key 无前缀
- ✅ applyMetaToHead：document.title 与 meta、fallbackTitle、titleSuffix、og
  property；边界：meta 为 undefined、name 类 value 为空或仅空格

### 10. Reactive (unit/reactive.test.ts) - 7 tests

- ✅ createReactive：代理初始属性、不修改入参、set 后 get 返回新值
- ✅ createEffect 内读取 reactive 属性，属性变更后 effect 再次执行（微任务后）
- ✅ 嵌套代理、多字段赋值触发曾读取过的 effect

### 11. Resource (unit/resource.test.ts) - 14 tests

- ✅ createResource 无 source：loading/data/error、refetch、fetcher 抛错与非
  Promise 边界
- ✅ createResource 有 source：source 变化时重新请求
- ✅ **lazy**、**mapArray** 列表映射与缓存

### 12. Router (unit/router.test.ts) - 40 tests

- ✅
  createRouter：getCurrentRoute、navigate、replace、subscribe、start、stop、back/forward/go
- ✅ 无 location/history 不抛错、routes 为空数组边界
- ✅ 路径匹配：basePath、动态参数 :id；beforeRoute：返回 false 取消、返回重定向
  path、true 继续
- ✅ afterRoute、notFound 与 metadata；scroll: top / false / restore
- ✅ mode (history / hash)：pathname+search、hash path+query、href 带
  #、navigate/replace
- ✅ buildPath 与 navigate/href/replace 的 params、query；encodeURIComponent
- ✅ interceptLinks：同源 &lt;a&gt; 拦截、target=_blank/download/data-native
  不拦截、hash 锚点、修饰键/右键不拦截、interceptLinks: false

### 13. Runtime (unit/runtime.test.ts) - 22 tests

- ✅ generateHydrationScript：无参/传入 data/scriptSrc
- ✅ createRoot / render：挂载、insert(getter) 与 SignalRef、空实现、container
  已有子节点、unmount 后 set 不抛错
- ✅ **mount**：选择器、noopIfNotFound、fn 只执行一次；insertReactive 与
  MountFn、DocumentFragment、VNode 等边界

### 14. Scheduler (unit/scheduler.test.ts) - 17 tests

- ✅ schedule / flushScheduler / batch / unschedule：微任务、嵌套
  batch、composition 与 DEFER 等

### 15. Signal (unit/signal.test.ts) - 22 tests

- ✅ createSignal：返回 `SignalRef`（`.value` 读/写）、updater 函数、Object.is
  相同值不触发更新；元组形态 `[get, set]`
- ✅ 边界：初始值为 undefined/null
- ✅ isSignalGetter、isSignalRef、`unwrapSignalGetterValue`、markSignalGetter

### 16. SSR document shim (unit/ssr-document-shim.test.ts) - 3 tests

- ✅ `renderToString` / `renderToStream` 执行完毕后 `globalThis.document` 被恢复

### 17. Store (unit/store.test.ts) - 29 tests

- ✅ createStore：仅 state 时 [get, set]、空 state、get() 响应式、set
  updater、嵌套属性
- ✅ 默认 asObject 为 true 时返回对象，可直接读 state
  属性；默认返回对象支持直接赋值 store.xxx = value 更新 state
- ✅ actions、persist 自定义 storage、persist.key 空串边界
- ✅ getters 派生与 state 更新、getters 返回 undefined、actions 内抛错边界
- ✅ withGetters/withActions 辅助；仅 getters 或仅 actions 的 asObject
  true/false；getters+actions asObject false
- ✅ Persist：storage 为 null、自定义 serialize/deserialize、getItem
  null/空、deserialize 抛错、setItem 抛错
- ✅ 同一 key 返回已有实例（状态共享）；setState updater；getters/actions
  非函数项跳过；Proxy ownKeys/展开

### 18. Stream (unit/stream.test.ts) - 4 tests

- ✅ renderToStream：异步生成器、根级子节点顺序 yield 片段

### 19. Build & HMR (unit/build-hmr.test.ts, unit/hmr.test.ts) - 8 tests

- ✅ getRoutePathForChangedPath：/views/home → "/"、/views/{segment} →
  "/{segment}"、Windows 路径
- ✅ getHmrVersionGetter / **VIEW_HMR_BUMP**：版本 getter 与 bump

### 20. Compiler (unit/compiler.test.ts) - 13 tests

- ✅ optimize：常量折叠（数字、比较、字符串拼接）、空/无效代码；边界：除数为
  0/取模为 0 不折叠、一元加号折叠、乘除折叠、fileName .tsx 解析
- ✅ createOptimizePlugin：name 与 setup、自定义 filter 与 readFile；onLoad
  readFile 失败时 catch 返回空字符串

### 20b. JSX 编译器与 spread（unit/jsx-compiler.test.ts、unit/spread-intrinsic.test.ts）

- ✅
  **jsx-compiler（112）**：compileSource、静态分支折叠、Suspense/vIf、ref、受控
  input、动态 `target`/`className`、列表 coalesce、For/Show/Switch/Dynamic 等
- ✅
  **spread-intrinsic（62）**：`spreadIntrinsicProps`；**`setIntrinsicDomAttribute`**
  对 `null`/`undefined` 走 `removeAttribute`，避免字面量 `"undefined"`

### 21. Proxy (unit/proxy.test.ts) - 5 tests

- ✅ createNestedProxy：get/set 与 target 一致、嵌套代理、proxyCache 复用

### 22. 自定义指令挂载 (unit/vnode-mount-directives.test.ts) - 3 tests

- ✅ 手写 VNode + `applyDirectives`：`mounted` 在微任务内执行
- ✅ binding 为 signal getter 时 `updated` 随依赖重跑；**`SignalRef`
  绑定**也会触发 `updated` 重跑

### 23. 其它专项（节选）

- ✅ **For / Show / Dynamic /
  Switch**（unit/for、show、dynamic、switch-match）：列表与条件、`SignalRef` 与
  accessor
- ✅ **insertReactive** 系列：数组规范化、keyed patch、MountFn
  untrack、指标、本征标尺、VNode 数组与尾锚点等
- ✅ **vnode-reconcile**：canPatch、受控 input 与 patch 焦点
- ✅ **compiled-runtime / compiled-contract / entry-mod-smoke**：主包与 compiled
  入口契约
- ✅
  **active-document、globals、escape、logger-server、version-utils、portal、transition、unmount、dev-runtime-warn、build-jsx-mode、form-page-compile、jsx-handoff、jsx-compiler-dependency-graph、route-mount-bridge、route-page、router-mount、runtime-insert-reactive-vnode-array、runtime-props、scheduler-focus-restore、vnode-debug、vnode-insert-bridge、vnode-mount-getter-mountfn、vnode-mount-runtime-props**
  等文件内用例均通过（见上表）

## 测试覆盖分析

| 类别       | 覆盖说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 接口方法   | createSignal（`SignalRef`）、`unwrapSignalGetterValue`、createEffect、createMemo、createRoot、mount、createReactive、createStore、createRouter、createResource、createContext、JSX、compiler（含 **compileSource** 与 **`setIntrinsicDomAttribute` 动态属性**）、指令（含自定义 `applyDirectives` 与 `SignalRef` 的 `updated`）、Boundary、Runtime/SSR、**SSR document shim**、scheduler、meta、proxy、stream、**spread-intrinsic**（含 **`setIntrinsicDomAttribute`**）、**insert-reactive** 系列、**For/Show/Dynamic** |
| 边界情况   | 空数组、undefined/null、非函数、无 Provider、无 location、routes 为空、unmount 后 set signal 等                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 错误处理   | effect 抛错、ErrorBoundary、fetcher 抛错、actions 抛错等                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 集成与 E2E | createRoot + 事件 + signal + insert、微任务后 DOM 更新、CLI init/build/start、浏览器多页与导航、**控制流 / 列表插入 / Form 密码框焦点 / Gallery / Layout2 / Runtime 文档块 / Store persist** 等                                                                                                                                                                                                                                                                                                                          |

## 优点

- 单元、集成与浏览器 E2E 覆盖完整
- 边界与错误场景有专门用例
- 与 happy-dom 和真实浏览器双环境验证
- **Deno**（`deno test -A --no-check tests`）与
  **Bun**（`bun test`）双运行时本次记录均全部通过

## 结论

当前 @dreamer/view 在 **Deno** 下 **892** 条用例、**Bun** 下 **826**
条用例（运行器统计口径不同），**全部通过**，通过率
100%。覆盖信号（`SignalRef`、`unwrapSignalGetterValue`）、响应式、scheduler、路由、资源、上下文、指令（内置辅助 +
**vnode-mount-directives** 自定义 `applyDirectives`）、运行时与
SSR（createRoot、render、mount、renderToString、renderToStream、**SSR document
shim**）、**spread-intrinsic**（含 **`setIntrinsicDomAttribute`**）/
**insert-reactive** /
**runtime-props**（mergeProps、splitProps）、Store（persist、getters/actions）、Reactive、Boundary、meta、proxy、compiler（含动态属性
**`setIntrinsicDomAttribute`**）、stream、build/HMR、**build-jsx-mode**、**dev-runtime-warn**、**compiled
与 compiler
契约**、RoutePage、**route-mount-bridge**、router-mount、**jsx-handoff**、version-utils、logger-server、**vnode-debug**、**vnode-mount-runtime-props**、子路径入口（csr/hybrid/ssr）、**vnode-insert-bridge**、CLI（init/build/start）、**浏览器
E2E**（控制流、列表插入、Gallery、Layout2、Form 密码框焦点、Store localStorage
恢复、v-once/vCloak 文案等），以及**集成**（createRoot + insert + 事件 +
unmount），满足发布与文档展示需求。
