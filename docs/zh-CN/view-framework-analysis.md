# @dreamer/view 前端框架深入优化可行性分析

> **现行入库分析（v2.2.0／2026-11-03）。** 旧版 `analysis/` 下 v1／早期文已加水印；完整清单见 [`分析文档状态.md`](./分析文档状态.md)。入门 API 见 [`README.md`](./README.md)。


| 项 | 值 |
|----|-----|
| 分析对象 | `/home/deno/dreamer-jsr/view`（`@dreamer/view` **v2.2.0**，分支 `dev` @ `592997c`） |
| 分析日期 | **2026-11-03**（Asia/Shanghai） |
| 性质 | **只读分析**；未改产品代码、未跑全量测试 |
| 依据 | 现行 `src/`、`deno.json`/`package.json`、`analysis/` 既有文档（尤其 `全面分析-优化空间.md`、`3.0.0-规划分析.md`、`SECURITY.md`）、下游 `ui-view` / `dweb-admin` 消费方式 |
| 入库路径 | `docs/zh-CN/view-framework-analysis.md`（本文件；原草稿曾在 `/workspace/view-framework-analysis.md`） |
| 状态索引 | [`分析文档状态.md`](./分析文档状态.md) |

---

## 0. 结论先行

**还能继续深入优化／升级：能，而且空间仍然明确；但杠杆不在「再堆平行 API」，而在编译器吃满、默认包体边界、水合产品化、以及工程可观测性。**

| 问题 | 回答 |
|------|------|
| 核心是否健康？ | **健康。** 细粒度 Signal + 无 VDOM `insert`、Owner/`onCleanup`、batch 与 SSR 协作、For+key LIS、受控输入 IME/选区、安全 props 护栏均已落地。 |
| 最大优化杠杆？ | **① 编译器静态化／少 Effect** **② 主入口 barrel 瘦身（3.0 方向）** **③ 水合 mismatch／渐进水合产品化** **④ bench + 体积 CI** |
| 是否需要立刻大重构？ | **不需要。** 无 profiling／无用户拍板前，禁止推倒响应式内核、禁止默认时间分片、禁止把虚拟列表塞进 view 核心。 |
| 与 ui-view / dweb-admin？ | view = **运行时内核**；ui-view = **组件库**；dweb-admin = **业务应用**。交互类痛点（浮层误关、列表虚拟化、图标 barrel）多数应落在 **ui-view／应用**，勿塞回 view。 |

---

## 1. 定位与分层（避免改错仓库）

```text
dweb-admin（业务：主题／鉴权／页面）
    │ 消费
    ▼
ui-view（组件：DataPanel／Modal／Dropdown／图标…）
    │ 建立在
    ▼
@dreamer/view（本报告：Signal／insert／SSR／Router／Form／Compiler）
```

- **本轮范围是 `view`，不是 `ui-view`。** ui-view 的列设置、Dialog 偶发、深色按钮对比度等功能项已按经理指令暂停。
- 图标 barrel（约 575 文件／模块图 ~2MB）属 **ui-view** 资源面，结论见工作区 `icon-bundle-analysis.md`（ui-view 侧，非本仓库）；view 侧对应问题是 **主入口全家桶 re-export** 的默认包体，机制类似、对象不同。

源码规模（约）：`src/**/*.ts` **~1.5 万行**；热路径集中在 `reactivity/`、`runtime/insert|props|control-flow|ssr-dom`、`integrations/router`、`compiler/`。

---

## 2. 性能

### 2.1 已具备（再优化边际递减，勿无故推倒）

1. **无 VDOM + `insert` 定点更新**（文本复用、数组注释锚点、内容模型特判）。
2. **微任务 batch**（`pendingSet` 去重；SSR 活跃时同步 flush，避免错误 `queueMicrotask`）。
3. **For + key：LIS 最小移动**（2.1–2.2 已落地；整序正确为 no-op）。
4. **`createRenderEffect` 绑定函数 props**，避免受控 input 与 batch 时序打架。
5. **子路径 exports**（`/reactivity` `/csr` `/ssr` `/router` `/form` `/resource` `/control-flow` `/compiler` `/optimize` `/portal` 等）+ `package.json` **`sideEffects: false`**。
6. **已有少量 bench**（`tests/bench/signal.bench.ts`、`for.bench.ts`），但未见硬性 CI 体积／性能门禁。

### 2.2 仍可深入的点

