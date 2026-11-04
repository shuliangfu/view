# P1-1：主入口 barrel 弃用预告（策略 A · 2.x 加法）

| 项 | 值 |
|----|-----|
| 对象 | `@dreamer/view` **v2.2.0**，分支 `dev` |
| 性质 | **弃用预告／文档**：写清子路径优先与迁移；主入口加模块级 JSDoc `@deprecated` |
| **不做** | 删除任何 export；改运行时默认行为／语义；3.0 瘦身落地；JSR／npm 发布；放宽 `bundle-size-baseline.json`／`consumer-bundle` 基线 |
| 代码触点 | `src/mod.ts`（仅 JSDoc；**无**运行时 `warn`／副作用） |
| 相关度量 | [`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md) · [`P0-基线-体积与性能.md`](./P0-基线-体积与性能.md) |
| EN | [`../en-US/P1-1-main-entry-deprecation-preview.md`](../en-US/P1-1-main-entry-deprecation-preview.md) |

---

## 1. 为何做「弃用预告」而不是立刻删 barrel

2.x **策略 A**：主入口 `@dreamer/view`（`src/mod.ts`）继续 **完整 re-export**，行为与导出面不变，旧应用／一行演示仍可用。

同时明确：**新代码与生产应用默认走子路径**。原因来自 P0／P0-2 度量，而不是口味偏好：

1. **库入口图**（`deno task size:check`）：主入口 minify 约 **43.5 KiB**，`/reactivity` 约 **10.5 KiB**（约 **4.2×**）。
2. **消费方 `export *`／namespace**（P0-2 `consumer:bundle:check`）：`export * from "@dreamer/view"` 相对只需要 reactivity 却走主入口，minify 溢价约 **+34.1 KiB（~4.26×）**／gzip 约 **+11.9 KiB**。
3. **具名导入**在强摇树（esbuild + `sideEffects: false`）下 barrel vs 子路径 minify **Δ≈0**；子路径仍更稳——模块图更小、意图清晰，弱摇树或应用再包一层 `export *` 时有保护。
4. **examples** 已全面子路径化（如 `examples/src/main.tsx` → `@dreamer/view/router`）；P2 起路由 codegen／hydrate 脚本亦走子路径（见 [`P2-examples-subpath-dogfood.md`](./P2-examples-subpath-dogfood.md)）。

本刀是 **预告与迁移指引**：**不**等于 3.0 已删主入口。3.0 是否瘦身／拆默认面见 [`3.0.0-规划分析.md`](./3.0.0-规划分析.md)，须另开产品拍板。

---

## 2. 主入口与子路径现状（对照 `deno.json` `exports`）

| 导入路径 | 文件 | 典型用途 |
|----------|------|----------|
| `@dreamer/view` | `src/mod.ts` | **便捷全家桶**（2.x 仍完整兼容；本刀起模块级 `@deprecated` 预告） |
| `@dreamer/view/reactivity` | `src/reactivity/mod.ts` | Signal／Effect／Memo／Owner／Store／Context |
| `@dreamer/view/csr` | `src/csr.ts` | CSR 聚合：signal + mount／hydrate + 控制流 + Suspense |
| `@dreamer/view/router` | `src/router.ts` | `createRouter`／`Link`／`mountWithRouter` 等 |
| `@dreamer/view/form` | `src/form.ts` | `createForm` |
| `@dreamer/view/resource` | `src/resource.ts` | `createResource` |
| `@dreamer/view/control-flow` | `src/control-flow.ts` | `Show`／`For`／`Switch`／`ErrorBoundary` 等 |
| `@dreamer/view/scheduler` | `src/scheduler/mod.ts` | `batch`／优先级调度 |
| `@dreamer/view/ssr` | `src/runtime/server.ts` | `renderToString`／流式／水合脚本（**勿**从主入口指望 SSR） |
| `@dreamer/view/types` | `src/types.ts` | 公共类型 |
| `@dreamer/view/jsx-runtime` | `src/jsx-runtime.ts` | JSX 自动运行时 |
| 其他 | `compiler`／`optimize`／`portal`／`cli`／`setup` | 工具链／可选拆分 |

完整表见 README「安装／exports」。

---

## 3. 推荐迁移步骤

1. **盘点**应用中 `from "@dreamer/view"`／`from "jsr:@dreamer/view"`（及本地 `export * from "@dreamer/view"` 包装）。
2. **按符号改子路径**（可分批，运行时语义不变）：
   - 仅 Signal／Effect／Memo／Store → `/reactivity`
   - `mount`／`hydrate`／`For`／`Show`／Suspense 的小型 CSR → `/csr`
   - 路由 → `/router`；表单 → `/form`；Resource → `/resource`
   - SSR → **必须** `/ssr`（主入口本就不带 happy-dom／`node:*`）
3. **禁止**应用内再包一层 `export * from "@dreamer/view"` 或 `import * as View from "@dreamer/view"` 当「自家 barrel」——这是 P0-2 测到的真实全家桶溢价场景。
4. **验证体积**（可选）：`deno task consumer:bundle:check`／`deno task size:check`；对比迁移前后 minify／gzip。
5. **IDE**：打开主入口时可能看到模块 `@deprecated` 提示；**不**改变运行时，也**不**删除符号。

### 迁移示例

```ts
// 前（兼容，但拉起全家桶图／易被再 export *）
import { createSignal, createRouter, mountWithRouter } from "@dreamer/view";

// 后（推荐）
import { createSignal } from "@dreamer/view/reactivity";
import { createRouter, mountWithRouter } from "@dreamer/view/router";
// 或小型 CSR：
// import { createSignal, mount, For } from "@dreamer/view/csr";
```

---

## 4. 本刀对代码的约定

| 项 | 约定 |
|----|------|
| `src/mod.ts` exports | **全部保留**；无改 re-export 列表 |
| 运行时 | **无** `console.warn`／环境探测副作用（避免测例／SSR／静默环境噪音） |
| JSDoc | 模块级 `@deprecated` + 指向本文与子路径；说明 2.x 仍完整兼容 |
| 基线闸 | **不**改 `bundle-size-baseline.json`／`consumer-bundle-baseline.json` 数字 |

如何验证：**本地全测绿**（Deno unit+integration；仓库惯例另跑 Bun／Node／`size:check`／`consumer:bundle:check`）即证明无运行时回归。

---

## 5. 相关

- P0-2 消费方数字：[`P0-2-consumer-bundle-analyze.md`](./P0-2-consumer-bundle-analyze.md)
- 库入口体积：[`P0-基线-体积与性能.md`](./P0-基线-体积与性能.md)
- 组件作者（含轻触子路径）：[`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md)
- 3.0 规划备忘（非本刀落地）：[`3.0.0-规划分析.md`](./3.0.0-规划分析.md)
- README 安装／便捷全家桶小节；变更：[`CHANGELOG.md`](./CHANGELOG.md)
