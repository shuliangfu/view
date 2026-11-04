# 迁移到 @dreamer/view 3.0

| 项       | 值                                                       |
| -------- | -------------------------------------------------------- |
| 自       | 2.2.x（策略 A 弃用预告）                                 |
| 至       | **3.0.0**（策略 A **落地** — 主入口瘦身）                |
| 状态     | 3.0 首刀已在 `dev` — **尚未发 JSR**                      |
| EN       | [`../en-US/MIGRATION-3.0.md`](../en-US/MIGRATION-3.0.md) |
| 规划备忘 | [`3.0.0-规划分析.md`](./3.0.0-规划分析.md)               |

---

## 1. 破坏点

### E1／E2 — 主入口不再 re-export 集成

`import { … } from "@dreamer/view"` **不再**提供：

| 符号（示例）                                                                                     | 改为                     |
| ------------------------------------------------------------------------------------------------ | ------------------------ |
| `createRouter`、`Link`、`mountWithRouter`、`matchRoute`、`parseRouterUrl`、`useRouter`、路由类型 | `@dreamer/view/router`   |
| `createForm`、`messageFromSafeParse` 等表单                                                      | `@dreamer/view/form`     |
| `createResource`、`createInflightDedupe`                                                         | `@dreamer/view/resource` |

### R1／R3 — 更严水合默认（已落地）

**破坏：** 省略 `mismatchMode` **不再**等于 `continue`。

| 环境                           | 省略 `mismatchMode` 时的默认         |
| ------------------------------ | ------------------------------------ |
| `globalThis.VIEW_DEV === true` | **`assert`**（绑定错位抛错）         |
| 生产（无 `VIEW_DEV`）          | **`remount`**（清空容器 → CSR 重挂） |

- 需要 2.x「容忍错位」→ **显式** `mismatchMode: "continue"`。
- 弃用布尔 **`assertMismatch`**／**`remountOnMismatch`** 已从 `HydrateOptions`
  **删除**。改用 `mismatchMode: "assert"`／`"remount"`。

```ts
import { hydrate } from "@dreamer/view/csr";

// 3.0 生产默认 ≡ 错位 remount
hydrate(() => <App />, root, { bindings });

// 回到 2.x 容忍：
hydrate(() => <App />, root, { bindings, mismatchMode: "continue" });

// CI／严格（亦为 VIEW_DEV 默认）：
hydrate(() => <App />, root, { bindings, mismatchMode: "assert" });
```

### 主入口仍保留（核心 CSR barrel）

响应式、调度、`mount`／`hydrate`、`insert`／props／`template`、控制流
（`Show`／`For`／…）、Suspense／`lazy`／`Dynamic`、portal、HMR。

SSR 仍 **仅** `@dreamer/view/ssr`（不变）。

### 其余候选（未进本刀）

| 候选                                                    | 状态                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R1 — 改严默认 `mismatchMode`                            | **已落地** — 省略 → `VIEW_DEV` 时 `assert`，否则 `remount`；要 2.x 容忍请显式 `continue` |
| R3 — 删除弃用布尔 `assertMismatch`／`remountOnMismatch` | **已落地** — 只用 `mismatchMode`                                                         |
| R2 — `For` 强制 key                                     | **HOLD**                                                                                 |
| 调度模型统一                                            | **HOLD**                                                                                 |

---

## 2. 迁移步骤

1. 盘点 `from "@dreamer/view"`／`from "jsr:@dreamer/view"`。
2. 将路由／表单／Resource 符号改到对应子路径（可分批）。
3. 新代码优先 `/reactivity` 或 `/csr`（即便主入口仍有同名符号）。
4. **禁止**应用内 `export * from "@dreamer/view"` 再包一层全家桶。
5. 可选：`deno task size:check`／`deno task consumer:bundle:check`。

### 前后对照

```ts
// 2.x
import {
  createForm,
  createResource,
  createRouter,
  createSignal,
} from "@dreamer/view";

// 3.0
import { createSignal } from "@dreamer/view"; // 或 /reactivity /csr
import { createRouter, mountWithRouter } from "@dreamer/view/router";
import { createForm } from "@dreamer/view/form";
import { createResource } from "@dreamer/view/resource";
```

---

## 3. 下游

下游（`dweb`／`ui-view`／`Render`／`dweb-admin` 等）**本战役不 bump**。
应用可继续用 JSR 上的 2.x，直到主动迁移且用户下令发 3.0 JSR。

---

## 4. 相关

- P1-1
  弃用预告（2.x）：[`P1-1-main-entry-deprecation-preview.md`](./P1-1-main-entry-deprecation-preview.md)
- P1-2 水合
  opt-in：[`P1-2-hydration-opt-in-pilot.md`](./P1-2-hydration-opt-in-pilot.md)
- 变更日志：[`CHANGELOG.md`](./CHANGELOG.md)