| 方向 | 现状 | 机会 | 风险／成本 |
|------|------|------|------------|
| **编译器吃满** | `compiler/` 标注仍在演进；静态子树／路径生成已有，未到「默认产物几乎零通用 Effect」 | 静态提升、模板克隆、属性直连 DOM → **性能上限最高** | 高；需 golden 测防静默错 |
| **主入口 barrel** | `src/mod.ts` 仍 re-export router／form／store／控制流等「全家桶」 | 业务 `import { createSignal } from "@dreamer/view"` 可能拖入未用集成；与图标 barrel 问题同构 | 中；完整瘦身宜 **3.0**（见既有规划） |
| **SSR／水合成本** | 自研 `ssr-dom`、bindings 水合、`mismatchMode: continue\|assert\|remount`（默认 continue） | 渐进／分片水合、生产更严默认、并发 SSR 隔离 | 高；与 dweb Hybrid 绑定 |
| **列表虚拟化** | 核心仅 For／Index | **不应进 view 核心**；落 ui-view（ScrollList 等已有实践） | — |
| **调度双轨** | `batch`（Observer）与 `priority`（任意回调）**未统一** | 复杂应用可预期性 | **架构级 RFC**，非默认必做 |
| **Resource** | `loadGeneration` 丢弃过期写回；**无内建 AbortSignal／去重／HTTP 缓存** | 可选 Abort、文档化上层策略 | 中（加法可 2.x） |
| **Profiling 缺口** | 缺真实业务页 Effect／DOM 操作计数基线 | 先测再改 `insert`／`props` 热点 | 低成本高指导价值 |

### 2.3 首屏／包体（与下游）

- **view**：默认从主入口取信号时，打包器未必摇掉 router／form；文档与 monorepo 应强推子路径（2.2 已具备路径，**迁移未完成**）。
- **ui-view 图标**：从 barrel 取 1 个 Icon 仍解析约 **575** 文件／~**2MB** 模块图（详见 icon 分析）；与 view 主入口问题同类——**按需直达**。
- **dweb-admin**：普遍 `from "@dreamer/view"` 主入口；后续可试点改为 `/reactivity` 等，验证体积收益后再推广。

---

## 3. 安全

以现行 `runtime/props.ts`、`utils/escape.ts`、`analysis/SECURITY.md` 为准。

| 面 | 现状 | 剩余风险 |
|----|------|----------|
| **XSS／危险 HTML** | props **拒绝** `innerHTML`／`outerHTML`；`template(html)` 仅限信任／编译产物 | 用户仍可直接操作 DOM；须文档 + CSP |
| **URL** | `sanitizeUrl` 拦 `javascript:`／`vbscript:`／`data:text/html` | 保持回归测 |
| **事件** | `on*` **仅接受函数**；字符串 handler 忽略 | 保持 |
| **style** | 拦截 `expression(`／`javascript:` 片段 | 保持 |
| **SSR 文本／属性** | `escapeForText`／`escapeForAttr`；ssr-dom 复用 | 流式路径勿注入未转义用户输入 |
| **鉴权／Token** | **view 不持有业务 token**；暴露面在 dweb-admin／服务端 | 框架侧关注：勿把密钥打进 CSR bundle、水合脚本 nonce／CSP |
| **依赖面** | JSR `@dreamer/*` + typescript／happy-dom／autoprefixer 等；SSR 路径刻意不进浏览器主图 | 锁定版本 + 发布审计；happy-dom 仅服务端 |

**结论：** 框架层护栏已明显强于早期「v-html 直出」时代；后续以 **保持测试 + CSP 文档 + 禁止用户输入进 template** 为主，不必为安全单独大翻 props。

---

## 4. 代码结构／可维护性／技术债

### 4.1 结构优点

- 分层清晰：`reactivity` → `runtime` → `scheduler` → `integrations` → `compiler`／`cli`。
- 大文件有注释边界（`control-flow`、`ssr-dom`、`router`）；Owner 模型统一清理。
- 双运行时测试（Deno／Bun）+ 单元／集成／E2E／少量 bench。
- `analysis/` 内已有大量规划（含 **3.0.0-规划分析**），决策资产齐全。

### 4.2 技术债（按影响）

