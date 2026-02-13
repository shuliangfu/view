# @dreamer/view 测试报告

## 测试概览

| 项目     | 说明                                         |
| -------- | -------------------------------------------- |
| 测试包   | @dreamer/view                                |
| 版本     | 1.0.0                                        |
| 测试框架 | @dreamer/test ^1.0.5                         |
| 测试时间 | 2026-02-12                                   |
| DOM 环境 | happy-dom 20.4.0（单元/集成）、浏览器（E2E） |
| 运行命令 | `deno test -A tests/`                        |

## 测试结果

- **总测试数**：201
- **通过**：201
- **失败**：0
- **通过率**：100%
- **执行时间**：约 1 分 15 秒

### 测试文件统计

| 测试文件                         | 测试数 | 状态        |
| -------------------------------- | ------ | ----------- |
| e2e/view-example-browser.test.ts | 48     | ✅ 全部通过 |
| integration/integration.test.ts  | 11     | ✅ 全部通过 |
| unit/boundary.test.ts            | 13     | ✅ 全部通过 |
| unit/context.test.ts             | 7      | ✅ 全部通过 |
| unit/directive.test.ts           | 25     | ✅ 全部通过 |
| unit/effect.test.ts              | 15     | ✅ 全部通过 |
| unit/jsx-runtime.test.ts         | 6      | ✅ 全部通过 |
| unit/reactive.test.ts            | 7      | ✅ 全部通过 |
| unit/resource.test.ts            | 8      | ✅ 全部通过 |
| unit/router.test.ts              | 14     | ✅ 全部通过 |
| unit/runtime.test.ts             | 13     | ✅ 全部通过 |
| unit/signal.test.ts              | 14     | ✅ 全部通过 |
| unit/ssr-directives.test.ts      | 6      | ✅ 全部通过 |
| unit/store.test.ts               | 14     | ✅ 全部通过 |

## 功能测试详情

### 1. Boundary (unit/boundary.test.ts) - 13 tests

- ✅ isErrorBoundary 对 ErrorBoundary 组件返回 true、对其它函数返回 false
- ✅ getErrorBoundaryFallback：fallback 为函数/VNode/undefined/null 等边界
- ✅ ErrorBoundary 直接返回 children；无 children 时返回 null
- ✅ Suspense：同步 VNode、Promise 先 fallback 再解析、fallback 为 null 边界

### 2. E2E 浏览器示例 (e2e/view-example-browser.test.ts) - 48 tests

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
- ✅ 顶部导航与路由跳转、Layout 主题、404 与返回首页

### 3. Context (unit/context.test.ts) - 7 tests

- ✅ createContext 返回 Provider 与 useContext；无 Provider 时返回 defaultValue
- ✅ 边界：defaultValue 为 undefined 时无 Provider 则 useContext() 为 undefined
- ✅ 有 Provider 时 pushContext 后 useContext 返回 value；Provider value 为 null
  边界

### 4. Directive (unit/directive.test.ts) - 25 tests

- ✅ directiveNameToCamel / directiveNameToKebab（v-if / vElseIf 等）
- ✅
  getDirectiveValue、getVIfValue、getVElseShow、getVElseIfValue、getVShowValue
- ✅ getVForListAndFactory（数组、空数组、非数组边界）
- ✅ hasDirective / hasStructuralDirective / isDirectiveProp
- ✅ registerDirective / getDirective、createBinding

### 5. Effect (unit/effect.test.ts) - 15 tests

- ✅ createEffect：非函数抛错、立即执行、signal
  变更后再次执行、dispose、清理函数与 onCleanup
- ✅ 边界：effect 回调抛错时错误向上抛出
- ✅ createMemo：非函数抛错、getter 与缓存、依赖变更重算、effect 中读取
  memo、返回 undefined/null 边界

### 6. 集成 (integration/integration.test.ts) - 11 tests

