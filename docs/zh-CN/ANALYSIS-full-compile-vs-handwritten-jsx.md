# 全量编译（compileSource）与手写 JSX（VNode）路径对照分析

本文档对比 **构建期 `compileSource` 全量编译** 与 **`react-jsx` +
`jsxImportSource` 手写 JSX（`jsx`/`jsxs` → `VNode` → `mountVNodeTree`）**
两条路径在运行时行为上的 **支持 / 不支持 / 差异**。实现以仓库内
`view/src/jsx-compiler/transform.ts`、`view/src/jsx-runtime.ts`、`view/src/compiler/vnode-mount.ts`、`view/src/compiler/insert.ts`
为准；版本迭代后请以源码为准。

相关文档：[编译路径与运行时指南](../编译路径与运行时指南.md)。

---

## 一、术语与数据流

| 术语           | 含义                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **全量编译**   | 对 TSX 源码执行 `compileSource`（或 view-cli / esbuild 插件等等价管线），将 JSX 改写为 `insert` / `createElement` / `insertReactive` / `createEffect` / `applyDirectives` 等运行时调用，组件根通常为 `(container) => void`。                            |
| **手写 JSX**   | 不经过 `compileSource`：TS 配置 `jsx: "react-jsx"` + `jsxImportSource: "@dreamer/view"`（或 `jsr:@dreamer/view`），JSX 在类型检查期转为对 `jsx`/`jsxs` 的调用，运行得到 **VNode**，再由 `insert` → `insertReactive` → **`mountVNodeTree`** 展开为 DOM。 |
| **MountFn**    | 单参函数 `(parent: Node) => void`，在父节点上同步挂载子树；全量编译后的组件根常为此形态。                                                                                                                                                               |
| **VNode 展开** | `mountVNodeTree` 递归处理 `type` 为字符串（本征标签）、函数（组件）、`Fragment`、`#text`、Context 等。                                                                                                                                                  |

---

## 二、总览矩阵（支持 = 有一等支持；部分 = 行为接近但语义/响应式有差异；不支持 = 需换写法或自实现）

