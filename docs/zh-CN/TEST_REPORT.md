# @dreamer/view 测试报告

## 测试概览

| 项目     | 说明                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 测试包   | @dreamer/view                                                                                                                        |
| 版本     | 1.3.3                                                                                                                                |
| 测试框架 | @dreamer/test ^1.0.15                                                                                                                |
| 测试时间 | 2026-03-23                                                                                                                           |
| DOM 环境 | happy-dom 20.4.0（单元/集成）、浏览器（E2E）                                                                                         |
| 运行命令 | **Deno**：`deno test -A tests/`；**Bun**：`bun test tests/`（Bun 下可加 `--preload ./tests/dom-setup.ts` 在无 DOM 时注入 happy-dom） |

## 测试结果

### Deno

- **总测试数**：573
- **通过**：573
- **失败**：0
- **通过率**：100%
- **执行时间**：约 1 分 43 秒

### Bun

- **总测试数**：523
- **通过**：523
- **失败**：0
- **通过率**：100%
- **执行时间**：约 85 秒（51 个测试文件，含 E2E 浏览器与 CLI；建议
  `--preload ./tests/dom-setup.ts`）
- **说明**：无 DOM 环境时建议使用 `--preload ./tests/dom-setup.ts`，否则依赖
  `document` 的单元/集成用例可能因 SSR guard 或缺少 document 而失败。

> 两种运行时（Deno / Bun）下用例均全部通过；Bun 与 Deno
> 的测试数量差异来自运行器统计方式不同，覆盖的测试文件与场景一致。

### 测试文件统计

（与 `deno test -A tests/` 按文件汇总一致，共 **51** 个测试文件。）

| 测试文件                               | 测试数 | 状态        |
| -------------------------------------- | ------ | ----------- |
| e2e/cli.test.ts                        | 6      | ✅ 全部通过 |
| e2e/view-example-browser.test.ts       | 72     | ✅ 全部通过 |
| integration/integration.test.ts        | 5      | ✅ 全部通过 |
| unit/active-document.test.ts           | 3      | ✅ 全部通过 |
| unit/boundary.test.ts                  | 22     | ✅ 全部通过 |
| unit/build-hmr.test.ts                 | 5      | ✅ 全部通过 |
| unit/build-jsx-mode.test.ts            | 5      | ✅ 全部通过 |
| unit/compiled-contract.test.ts         | 3      | ✅ 全部通过 |
| unit/compiled-runtime.test.ts          | 23     | ✅ 全部通过 |
| unit/compiler.test.ts                  | 13     | ✅ 全部通过 |
| unit/context.test.ts                   | 7      | ✅ 全部通过 |
| unit/dev-runtime-warn.test.ts          | 4      | ✅ 全部通过 |
| unit/directive.test.ts                 | 19     | ✅ 全部通过 |
| unit/effect.test.ts                    | 15     | ✅ 全部通过 |
| unit/entry-mod-smoke.test.ts           | 3      | ✅ 全部通过 |
| unit/escape.test.ts                    | 6      | ✅ 全部通过 |
| unit/form-page-compile.test.ts         | 3      | ✅ 全部通过 |
| unit/globals.test.ts                   | 6      | ✅ 全部通过 |
| unit/hmr.test.ts                       | 3      | ✅ 全部通过 |
| unit/insert-replacing.test.ts          | 4      | ✅ 全部通过 |
| unit/jsx-compiler.test.ts              | 39     | ✅ 全部通过 |
| unit/jsx-handoff.test.ts               | 4      | ✅ 全部通过 |
| unit/jsx-runtime.test.ts               | 7      | ✅ 全部通过 |
| unit/logger-server.test.ts             | 4      | ✅ 全部通过 |
| unit/meta.test.ts                      | 21     | ✅ 全部通过 |
| unit/portal.test.ts                    | 6      | ✅ 全部通过 |
| unit/proxy.test.ts                     | 5      | ✅ 全部通过 |
| unit/reactive.test.ts                  | 7      | ✅ 全部通过 |
| unit/ref-dom.test.ts                   | 4      | ✅ 全部通过 |
| unit/ref.test.ts                       | 4      | ✅ 全部通过 |
| unit/resource.test.ts                  | 8      | ✅ 全部通过 |
| unit/route-mount-bridge.test.ts        | 5      | ✅ 全部通过 |
| unit/route-page.test.ts                | 4      | ✅ 全部通过 |
| unit/router-mount.test.ts              | 4      | ✅ 全部通过 |
| unit/router.test.ts                    | 40     | ✅ 全部通过 |
| unit/runtime-props.test.ts             | 17     | ✅ 全部通过 |
| unit/runtime.test.ts                   | 21     | ✅ 全部通过 |
| unit/scheduler.test.ts                 | 5      | ✅ 全部通过 |
| unit/signal.test.ts                    | 19     | ✅ 全部通过 |
| unit/spread-intrinsic.test.ts          | 13     | ✅ 全部通过 |
| unit/ssr-compiled.test.ts              | 16     | ✅ 全部通过 |
| unit/ssr-document-shim.test.ts         | 3      | ✅ 全部通过 |
| unit/store.test.ts                     | 29     | ✅ 全部通过 |
| unit/stream.test.ts                    | 4      | ✅ 全部通过 |
| unit/transition.test.ts                | 8      | ✅ 全部通过 |
| unit/unmount.test.ts                   | 6      | ✅ 全部通过 |
| unit/version-utils.test.ts             | 9      | ✅ 全部通过 |
| unit/vnode-debug.test.ts               | 4      | ✅ 全部通过 |
| unit/vnode-insert-bridge.test.ts       | 2      | ✅ 全部通过 |
| unit/vnode-mount-directives.test.ts    | 3      | ✅ 全部通过 |
| unit/vnode-mount-runtime-props.test.ts | 25     | ✅ 全部通过 |

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

