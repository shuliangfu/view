# @dreamer/view 测试报告

## 测试概览

| 项目     | 说明                                                        |
| -------- | ----------------------------------------------------------- |
| 测试包   | @dreamer/view                                               |
| 版本     | 1.0.20                                                      |
| 测试框架 | @dreamer/test ^1.0.8                                        |
| 测试时间 | 2026-02-18                                                  |
| DOM 环境 | happy-dom 20.4.0（单元/集成）、浏览器（E2E）                |
| 运行命令 | **Deno**：`deno test -A tests/`；**Bun**：`bun test tests/` |

## 测试结果

### Deno

- **总测试数**：435
- **通过**：435
- **失败**：0
- **通过率**：100%
- **执行时间**：约 2 分 23 秒

### Bun

- **总测试数**：410
- **通过**：410
- **失败**：0
- **通过率**：100%
- **执行时间**：约 1 分 46 秒（26 个测试文件）

> 两种运行时（Deno / Bun）下用例均全部通过；Bun 与 Deno
> 的测试数量差异来自运行器统计方式不同，覆盖的测试文件与场景一致。

### 测试文件统计

| 测试文件                         | 测试数 | 状态        |
| -------------------------------- | ------ | ----------- |
| e2e/cli.test.ts                  | 6      | ✅ 全部通过 |
| e2e/view-example-browser.test.ts | 63     | ✅ 全部通过 |
| integration/integration.test.ts  | 14     | ✅ 全部通过 |
| unit/boundary.test.ts            | 13     | ✅ 全部通过 |
| unit/build-hmr.test.ts           | 5      | ✅ 全部通过 |
| unit/compiler.test.ts            | 13     | ✅ 全部通过 |
| unit/context.test.ts             | 8      | ✅ 全部通过 |
| unit/directive.test.ts           | 25     | ✅ 全部通过 |
| unit/effect.test.ts              | 15     | ✅ 全部通过 |
| unit/globals.test.ts             | 5      | ✅ 全部通过 |
| unit/hmr.test.ts                 | 3      | ✅ 全部通过 |
| unit/jsx-runtime.test.ts         | 6      | ✅ 全部通过 |
| unit/meta.test.ts                | 21     | ✅ 全部通过 |
| unit/portal.test.ts              | 5      | ✅ 全部通过 |
| unit/props.test.ts               | 55     | ✅ 全部通过 |
| unit/proxy.test.ts               | 5      | ✅ 全部通过 |
| unit/reactive.test.ts            | 7      | ✅ 全部通过 |
| unit/resource.test.ts            | 8      | ✅ 全部通过 |
| unit/router.test.ts              | 40     | ✅ 全部通过 |
| unit/runtime.test.ts             | 50     | ✅ 全部通过 |
| unit/scheduler.test.ts           | 5      | ✅ 全部通过 |
| unit/signal.test.ts              | 14     | ✅ 全部通过 |
| unit/ssr-directives.test.ts      | 6      | ✅ 全部通过 |
| unit/store.test.ts               | 29     | ✅ 全部通过 |
| unit/stream.test.ts              | 7      | ✅ 全部通过 |
| unit/transition.test.ts          | 7      | ✅ 全部通过 |

## 功能测试详情

### 1. Boundary (unit/boundary.test.ts) - 13 tests

- ✅ isErrorBoundary 对 ErrorBoundary 组件返回 true、对其它函数返回 false
- ✅ getErrorBoundaryFallback：fallback 为函数/VNode/undefined/null 等边界
- ✅ ErrorBoundary 直接返回 children；无 children 时返回 null
- ✅ Suspense：同步 VNode、Promise 先 fallback 再解析、fallback 为 null 边界

### 2. E2E CLI (e2e/cli.test.ts) - 6 tests

- ✅ view init &lt;dir&gt;：在目标目录生成
  view.config.ts、deno.json、src、views、router 等
- ✅ examples 目录下 view build：产出 dist/ 且含 main.js
- ✅ build 后 view start：启动服务并用浏览器打开首页（多页面示例）

### 3. E2E 浏览器示例 (e2e/view-example-browser.test.ts) - 63 tests

- ✅ 首页挂载与多页面入口、各卡片进入
  Signal/Store/Boundary/指令/Reactive/Resource/Context/Runtime/Router 页
