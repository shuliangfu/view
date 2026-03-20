# View 框架升级与重构分析：路线 C 一次性升级，全面 Solid 化并超越

## 一、目标与约束（路线 C 一次性方案）

### 1.1 选定方向

- **路线 C**：引入 JSX 编译器 +
  新运行时，**一次性写好**，**不兼容旧版本**（不保留「非编译路径」的客户端更新逻辑）。
- **轻量**：编译器仅在**构建时**运行，不打进运行时 bundle；运行时只提供 Solid
  级别的小 API（`insert`、`createEffect`、`createSignal` 等），保持包体积小。
- **全面向 Solid 靠拢并超越**：
  - **对齐 Solid**：组件只跑一次、表达式级细粒度更新、Props 为
    getter/代理、无整树 expand/patch。
  - **超越 Solid**：在
    SSR/流式/混合渲染、多运行时（CSR/hybrid/全量）、首包与水合策略、以及现有
    View 已有能力上做深一层，形成差异化。

### 1.2 不兼容旧版的含义（已落实）

- **已删除**：「根 effect 重跑 → expandVNode(整树) →
  patchRoot」的**客户端更新路径**（`renderVNode` 已移除）；以及原 `patchNode`
  等与「整树 expand + patch」相关的逻辑。
- **不保留**：非编译路径、双模式并行。客户端根统一为「compileSource(main.tsx) +
  mount + insert」，仅 insert 在 getter 返回 VNode 时内部做一次
  expand，无整树重跑。
- **可保留**：若需
  SSR，可单独保留「服务端渲染用」的树展开/序列化路径（可与编译协同：服务端执行编译后的组件产出可序列化树，或单独实现
  SSR 专用展开），与客户端更新路径分离，不算「兼容旧版客户端逻辑」。

### 1.3 当前 View 的包袱（将被移除）

- 纯运行时、无编译 → 改为**有编译**，编译期区分静态/动态。
- 整树 expand + patch、组件在 patch 时被 replace → 改为**无整树
  patch**，组件只跑一次，更新走绑定点。
- 函数组件 = replace、data-view-dynamic 等兼容分支 →
  **全部移除**，统一为「编译 + 插入点」模型。

---

## 二、结论先行

- **采用路线 C**：**自建**或接入 JSX 编译器（构建时）+
  **新运行时**（细粒度绑定、组件只跑一次），**不保留**旧 View 的 expand/patch
  客户端更新路径。**自建编译器**完全可行，见下文 3.2.1。
- **轻量**：编译器不进入 bundle；运行时只提供
  `createRoot`、`insert`、`createEffect`、`createSignal`、`mergeProps`/`splitProps`
  等少量 API，与 Solid 同级甚至更精简。
- **全面 Solid 化**：组件只跑一次、表达式级细粒度更新、Props
  代理/getter、无「对组件做 replace」。
- **超越 Solid**：在 SSR/流式、多运行时与包体积、水合与首屏、以及生态与 DX
  上做深，见下文「超越 Solid 的维度」。

---

## 三、路线 C 一次性升级方案（核心）

### 3.1 原则

| 原则           | 说明                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| 一次性写好     | 只实现「编译路径 + 新运行时」一条路，不做 A/B 渐进、不保留旧更新逻辑。              |
| 不兼容旧版     | 废弃 expandVNode/patchRoot 的客户端更新；不提供「未编译代码在客户端按旧逻辑运行」。 |
| 轻量           | 编译器构建时；运行时小 API 集；删除旧分支后体积与复杂度只降不升。                   |
| Solid 化并超越 | 对齐组件只跑一次、细粒度、Props getter；在 SSR、多运行时、包体积与 DX 上超越。      |

### 3.2 编译器（构建时）

- **职责**：把 JSX 编译成「静态结构 + 动态插入点/绑定」，**不**产出整棵可 diff
  的 VNode 树。
- **对 `{ expression }`**：在当前位置生成一个**绑定点**，例如：
  - `insert(parent, () => expression)`（文本/节点）；
  - 或 `setAttribute(el, name, () => value)`、`setStyle`、`addEventListener`
    等。
- **对组件**：生成「创建组件作用域 + 传 props（getter/代理）+
  **只执行一次**组件函数」；组件内对 `props.xxx`
  的访问在编译期或运行时建立订阅，子组件也是「只跑一次」。
- **产物**：与 Solid 类似，是「模板 + 插入点」的调用序列，依赖**运行时**的
  `insert`、`createEffect`、`createSignal` 等，**不**依赖
  `expandVNode`、`patchRoot`。

**轻量**：编译器仅在构建阶段运行，不进入用户端 bundle。

#### 3.2.1 自建编译器（推荐）

**可以自建编译器**，且对路线 C 很合适：

- **完全可控**：编译产物（插入点、组件只跑一次、Props 形态）与自研运行时约定
  100% 对齐，无需迁就 Babel/SWC 的 JSX 语义或版本。
- **无构建链强依赖**：不绑死某一版 Babel/SWC 或生态插件，Deno/Bun/Node
  下用同一套编译器即可，JSR 发布也简单（编译器作为构建时依赖，不进用户
  bundle）。