| 债 | 说明 | 建议 |
|----|------|------|
| **主入口 convenience barrel** | 兼容友好、默认包体差 | 2.x 文档推子路径；**3.0 策略 A 瘦身**（规划已写） |
| **编译器「演进中」** | 能力与默认开启策略未产品化 | 设覆盖率／golden；与 CLI 默认对齐 |
| **调度双轨** | batch ≠ priority | 独立 RFC，勿绑日常小优化 |
| **Router 单文件 ~1200 行** | 难测、难摇树 | 拆 match／history／Link（非行为变更） |
| **文档漂移** | 部分 zh README／旧 analysis 仍写「不存在／csr 子路径」或 v1 指令／VNode reconcile 表述；与 `deno.json` exports、2.2 CHANGELOG 不一致 | 加水印或修订，避免误决策 |
| **analysis 文档过多且年代跨 v1→v2** | 易引用过时结论 | 以本文 + `3.0.0-规划分析` + 现行源码为准 |
| **下游踩坑注释散落 ui-view** | `createMemo` 每次新建、`ref(null)` 瞬态、函数型 Context value 被执行、顶层读 Signal 导致整段替换 | 应沉淀为 **view 官方「组件作者指南」**，减少每个组件重复踩坑 |

### 4.3 与 3.0 规划关系

既有 `analysis/3.0.0-规划分析.md`（2026-07-22）仍有效：

- **只有故意破坏 2.x 兼容才升 major。**
- 3.0 核心候选：主入口瘦身、更严水合默认、更强编译默认。
- **刻意排除：** 无证据重写订阅链表、默认时间分片、把 ui-view 塞进 view。

当前仓库版本已是 **2.2.0**（Node 22+ 兼容等），加法型能力可继续走 2.2.x；破坏性项等用户拍板进 3.0。

---

## 5. 渲染与交互问题

### 5.1 焦点丢失／受控输入抖动

**框架侧已专项处理（现行 `setControlledValue`）：**

- IME `compositionstart/end` 期间 **跳过回写**；
- `value` 统一转 string 再比较，避免 number／string 不等导致每次赋值丢选区；
- 焦点时尽量 `setSelectionRange` 恢复选区；
- jsx-runtime 对函数 props **先求值再 `setProperty`**，避免双重 `createRenderEffect` 与 batch 打架。

**仍可能出现的问题多在使用层：**

- 组件函数因错误订阅被整段重跑，DOM 被卸挂（ui-view `PullRefresh` 等注释已记录「整段根树替换」）；
- `ref` 在 effect 重跑路径上可能先 `ref(null)` 再挂回同一节点——监听器若无防护会被拆掉；
- 在组件顶层同步读多个 Memo／Signal，把外层 insert effect 绑太宽。

→ **优化建议：** 文档化「组件只跑一次、更新走细粒度绑定」；可选 dev-only「多余订阅／整树替换」警告；**不必重写受控 value 核心路径**，除非新复现证明回归。

### 5.2 重复请求／多余 Effect

- **`createResource`：** source 变化会重载；`loadGeneration` 防旧请求写回；**不会取消 in-flight HTTP**（无 AbortSignal）。快速切页可能产生多余网络。
- 文档已警告：勿在父组件 return 里直接 `user()` 导致整组件重跑、**重复 createResource**。
- Suspense／ErrorBoundary 重建后需再次 `ensureSuspenseRegistration`（已实现）。

→ **P1 加法：** Resource 可选 `AbortSignal`；应用层请求去重；**不要**在无证据时改 Effect 默认微任务语义。

### 5.3 事件冒泡／浮层关窗

- view：**事件委托**挂在 document，并用 Proxy 修正 `currentTarget`（Shadow／受控 input 正确性）；提供 `Portal`／`createPortal`。
- **列设置浮层点击即关**一类问题落在 **ui-view `Dropdown`**（`closeOnOverlayClick`、浮层内 stopPropagation）——DataPanel 列设置已按此修；属组件库交互，**非 view 内核缺陷**。
- 若 Portal 内容与外侧 click-away 时序竞态，应在组件层用「冒泡阶段 + 延迟关闭／标记」处理（Dropdown 已有实践）。

### 5.4 其它交互／渲染

| 现象 | 更可能层级 | 备注 |
|------|------------|------|
| 大列表卡顿 | ui-view 虚拟列表 + For key | 勿进 view 核心 |
| 水合错位静默继续 | view `mismatchMode` 默认 `continue` | 产品化时可改严（3.0 候选） |
| Dialog 文档页偶发失败 | ui-view／测试时序 | 本轮 view 分析不展开修 |
| Context 函数 value 被执行 | view `useContext` 语义 | 组件应用对象包装（MobilePortalHostScope 已这样规避） |

---

## 6. 优化机会优先级（P0／P1／P2）

### P0（高杠杆或低成本高指导；建议用户确认后开工）