### 3. E2E 浏览器示例 (e2e/view-example-browser.test.ts) - 72 tests

- ✅ 首页挂载与多页面入口、各卡片进入
  Signal/Store/Boundary/指令/Reactive/Resource/Context/Runtime/Router 页
- ✅ Signal 页：count/double、name 输入与「你好，xxx」
- ✅ Store 页：count、greeting 与名字输入；**persist**：清空 key 后
  +1、localStorage 写入、再次进入页面 count 仍恢复
- ✅ Boundary 页：抛错展示、Suspense 异步内容
- ✅ 指令页：vIf/vElse 链、表单 `value`/`checked`（`SignalRef`）与
  onInput/onChange、 v-focus；**main 文案含 v-once / vCloak 说明区块**
- ✅ Reactive 页：createReactive 表单、多字段 summary、下拉与选项
- ✅ Resource 页：重新请求、id 切换、Suspense 与 Promise 区块
- ✅ Context 页：light/dark 主题切换
- ✅ Runtime 页：输入后生成 HTML（renderToString）；**页面展示
  generateHydrationScript、renderToStream / `@dreamer/view/stream` 文档块**
- ✅ **Layout 页**：/layout 显示布局示例与 _layout、inheritLayout 说明
- ✅ **Layout 2 页**：/layout/layout2 嵌套路由与说明；**document.title 兼容
  Layout2 / Layout 2**
- ✅ **Loading 页**：/loading 懒加载完成后显示加载态示例与 _loading 说明
- ✅ **Gallery**：/gallery 网格、/images
  静态图加载完成；首张缩略图预览、放大、关闭； **顶栏「示例」下拉进入相册**（nav
  标签中英兼容：相册 / Gallery）
- ✅ 顶部导航与路由跳转、Layout 主题、404 与返回首页

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

### 6. Effect (unit/effect.test.ts) - 15 tests

- ✅ createEffect：非函数抛错、立即执行、signal
  变更后再次执行、dispose、清理函数与 onCleanup
- ✅ 边界：effect 回调抛错时错误向上抛出
- ✅ createMemo：非函数抛错、getter 与缓存、依赖变更重算、effect 中读取
  memo、返回 undefined/null 边界