- ✅ Signal 页：count/double、name 输入与「你好，xxx」
- ✅ Store 页：count、greeting 与名字输入
- ✅ Boundary 页：抛错展示、Suspense 异步内容
- ✅ 指令页：vIf/vShow/v-for、v-text/v-html、v-model 输入与 checkbox
- ✅ Reactive 页：createReactive 表单、多字段 summary、下拉与选项
- ✅ Resource 页：重新请求、id 切换、Suspense 与 Promise 区块
- ✅ Context 页：light/dark 主题切换
- ✅ Runtime 页：输入后生成 HTML（renderToString）
- ✅ **Layout 页**：/layout 显示布局示例与 _layout、inheritLayout 说明
- ✅ **Loading 页**：/loading 懒加载完成后显示加载态示例与 _loading 说明
- ✅ 顶部导航与路由跳转、Layout 主题、404 与返回首页

### 4. Context (unit/context.test.ts) - 8 tests

- ✅ createContext 返回 Provider 与 useContext；无 Provider 时返回 defaultValue
- ✅ 边界：defaultValue 为 undefined 时无 Provider 则 useContext() 为 undefined
- ✅ 有 Provider 时 pushContext 后 useContext 返回 value；Provider value 为 null
  边界

### 5. Directive (unit/directive.test.ts) - 25 tests

- ✅ directiveNameToCamel / directiveNameToKebab（v-if / vElseIf 等）
- ✅
  getDirectiveValue、getVIfValue、getVElseShow、getVElseIfValue、getVShowValue
- ✅ getVForListAndFactory（数组、空数组、非数组边界）
- ✅ hasDirective / hasStructuralDirective / isDirectiveProp
- ✅ registerDirective / getDirective、createBinding

### 6. Effect (unit/effect.test.ts) - 15 tests

- ✅ createEffect：非函数抛错、立即执行、signal
  变更后再次执行、dispose、清理函数与 onCleanup
- ✅ 边界：effect 回调抛错时错误向上抛出
- ✅ createMemo：非函数抛错、getter 与缓存、依赖变更重算、effect 中读取
  memo、返回 undefined/null 边界

### 7. 集成 (integration/integration.test.ts) - 14 tests

- ✅ createRoot + 事件 + signal：按钮 onClick 更新 signal、DOM 随 signal 更新
- ✅ 多事件类型：onClick 与 onChange 等绑定
- ✅ createEffect 与 createRoot：根内读 signal，外部 set 后视图更新
- ✅ v-model：input text 初始值/输入/set 同步、checkbox checked 双向同步
- ✅ createReactive 表单：vModel 绑定后输入更新 model、多字段与 model 同步
- ✅ 细粒度更新：patch 非整树替换、未依赖 signal 的 DOM
  节点保持同一引用、输入框未重挂；**getter 返回 Fragment**：Fragment 内 input 在
  signal 更新后仍为同一 DOM 节点（表单不丢焦点）

### 8. JSX Runtime (unit/jsx-runtime.test.ts) - 6 tests

- ✅ jsx / jsxs：type/props/children、key 提取与第三参覆盖、Fragment 为 Symbol

### 9. Meta (unit/meta.test.ts) - 21 tests

- ✅ getMetaHeadFragment：title、titleSuffix、fallbackTitle、name 类 meta、og 类
  meta、HTML 转义；边界：meta 为 null、空 title、value 为 null/空/非字符串、og
  数组或 key 无前缀
- ✅ applyMetaToHead：document.title 与 meta、fallbackTitle、titleSuffix、og
  property；边界：meta 为 undefined、name 类 value 为空或仅空格

### 10. Props (unit/props.test.ts) - 55 tests

- ✅ applyProps：表单 value（清空、新值差异、blur）；ref（null、回调、{ current
  }、signal getter、无
  current）；vShow/vCloak；dangerouslySetInnerHTML；value/checked
  响应式；事件（onClick、替换监听器、null、onChange）；class/className、style、innerHTML；布尔与通用
  attribute、select/textarea；children/key/指令跳过；自定义指令（mounted、unmounted、updated）。

### 11. Reactive (unit/reactive.test.ts) - 7 tests

- ✅ createReactive：代理初始属性、不修改入参、set 后 get 返回新值
- ✅ createEffect 内读取 reactive 属性，属性变更后 effect 再次执行（微任务后）
- ✅ 嵌套代理、多字段赋值触发曾读取过的 effect