| ID | 项 | 预期收益 | 工作量 | 风险 |
|----|----|----------|--------|------|
| P0-1 | **真实业务 Profiling + `signal`／`For`／`insert` bench 入 CI** | 指导改哪里、防回退 | 低–中 | 低 |
| P0-2 | **examples／dweb 主入口 bundle analyze + 体积预算** | 量化 barrel 成本 | 低–中 | 低 |
| P0-3 | **编译器：静态子树覆盖率指标 + golden（少多余 Effect）** | 性能与表单稳定性上限 | 高 | 中（需强测） |
| P0-4 | **文档：子路径默认示例 + 组件作者指南（Memo／ref／订阅边界）** | 减少 ui-view／业务重复坑 | 低 | 低 |

### P1（中投入，产品或包体收益明显）

| ID | 项 | 预期收益 | 工作量 | 风险 |
|----|----|----------|--------|------|
| P1-1 | **主入口弃用预告 → 3.0 瘦身（策略 A）** | 默认包体 | 中（迁移） | 中；需 codemod |
| P1-2 | **水合：生产默认更严／分片恢复；渐进水合试点** | Hybrid 质量 | 高 | 中–高 |
| P1-3 | **Resource：`AbortSignal` + 文档化去重** | 减重复请求 | 中 | 低（加法） |
| P1-4 | **Router 拆分 + SSR 同构加强** | 可维护／Hybrid | 中–高 | 中 |
| P1-5 | **Form：checkbox／select／schema 桥示例** | DX | 低–中 | 低 |
| P1-6 | **修订漂移文档／给 v1 analysis 加水印** | 决策质量 | 低 | 低 |

### P2（架构级或需产品证据）

| ID | 项 | 说明 |
|----|----|------|
| P2-1 | 统一 `batch` + `priority` | 独立 RFC |
| P2-2 | 时间分片／可中断更新 | 需主线程长阻塞实测 |
| P2-3 | 并发 SSR（每请求隔离 document） | 吞吐；成本高 |
| P2-4 | DevTools（Owner／订阅数，仅 DEV） | DX |
| P2-5 | 虚拟列表 | **放 ui-view，不放 view** |

---

## 7. 明确现在不要做的事

1. **无用户拍板／无迁移方案的 3.0 主入口破坏性瘦身。**
2. **无 profiling 的 `insert`／订阅链表大重构。**
3. **默认开启时间分片或 React lanes 式可中断渲染。**
4. **把虚拟列表、业务 DataPanel、图标库拆包装进 view 核心。**
5. **恢复 Vue 式指令为主路径**（与现行控制流分叉，维护成本翻倍）。
6. **为「对齐 Solid」而引入 VDOM。**
7. **放宽／跳过测试断言来「修」偶发失败**（与项目纪律冲突；且属测试／ui-view 议题）。
8. **在本分析任务中改产品代码或跑全量测试**（已遵守）。

---

## 8. 建议决策（给用户／经理）

**可以深入优化，但应分期：**

1. **立刻（2.2.x 加法、低风险）：** P0-1／P0-2／P0-4／P1-6；Resource Abort 可排。  
2. **下一主题迭代：** P0-3 编译器主线；与 dweb Hybrid 绑定的水合（P1-2）。  
3. **大版本：** 按 `3.0.0-规划分析.md` 在文档预热子路径后，再做主入口瘦身。  
4. **ui-view 暂停项**（列设置收尾验证、Dialog 偶发、深色对比度、图标 flags 外置等）与 view 内核优化 **分开排期**，避免混改。

---

## 9. 源码与文档索引

| 主题 | 路径 |
|------|------|
| 主入口 | `view/src/mod.ts` |
| Signal／Effect／Owner | `view/src/reactivity/*` |
| insert／props／水合／SSR | `view/src/runtime/*` |
| For LIS | `view/src/runtime/control-flow.ts` |
| Resource／Form／Router | `view/src/integrations/*` |
| 安全转义 | `view/src/utils/escape.ts`、`analysis/SECURITY.md` |
| 3.0 规划 | `view/analysis/3.0.0-规划分析.md` |
| 2026-07 全面优化文 | `view/analysis/全面分析-优化空间.md` |
| 图标（ui-view） | `/workspace/icon-bundle-analysis.md` |

---

## 10. 修订说明

- 本文综合 **2026-11-03** 现行 v2.2.0 源码与既有 analysis；若与 2026-07 旧文冲突，**以源码 + 本文为准**。
- 未执行全量 `deno task test`／未改任何业务文件；优先级表供拍板，不视为已排期开工。