- **范围可收窄**：只实现「JSX → 静态结构 + 插入点」所需的那部分（解析
  JSX/TS、区分静态/动态、生成对 `insert`/`createEffect` 等的调用），不必做成通用
  TypeScript 编译器，体积与复杂度可控。
- **与 Solid 的差异可自己做主**：例如 SSR
  时的节点标记、多运行时下的产物差异，都可以在自建编译器里直接实现。

实施时可采用：**自建小编译器**（解析 + 遍历 AST +
生成目标调用或代码字符串）优先；若后续有需要再考虑接 Babel/SWC
插件作为补充。文档中「要新增的」编译管线即按**自建**为前提描述。

### 3.3 运行时（精简、单一路径）

- **仅保留与编译产物配合的 API**，例如：
  - `createRoot(fn)`：挂载根，内部用 `createEffect` 跑一次 `fn`，建立初始 DOM +
    绑定。
  - `insert(parent, value | getter)`：插入节点或「根据 getter
    订阅更新」的绑定点。
  - `createEffect(fn)`：响应式 effect，用于组件内副作用与动态子树的订阅。
  - `createSignal(initial)`、`createMemo(fn)`：响应式原语。
  - `mergeProps`、`splitProps`：Props 处理，避免解构丢响应式。
- **不再需要**：`expandVNode`、`patchRoot`、`patchNode`、`createElement`（由编译产物直接调
  DOM 或封装好的 `insert`）、对「函数组件 VNode」的 replace
  逻辑、`getDynamicChildEffectBody` 等旧客户端更新相关代码。
- **SSR**：若需服务端渲染，可单独实现「服务端执行编译后的组件 →
  产出可序列化树或流」的路径，或复用编译后的组件在 Node 中跑一遍得到
  HTML；与客户端「插入点 + effect」路径分离，不视为「兼容旧版」。

### 3.4 要删除的旧逻辑（不保留）

- 客户端**整树 expand 更新路径**（已删除 `renderVNode`）。\
  **当前**：根已改为 compileSource(main.tsx) + mount + insert；expandVNode 仅在
  insert 收到 VNode 及 dom/element 子树展开时使用，见
  **expandVNode与编译路径说明.md**。
- **patchRoot** / **patchNode** / reconcile：整树 diff、对函数组件的
  replace、`updateDynamicChild` 等。
- **createElement** 中与「组件 → 容器 / 占位 / getter」相关的分支。
- **getDynamicChildEffectBody**、**data-view-dynamic** 等与「整树 expand + 单点
  patch」相关的兼容逻辑。
- 根 **createEffect** 里「重新 expand 整树再
  patch」的更新路径；改为根只跑一次（或按编译约定建立绑定），更新完全由细粒度绑定驱动。

### 3.5 要新增的

- **JSX 编译管线**：解析 JSX → 区分静态/动态 → 生成「模板 +
  插入点」调用（调用运行时 `insert`、`createEffect`
  等）。**推荐自建小编译器**（见 3.2.1），与运行时约定完全对齐；也可按需接入
  Babel/SWC 插件。
- **新运行时模块**：`createRoot`、`insert`、`createEffect`、`createSignal`、`createMemo`、`mergeProps`、`splitProps`
  等；与 Solid 的 API 设计对齐，便于迁移与生态理解。
- **SSR 路径**（可选）：服务端执行编译后的组件或单独 SSR 展开逻辑，输出
  HTML/流，与客户端水合约定一致（例如 data 属性、标记绑定点），不依赖旧
  expand/patch。

### 3.6 轻量级体现

- **编译器**：构建时运行，**不打进运行时 bundle**；用户端只加载「新运行时」的小
  API 集。
- **运行时**：无 VNode 整树、无 expand/patch/reconcile，只有「插入点 +
  effect/signal」；体积与 Solid 同级，甚至可更小（只实现用到的 API）。
- **删除旧代码**：移除整树 expand、patch、组件 replace、data-view-dynamic
  等后，包体积与心智负担只降不升。

### 3.7 超越 Solid 的维度

在**对齐 Solid**（组件只跑一次、细粒度、Props
getter）的前提下，在以下方向超越或差异化：

| 维度                      | 做法                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **SSR / 流式 / 混合渲染** | View 已有 SSR、hydrate、多入口基础；可强化「同一套组件、服务端 + 客户端分工」、流式 HTML、选择性水合，文档与示例做足。                   |
| **多运行时与包体积**      | CSR / hybrid / 全量 分拆、按需加载；首包只带「当前路由/首屏」的绑定，水合按需，与现有 View 多运行时策略结合。                            |
| **构建与生态**            | 编译器与 Deno/Bun/Node 友好；JSR 发布、类型与文档优先，降低采用成本。                                                                    |
| **DX 与心智模型**         | 明确「组件只跑一次、哪里用哪里订阅」、Props 不解构、splitProps 最佳实践；错误信息与调试体验（如 effect 边界、signal 来源）可做得更友好。 |
| **服务端组件式能力**      | 若长期规划中有「服务端组件」或 RSC 式数据获取，可在同一套编译与运行时约定上扩展，与 Solid 的当前重心形成差异。                           |

