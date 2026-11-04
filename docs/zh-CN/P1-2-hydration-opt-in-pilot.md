# P1-2：水合质量 opt-in 试点（`mismatchMode` · 2.x 加法）

> **默认已由 3.0 取代：** `R1`／`R3` 起省略 `mismatchMode` 不再是 `continue` —
> 见 [`MIGRATION-3.0.md`](./MIGRATION-3.0.md)。本文保留 2.x opt-in 试点记录。
>
> **阅读注意（2026-11-05）：** 下文 §1–§4 表格／示例仍按 **2.x「默认
> continue」** 叙述（历史快照）。现行行为以 `resolveMismatchMode` 与
> [`MIGRATION-3.0.md`](./MIGRATION-3.0.md)／README §6.2 为准：省略 → **DEV
> `assert`／prod `remount`**；要 2.x 容忍须显式 `mismatchMode: "continue"`。

| 项       | 值                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 对象     | `@dreamer/view` **v2.2.0**，分支 `dev`                                                                                                                                                           |
| 性质     | **文档 + 可测轻量 opt-in**：写清 `mismatchMode` 三档与推荐用法；补默认仍为 `continue` 的回归测；examples `/runtime` 试点演示                                                                     |
| **不做** | 改生产默认 `mismatchMode`（仍须 **`continue`**）；删 API；渐进／分片水合运行时落地（本仓库**尚无**分片钩子）；3.0 改严默认；JSR／npm；放宽 `size`／`consumer-bundle` 基线                        |
| 代码触点 | `src/csr.ts`（加法导出 `HydrationMismatchMode`／`resolveMismatchMode`）；`tests/unit/runtime/hydration.test.ts`；`examples/src/views/runtime/index.tsx`                                          |
| 相关     | [`view-framework-analysis.md`](./view-framework-analysis.md) · [`3.0.0-规划分析.md`](./3.0.0-规划分析.md) · [`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md) |
| EN       | [`../en-US/P1-2-hydration-opt-in-pilot.md`](../en-US/P1-2-hydration-opt-in-pilot.md)                                                                                                             |

---

## 1. API 现状（已存在 · 本刀不改默认）

`hydrate(fn, container, bindingsOrOptions)` 第三参可为：

1. 历史形态：`[number[], string][]` 绑定表；或
2. **`HydrateOptions` 对象**（加法）：

| 字段                                   | 含义                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `bindings`                             | 编译器绑定表；等价于第三参数组                                           |
| `mismatchMode`                         | `"continue"`（**默认**）／`"assert"`／`"remount"`                        |
| `warnMismatch`                         | 绑定失败是否 `console.warn`；默认跟 `VIEW_DEV`                           |
| `onMismatch`                           | 每条 mismatch 回调（可上报）                                             |
| `assertMismatch` / `remountOnMismatch` | **已弃用**布尔别名；与 `mismatchMode` 同时存在时 **`mismatchMode` 优先** |

解析入口：`resolveMismatchMode(options)`（`/csr`
与主入口均可取）。诊断：`getHydrationMismatches()`。

实现：`src/runtime/hydration.ts` + `src/runtime/browser.ts` 的 `hydrate`。

---

## 2. 三档语义与推荐用法

| 模式                   | 行为                                                                           | 推荐场景                                        |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| **`continue`（默认）** | 记录 mismatch，缺失绑定走客户端新建；**不中断**；`hydrate` 保留容器内 SSR 节点 | 生产 hybrid／容忍轻微错位；**2.x 生产默认勿改** |
| **`assert`**           | 有 mismatch 时 **抛错**（`internalHydrate`／`hydrate`）                        | CI、本地严格门、金丝雀；**显式**传入            |
| **`remount`**          | 有 mismatch 时放弃绑定表，**清空容器**后按 CSR `mount` 语义重挂                | 宁可闪一下也不要半残 DOM；**显式**传入          |

### 推荐写法（opt-in）

```ts
import { hydrate } from "@dreamer/view/csr";
// 或：import { hydrate, type HydrationMismatchMode } from "@dreamer/view/csr";

// 生产默认：省略 mismatchMode ≡ continue（本刀保证不改）
hydrate(() => <App />, root, { bindings });

// CI / 严格：
hydrate(() => <App />, root, {
  bindings,
  mismatchMode: "assert",
  warnMismatch: false,
});

// 错位则整树 CSR：
hydrate(() => <App />, root, { bindings, mismatchMode: "remount" });
```

**禁**：在 2.x 库内把默认改成 `assert`／`remount`（属 3.0 候选，见规划备忘
R1）。

---

## 3. 渐进／分片水合

框架分析与 3.0 备忘中的「渐进／路由级 hydrate」仍是
**产品方向**，**当前运行时没有**独立的分片／渐进水合钩子（无
`hydrateIsland`／调度分片 API）。

本刀因此：

- **不**伪造未实现的分片 API；
- 以 **`mismatchMode` 显式 opt-in** + examples `/runtime` 演示 + 单测锁默认
  `continue` 作为可测试点；
- 分片水合另开刀（与 dweb Hybrid 黄金路径绑定后再做）。

---

## 4. 本刀约定

| 项                                          | 约定                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| 默认 `resolveMismatchMode(undefined)`／`{}` | 必须为 **`continue`**（单测锁死）                                           |
| `/csr` 导出                                 | 加法导出类型 `HydrationMismatchMode` 与 `resolveMismatchMode`；既有符号不变 |
| 基线闸                                      | **不**改 `bundle-size-baseline.json`／`consumer-bundle-baseline.json`       |
| 发布                                        | 禁 JSR／npm                                                                 |

验证：Deno 全测 + 仓库惯例 Bun／Node／`size:check`／`consumer:bundle:check`。

---

## 5. 相关

- README §六／§6.2（根／zh／en）
- 变更：[`CHANGELOG.md`](./CHANGELOG.md)
- 3.0 改严默认备忘：[`3.0.0-规划分析.md`](./3.0.0-规划分析.md) R1