| 能力                                                   | 全量编译                                                                               | 手写 JSX + `mountVNodeTree`                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **根挂载约定**                                         | `createRoot((el) => { insert(el, …); }, container)`，与 SSR `renderToString` 同一 `fn` | 同上；若仅 `mountVNodeTree` 而无外层 `insertReactive`，则只有该次挂载，无插入点级 effect                                                                                                                                                                        |
| **本征标签 `div`/`span`/…**                            | 编译为 `createElement` + 属性/子节点语句                                               | `jsx("div", props)` → `mountVNodeTree` 创建元素并挂子树                                                                                                                                                                                                         |
| **`{ expr }` 子表达式**                                | 编译为 `insert(parent, () => expr)`，细粒度订阅                                        | 进入 VNode `children`：函数/getter 子项在规范化后多走 `insertReactiveForVnodeSubtree`（需主包已注册 vnode-insert-bridge）                                                                                                                                       |
| **文本插值中的 signal**                                | 编译器可注入 `unwrapSignalGetterValue` 等，避免把函数 stringify 成属性                 | 依赖子节点为 getter/`insertReactive` 路径；**不要**指望把 getter 当普通 attribute 写到 DOM                                                                                                                                                                      |
| **vIf / vElseIf / vElse（兄弟链）**                    | 支持；根上单独 `vIf` 走 `insertReactive`，避免只挂载一次不更新                         | **支持**；`Fragment` 下兄弟链与编译语义对齐。**根本征节点单独 `vIf={getter}`**：仅在**当前这次** `mountVNodeTree` 执行时求值一次；除非整段 VNode 被包在会重跑的 `insertReactive` getter 里，否则 **signal 变化不会自动切换 DOM**（与编译器根 `vIf` 行为不一致） |
| **vOnce**                                              | `untrack` 包子树挂载                                                                   | **支持**（`untrack` 包子节点挂载）                                                                                                                                                                                                                              |
| **vCloak**                                             | `data-view-cloak`                                                                      | **支持**                                                                                                                                                                                                                                                        |
| **自定义指令 `registerDirective`（如 vFocus、vCopy）** | `applyDirectives` + `createEffect` + `registerDirectiveUnmount`                        | **支持**（本征元素在 `append` + `ref` 之后调用 `applyDirectives`，与编译顺序对齐）                                                                                                                                                                              |
| **v-insert / vInsert**                                 | 编译产物里由 `applyDirectives` 处理                                                    | **支持**（同一 `applyDirectives`）                                                                                                                                                                                                                              |
| **ref（函数 / `createRef()`）**                        | `scheduleFunctionRef` 等                                                               | **支持**（`bindIntrinsicRef`）                                                                                                                                                                                                                                  |
| **事件 `onClick` / `onInput` …**                       | `addEventListener`                                                                     | **支持**（`applyIntrinsicVNodeProps`）                                                                                                                                                                                                                          |
| **受控表单 `value` / `checked` 为 getter（signal）**   | 编译为 **`createEffect`** 写 `el.value` / `checked`，避免显示函数源码                  | **不支持等价自动行为**：`applyIntrinsicVNodeProps` **跳过**非事件的 **function** 类型属性，`value={() => x()}` **不会**绑定到 DOM。请改用全量编译，或外层 `insertReactive` 重建树，或不用 VNode 直挂该 input                                                    |
| **`{...spread}` 本征属性展开**                         | 编译为 `spreadIntrinsicProps(el, obj)`                                                 | **不自动支持**：需自行合并 props 再传入 `jsx`，或自行调用 `spreadIntrinsicProps`                                                                                                                                                                                |
| **组件 `{...props}`**                                  | 编译为 `mergeProps` / 相关工具                                                         | **不自动支持**：手写 `jsx(Comp, props)` 需自行 `mergeProps`                                                                                                                                                                                                     |
| **`className` / `htmlFor`**                            | 映射到 `class` / `for`                                                                 | **支持**                                                                                                                                                                                                                                                        |
| **`style` 对象**                                       | 编译路径有专门处理                                                                     | VNode 路径下 **对象型 style 被 `applyIntrinsicVNodeProps` 跳过**（不 `setAttribute`）；需编译或自行处理                                                                                                                                                         |
| **SVG / `createElementNS`**                            | 编译器按标签选 NS                                                                      | **支持**（`createElementForIntrinsic`）                                                                                                                                                                                                                         |
| **Fragment `<>…</>`**                                  | 编译展开                                                                               | **支持**（含子项 vIf 链）                                                                                                                                                                                                                                       |
| **Context Provider**                                   | 依编译/组件形态                                                                        | **支持**（`CONTEXT_SCOPE_TYPE` 等）                                                                                                                                                                                                                             |
| **函数组件返回值**                                     | 多为 `(parent) => void` MountFn                                                        | 可为 `() => VNode`、`MountFn`、裸 `VNode`、数组；`MountFn` 走 `insertReactiveForVnodeSubtree` 以对齐响应式                                                                                                                                                      |
| **Suspense / ErrorBoundary**                           | 编译器对子节点形态有约定（如无参 getter 等）                                           | 须按框架约定自行返回兼容结构；**不等同**于「随便写 JSX 即与编译产物一致」                                                                                                                                                                                       |
| **optimize / 常量折叠**                                | 可选 `compileSource` + optimize 插件                                                   | 无；手写无构建期折叠                                                                                                                                                                                                                                            |
| **Tree-shaking 与 import 注入**                        | 编译器按需注入 `insertReactive`、`applyDirectives` 等                                  | 依赖你从 `@dreamer/view` / `compiler` 实际引用的 API                                                                                                                                                                                                            |

---

## 三、内置指令与结构性行为（详细）

### 3.1 vIf / vElseIf / vElse