### 12. Resource (unit/resource.test.ts) - 8 tests

- ✅ createResource 无 source：loading/data/error、refetch、fetcher 抛错与非
  Promise 边界
- ✅ createResource 有 source：source 变化时重新请求

### 13. Router (unit/router.test.ts) - 40 tests

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

### 14. Runtime (unit/runtime.test.ts) - 50 tests

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

### 15. Scheduler (unit/scheduler.test.ts) - 5 tests

- ✅ schedule：任务在微任务中执行；同一 tick 多次 schedule 批量执行
- ✅ unschedule：flush 前取消则不执行；只移除指定任务

### 16. Signal (unit/signal.test.ts) - 14 tests

- ✅ createSignal：[getter, setter]、初始值、setter 与 updater、Object.is
  相同值不更新
- ✅ 边界：初始值为 undefined/null
- ✅ isSignalGetter、markSignalGetter

### 17. SSR 指令 (unit/ssr-directives.test.ts) - 6 tests

- ✅ SSR vIf / vElseIf / vElse、vFor、vShow

### 18. Store (unit/store.test.ts) - 29 tests

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

### 19. Stream (unit/stream.test.ts) - 7 tests

- ✅ renderToStream：返回生成器；简单 div 输出 HTML；文本子节点转义；**普通
  函数子节点** 输出返回值（非源码）；keyed 子节点输出 data-view-keyed；void
  元素无闭合标签

### 20. Build & HMR (unit/build-hmr.test.ts, unit/hmr.test.ts) - 8 tests

- ✅ getRoutePathForChangedPath：/views/home → "/"、/views/{segment} →
  "/{segment}"、Windows 路径
- ✅ getHmrVersionGetter / **VIEW_HMR_BUMP**：版本 getter 与 bump

### 21. Compiler (unit/compiler.test.ts) - 13 tests

- ✅ optimize：常量折叠（数字、比较、字符串拼接）、空/无效代码；边界：除数为
  0/取模为 0 不折叠、一元加号折叠、乘除折叠、fileName .tsx 解析
- ✅ createOptimizePlugin：name 与 setup、自定义 filter 与 readFile；onLoad
  readFile 失败时 catch 返回空字符串

### 22. Proxy (unit/proxy.test.ts) - 5 tests

- ✅ createNestedProxy：get/set 与 target 一致、嵌套代理、proxyCache 复用

## 测试覆盖分析

| 类别       | 覆盖说明                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 接口方法   | createSignal、createEffect、createMemo、createRoot、**createReactiveRoot**、**mount**、createReactive、createStore、createRouter、createResource、createContext、JSX、指令、Boundary、Runtime/SSR、scheduler、meta、proxy、compiler、stream 等均有用例 |
| 边界情况   | 空数组、undefined/null、非函数、无 Provider、无 location、routes 为空等                                                                                                                                                                                |
| 错误处理   | effect 抛错、ErrorBoundary、fetcher 抛错、actions 抛错等                                                                                                                                                                                               |
| 集成与 E2E | createRoot + 事件 + signal、v-model、createReactive 表单、细粒度更新、CLI init/build/start、浏览器多页与导航                                                                                                                                           |

## 优点

- 单元、集成与浏览器 E2E 覆盖完整
- 边界与错误场景有专门用例
- 与 happy-dom 和真实浏览器双环境验证
- **Deno 与 Bun
  双运行时**下测试均可通过（`deno test -A tests/`、`bun test tests/`）

## 结论

当前 @dreamer/view 在 **Deno** 下 435 个用例、**Bun** 下 410
个用例（统计方式不同），**全部通过**，通过率
100%。覆盖信号、响应式、scheduler、路由、资源、上下文、指令、运行时与
SSR（createRoot、render、**mount**、**createReactiveRoot**、hydrate、renderToString
全分支覆盖、renderToStream）、**applyProps**（ref、vShow/vCloak、dangerouslySetInnerHTML、value/checked
响应式、事件、class、style、attribute、自定义指令）、Store（persist、getters/actions、边界）、Reactive、Boundary、meta（getMetaHeadFragment、applyMetaToHead、边界）、proxy、compiler（常量折叠边界、插件
onLoad
catch）、stream、build/HMR、CLI（init/build/start）、浏览器示例流程，以及**集成**：getter
返回 Fragment 时 input 焦点保持，满足发布与文档展示需求。