### 7. 集成 (integration/integration.test.ts) - 5 tests

- ✅ createRoot(fn(container)) + signal：按钮 onClick 更新
  signal；insert(getter) 处 DOM 随 signal 更新；unmount 后容器清空
- ✅ 多事件类型：onClick 与 change 等绑定正确
- ✅ insert(getter) 读 signal，外部 `.value` 赋值后视图更新
- ✅ unmount 后再次 set signal 不抛错、不更新 DOM

### 8. JSX Runtime (unit/jsx-runtime.test.ts) - 7 tests

- ✅ jsx / jsxs：type/props/children、key 提取与第三参覆盖、Fragment 为 Symbol

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

### 11. Resource (unit/resource.test.ts) - 8 tests

- ✅ createResource 无 source：loading/data/error、refetch、fetcher 抛错与非
  Promise 边界
- ✅ createResource 有 source：source 变化时重新请求

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

### 13. Runtime (unit/runtime.test.ts) - 21 tests

- ✅ renderToString：根组件 HTML、Fragment 与多子节点；**SSR 分支覆盖**：
  null/undefined 子节点、signal getter
  子节点、普通函数子节点（不输出函数源码）、 数组含函数、函数返回
  null/数组/Fragment、数字/字符串/转义文本、keyed 子节点、 void
  元素、htmlFor/style/vCloak、options、根返回 null 抛错、ErrorBoundary
  fallback；**Fragment 根** 与函数子节点
- ✅ generateHydrationScript：无参/传入 data/scriptSrc
- ✅ createRoot / render：挂载、根依赖 signal 后更新 DOM、空 Fragment、container
  已有子节点、unmount 后 set 不抛错
- ✅ **forceRender**：root.forceRender() 可触发根 effect 重跑（如外部路由集成）
- ✅ **createReactiveRoot**：初始挂载与 Root 返回值；getState 为 signal
  时数字/对象 状态变更后 patch 更新 DOM；unmount 后容器清空；边界：unmount 后再
  set state 不抛错且不更新 DOM
- ✅ **mount**：mount(container, fn) 传入 Element 与 render
  一致；mount(selector, fn) 选择器解析并挂载；noopIfNotFound 时查不到返回空
  Root；未设 noopIfNotFound 时查不到抛错；有子节点走 hydrate 路径（移除
  cloak）；无子节点走 render 路径
- ✅ hydrate：复用子节点并激活、移除 cloak；hydrate 后状态变更走 patch（input
  保持同一 DOM 引用）

### 14. Scheduler (unit/scheduler.test.ts) - 5 tests

- ✅ schedule：任务在微任务中执行；同一 tick 多次 schedule 批量执行
- ✅ unschedule：flush 前取消则不执行；只移除指定任务

### 15. Signal (unit/signal.test.ts) - 19 tests

- ✅ createSignal：返回 `SignalRef`（`.value` 读/写）、updater 函数、Object.is
  相同值不触发更新
- ✅ 边界：初始值为 undefined/null
- ✅ isSignalGetter、isSignalRef、`unwrapSignalGetterValue`、markSignalGetter

### 16. SSR document shim (unit/ssr-document-shim.test.ts) - 3 tests

- ✅ 组件内访问 `document.body.style.overflow` 不抛错且输出 HTML
- ✅ 组件内 `document.getElementById` / `querySelector` 返回 null 不抛错
- ✅ 组件内 `document.querySelectorAll` 返回空数组不抛错
- ✅ 设置并读取 `document.body.style.overflow` 不抛错
- ✅ `renderToString` / `renderToStream` 执行完毕后 `globalThis.document` 被恢复
- ✅ 流式 SSR 时组件内访问 document 不抛错

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

- ✅ renderToStream：返回生成器；简单 div 输出 HTML；文本子节点转义；**普通
  函数子节点** 输出返回值（非源码）；keyed 子节点输出 data-view-keyed；void
  元素无闭合标签

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