- ✅ createRoot + 事件 + signal：按钮 onClick 更新 signal、DOM 随 signal 更新
- ✅ 多事件类型：onClick 与 onChange 等绑定
- ✅ createEffect 与 createRoot：根内读 signal，外部 set 后视图更新
- ✅ v-model：input text 初始值/输入/set 同步、checkbox checked 双向同步
- ✅ createReactive 表单：vModel 绑定后输入更新 model、多字段与 model 同步
- ✅ 细粒度更新：patch 非整树替换、未依赖 signal 的 DOM
  节点保持同一引用、输入框未重挂

### 7. JSX Runtime (unit/jsx-runtime.test.ts) - 6 tests

- ✅ jsx / jsxs：type/props/children、key 提取与第三参覆盖、Fragment 为 Symbol

### 8. Reactive (unit/reactive.test.ts) - 7 tests

- ✅ createReactive：代理初始属性、不修改入参、set 后 get 返回新值
- ✅ createEffect 内读取 reactive 属性，属性变更后 effect 再次执行（微任务后）
- ✅ 嵌套代理、多字段赋值触发曾读取过的 effect

### 9. Resource (unit/resource.test.ts) - 8 tests

- ✅ createResource 无 source：loading/data/error、refetch、fetcher 抛错与非
  Promise 边界
- ✅ createResource 有 source：source 变化时重新请求

### 10. Router (unit/router.test.ts) - 14 tests

- ✅
  createRouter：getCurrentRoute、navigate、replace、subscribe、start、stop、back/forward/go
- ✅ 无 location/history 不抛错、routes 为空数组边界
- ✅ 路径匹配：basePath、动态参数 :id
- ✅ beforeRoute：返回 false 取消导航、返回重定向 path、返回 true 继续
- ✅ afterRoute、notFound 与 meta

### 11. Runtime (unit/runtime.test.ts) - 13 tests

- ✅ renderToString：根组件 HTML、Fragment 与多子节点
- ✅ generateHydrationScript：无参/传入 data/scriptSrc
- ✅ createRoot / render：挂载、根依赖 signal 后更新 DOM、空 Fragment、container
  已有子节点、unmount 后 set 不抛错
- ✅ hydrate：复用子节点并激活、移除 cloak

### 12. Signal (unit/signal.test.ts) - 14 tests

- ✅ createSignal：[getter, setter]、初始值、setter 与 updater、Object.is
  相同值不更新
- ✅ 边界：初始值为 undefined/null
- ✅ isSignalGetter、markSignalGetter

### 13. SSR 指令 (unit/ssr-directives.test.ts) - 6 tests

- ✅ SSR vIf / vElseIf / vElse、vFor、vShow

### 14. Store (unit/store.test.ts) - 14 tests

- ✅ createStore：仅 state 时 [get, set]、空 state、get() 响应式、set
  updater、嵌套属性
- ✅ 默认 asObject 为 true 时返回对象，可直接读 state
  属性；默认返回对象支持直接赋值 store.xxx = value 更新 state
- ✅ actions、persist 自定义 storage、persist.key 空串边界
- ✅ getters 派生与 state 更新、getters 返回 undefined、actions 内抛错边界

## 测试覆盖分析

| 类别       | 覆盖说明                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接口方法   | createSignal、createEffect、createMemo、createRoot、createReactive、createStore、createRouter、createResource、createContext、JSX、指令、Boundary、Runtime/SSR 等均有用例 |
| 边界情况   | 空数组、undefined/null、非函数、无 Provider、无 location、routes 为空等                                                                                                   |
| 错误处理   | effect 抛错、ErrorBoundary、fetcher 抛错、actions 抛错等                                                                                                                  |
| 集成与 E2E | createRoot + 事件 + signal、v-model、createReactive 表单、细粒度更新、浏览器多页与导航                                                                                    |

## 优点

- 单元、集成与浏览器 E2E 覆盖完整
- 边界与错误场景有专门用例
- 与 happy-dom 和真实浏览器双环境验证

## 结论

当前 @dreamer/view 测试共 201 个用例，全部通过，通过率
100%。覆盖信号、响应式、路由、资源、上下文、指令、运行时与
SSR、Store、Reactive、Boundary 及浏览器示例流程，满足发布与文档展示需求。