| 场景                                                 | 全量编译                                                                   | 手写 JSX                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Fragment` 内兄弟 `vIf` → `vElseIf` → `vElse`        | 走 `insertReactive` 或等价链，条件更新会切换分支                           | `mountNormalizedChildrenWithIfChain` 与编译语义对齐                                                                        |
| **根节点**或**单次** `mountVNodeTree` 内的本征 `vIf` | 根上 `vIf` 由 **`insertReactive` 包一层**，getter 内 signal 更新会重跑挂载 | **仅挂载时求一次条件**；后续 signal 变化**不会**单独触发该节点显示/隐藏，除非外层整段 VNode 在 `insertReactive` 里重新创建 |

### 3.2 vOnce / vCloak

两条路径均在本征展开时处理：`vOnce` 用 `untrack`
限制子树只随当前挂载跑一次；`vCloak` 写 `data-view-cloak`。

### 3.3 已移除的内置能力

**vFor、vShow** 已从编译器与运行时指令集中移除；列表与显隐请用 JS 数组迭代与
`vIf`（或其它 UI 逻辑），不在本文「两条路径差异」内重复展开。

---

## 四、自定义指令

- **全量编译**：本征标签上出现 `vFocus` 等自定义指令 prop 时，编译产物收集后调用
  `applyDirectives`。
- **手写 JSX**：本征 VNode 在 `mountVNodeTree` 中于 **`append` +
  `bindIntrinsicRef` 之后** 同样调用
  `applyDirectives(el, props, createEffect, registerDirectiveUnmount)`，因此
  **`mounted` / `updated`（signal getter）/ `unmounted`（登记卸载）**
  与编译路径一致。
- **限制**：若自定义指令依赖「仅编译期才有的全局
  import」，手写侧需自行保证运行时已 `registerDirective` 且与打包单例一致（多
  bundle 时注意 `globalThis` registry）。

---

## 五、组件返回值形态（手写尤需留意）

`mountVNodeTree` 对 `type === function` 的组件：

1. 返回 **`(parent) => void`**（MountFn）→ 走
   **`insertReactiveForVnodeSubtree`**，避免同步直调导致与 signal/vIf 脱节。
2. 返回 **`() => …` 零参函数**（常见手写「返回 VNode 的 getter」）→ 同样走
   **`insertReactiveForVnodeSubtree`**，按响应式子树处理。
3. 返回裸 **VNode / 数组** → 同步 `mountVNodeTree` 递归。

全量编译下组件根几乎总是 **MountFn**，与上述 1 对齐。

---

## 六、SSR、流式与水合

| 能力                                | 说明                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **renderToString / renderToStream** | 约定与 **全量编译后的 `fn(container)`** 一致；内部仍通过 `insert` → 可能触发 `mountVNodeTree`（例如 getter 返回 VNode）。                                                        |
| **手写 VNode 在 SSR 中**            | 只要进入同一 `insert`/`mountVNodeTree` 管线，本征指令与 `applyDirectives` 会执行；**伪 document** 下行为与浏览器略有差异（如部分 API 缺失时的回退）。                            |
| **hydrate**                         | 依赖与服务端 **同一套 `fn(container)`** 及细粒度插入点顺序；**推荐**全量编译保证插入点与 `data-view-*` 等契约一致。纯手写 VNode 若插入顺序/结构与 SSR 输出不一致，水合风险更高。 |

---

## 七、工具链与类型

| 项目                     | 全量编译                                                   | 手写 JSX                                                               |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| **构建**                 | 必须接入 `compileSource`（或官方 esbuild 插件 / view-cli） | 仅需 TypeScript JSX 配置 + 运行时包                                    |
| **调试**                 | 可读编译后 JS                                              | 可读 VNode 树 + `mountVNodeTree`                                       |
| **与 dweb / 路由懒加载** | 推荐对 `.tsx` 统一 compile，保证与客户端语义一致           | 若原生 `import()` 未编译，曾与 CSR 不一致；需项目侧保证与 compile 对齐 |

---

## 八、选型建议（简表）

| 需求                                                        | 建议                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 生产站点、SSR/水合、受控表单、复杂 spread、根级 vIf 响应式  | **优先全量编译**                                                               |
| 库内小组件、渲染器封装（如仅产出 VNode）、与第三方 TSX 共存 | 可 **手写 JSX**，但避开「VNode 直挂 + value getter」等坑，或对敏感子树仍走编译 |
| 自定义指令                                                  | 两条路径均已支持本征元素；注意注册时机与单例                                   |
| 最小依赖 / 快速脚本                                         | 手写 JSX + `insert`，避免拉编译器                                              |

---

## 九、维护说明

- 本文档为 **行为对照**，不替代 API 参考；以 `README`、`@packageDocumentation`
  为准。
- 若实现变更（尤其是
  `vnode-mount.ts`、`transform.ts`），请同步更新本文件与中英文版本。

**英文版**：[ANALYSIS-full-compile-vs-handwritten-jsx.md](../en-US/ANALYSIS-full-compile-vs-handwritten-jsx.md)