- ✅ **jsx-compiler（39）**：compileSource、Suspense/vIf、ref、受控
  input、**动态 `target`/`className` 生成 `setIntrinsicDomAttribute`** 等
- ✅
  **spread-intrinsic（13）**：`spreadIntrinsicProps`；**`setIntrinsicDomAttribute`**
  对 `null`/`undefined` 走 `removeAttribute`，避免字面量 `"undefined"`

### 21. Proxy (unit/proxy.test.ts) - 5 tests

- ✅ createNestedProxy：get/set 与 target 一致、嵌套代理、proxyCache 复用

### 22. 自定义指令挂载 (unit/vnode-mount-directives.test.ts) - 3 tests

- ✅ 手写 VNode + `applyDirectives`：`mounted` 在微任务内执行
- ✅ binding 为 signal getter 时 `updated` 随依赖重跑；**`SignalRef`
  绑定**也会触发 `updated` 重跑

## 测试覆盖分析

| 类别       | 覆盖说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接口方法   | createSignal（`SignalRef`）、`unwrapSignalGetterValue`、createEffect、createMemo、createRoot、**createReactiveRoot**、**mount**、createReactive、createStore、createRouter、createResource、createContext、JSX、compiler（含 **compileSource** 与 **`setIntrinsicDomAttribute` 动态属性**）、指令（含自定义 `applyDirectives` 与 `SignalRef` 的 `updated`）、Boundary、Runtime/SSR、**SSR document shim**、scheduler、meta、proxy、stream、**spread-intrinsic**（含 **`setIntrinsicDomAttribute`**）、**insert-replacing** |
| 边界情况   | 空数组、undefined/null、非函数、无 Provider、无 location、routes 为空、unmount 后 set signal 等                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 错误处理   | effect 抛错、ErrorBoundary、fetcher 抛错、actions 抛错等                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 集成与 E2E | createRoot + 事件 + signal + insert、微任务后 DOM 更新、CLI init/build/start、浏览器多页与导航、**Gallery / Layout2 / Runtime 文档块 / Store persist / Form 密码框焦点（浏览器）**                                                                                                                                                                                                                                                                                                                                         |

## 优点

- 单元、集成与浏览器 E2E 覆盖完整
- 边界与错误场景有专门用例
- 与 happy-dom 和真实浏览器双环境验证
- **Deno 与 Bun
  双运行时**下测试均可通过（`deno test -A tests/`、`bun test --preload ./tests/dom-setup.ts tests/`）

## 结论

当前 @dreamer/view 在 **Deno** 下 **573** 个用例、**Bun** 下 **523**
个用例（运行器统计方式不同，文件与场景一致），**全部通过**，通过率
100%。覆盖信号（`SignalRef`、`unwrapSignalGetterValue`）、响应式、scheduler、路由、资源、上下文、指令（内置辅助 +
**vnode-mount-directives** 自定义 `applyDirectives`）、运行时与
SSR（createRoot、render、**mount**、**createReactiveRoot**、hydrate、renderToString、renderToStream、**SSR
document shim**）、**spread-intrinsic**（含 **`setIntrinsicDomAttribute`**）/
**insert-replacing** /
**runtime-props**（mergeProps、splitProps）、Store（persist、getters/actions）、Reactive、Boundary、meta、proxy、compiler（含动态属性
**`setIntrinsicDomAttribute`**）、stream、build/HMR、**build-jsx-mode**、**dev-runtime-warn**、**compiled
与 compiler
契约**、RoutePage、**route-mount-bridge**、router-mount、**jsx-handoff**、version-utils、logger-server、**vnode-debug**、**vnode-mount-runtime-props**、子路径入口（csr/hybrid/ssr）、**vnode-insert-bridge**、CLI（init/build/start）、**浏览器
E2E**（Gallery、Layout2、Form 密码框焦点、Store localStorage 恢复、v-once/vCloak
文案等），以及**集成**（createRoot + insert + 事件 +
unmount），满足发布与文档展示需求。