---

## 四、与 Solid 对齐的要点（路线 C 后）

| 要点         | Solid                                | 路线 C 后的 View                             |
| ------------ | ------------------------------------ | -------------------------------------------- |
| 组件只跑一次 | 是，挂载时执行一次                   | 是，编译生成「只执行一次组件 + 插入点」      |
| 细粒度更新   | 表达式级，仅绑定处重跑               | 同上，`{ expr }` → 插入点，仅该点订阅更新    |
| Props        | getter/代理，用 `props.xxx` 建立订阅 | 同上，编译/运行时约定 Props 为 getter 或代理 |
| 无整树 patch | 无 VDOM，无对组件 replace            | 无 expand/patch，无「对组件做 replace」      |
| 运行时体积   | 小                                   | 小，编译器构建时，运行时仅小 API 集          |

---

## 五、实施顺序（路线 C 单路径拆解）

### 阶段 1：新运行时 + 编译约定（先可手写「编译产物」验证）

1. ✅ **实现新运行时
   API**：`createRoot`、`insert`、`createEffect`、`createSignal`、`createMemo`、`mergeProps`、`splitProps`，与
   Solid 语义对齐。
2. ✅
   **手写若干组件的「编译后」形态**：例如一个简单列表、一个轮播，不经过真实编译器，直接写「插入点 +
   effect」调用，验证：组件只跑一次、细粒度更新、无 replace 问题。
3. ✅ **删除旧更新路径的入口**：根 effect 不再调用 expandVNode +
   patchRoot；改为只跑一次根并挂载「编译产物」建立的 DOM + 绑定。（已提供
   `createRoot` / `render` 作为编译路径唯一入口；旧路径的物理删除在阶段 3
   执行。）

### 阶段 2：JSX 编译器

4. ✅ **选型**：**自建编译器**（推荐）：解析 JSX/TS → 遍历 AST → 生成对
   `insert`/`createEffect`
   等的调用（或生成代码字符串）；与运行时约定完全一致。可选替代：Babel/SWC
   插件。
5. ✅ **实现**：`{ expr }` → `insert(container, () => expr)` 或等价；**组件** →
   「运行一次组件 + 子插入点」（自闭合与带子节点均已支持）；Props
   当前为静态/表达式求值一次，后续可扩展 getter/代理。
6. ✅ **与运行时对接**：编译产物只依赖新运行时 API，不依赖任何 expand/patch。

### 阶段 3：移除旧代码 + SSR（可选）

7. ✅ **删除**：reconcile.ts 已删；expandVNode/patchRoot
   的客户端路径已移除（element 中 getDynamicChildEffectBody
   简化为整块替换、patchRoot 已删）；createRoot/render/mount 统一为新标准
   `fn(container)=>void`；旧
   API（createReactiveRoot、hydrate、createRootLegacy）已全部移除，不再兼容。
8. ✅ **SSR**：已实现「服务端执行编译后组件」并输出 HTML/流：
   `renderToString(fn, options?)`、`renderToStream(fn, options?)`； 同一套
   fn(container) 与客户端 createRoot 一致，根容器可带 data-view-ssr， 水合约定见
   Route-C-使用指南 § 六。

### 阶段 4：超越 Solid 的增强

9. ✅ **文档与示例**：路线 C
   使用指南（[Route-C-使用指南.md](./Route-C-使用指南.md)）：runtime +
   jsx-compiler 用法、splitProps 与 Props 规范、最小示例。
10. ✅ **首包与水合**：使用指南 § 八已补充多入口（全量/csr/hybrid）、按路由 lazy
    加载编译产物、水合约定（当前整挂载 + data-view-ssr）。
11. ✅ **DX**：使用指南 § 九已补充常见错误（传值丢响应式、container 为空、SSR 用
    document）、调试建议（effect 边界、signal 来源、Props 响应式）；createRoot
    对 container 空值抛明确错误。

---

## 六、总结表

| 问题                           | 路线 C 一次性方案                                            |
| ------------------------------ | ------------------------------------------------------------ |
| 是否兼容旧版 View 客户端更新？ | **不兼容**，旧 expand/patch 路径废弃。                       |
| 是否轻量？                     | **是**，编译器构建时；运行时小 API 集；旧代码删除后更轻。    |
| 是否全面 Solid 化？            | **是**，组件只跑一次、细粒度、Props getter、无组件 replace。 |
| 如何超越 Solid？               | SSR/流式/多运行时、包体积与水合、DX、服务端组件式扩展。      |
| 一次性还是渐进？               | **一次性**：只保留「编译 + 新运行时」一条路，不保留双模式。  |

**结论**：采用**路线
C**，**一次性写好**、**不兼容旧版本**、**轻量**（编译器构建时、运行时精简），全面向
**Solid.js 靠拢**（组件只跑一次、表达式级细粒度、Props getter），并在
**SSR、多运行时、包体积与 DX** 上超越或差异化。
