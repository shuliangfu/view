# P2：DEV-only 过订阅／卸挂再挂警告（§5.1）

| 项 | 值 |
|------|-------|
| 性质 | **加法 DX**：显式 opt-in 警告——过宽 Effect 订阅／整树卸挂再挂 |
| 包 | `@dreamer/view` **3.0.0**（`dev`；始于 2.2） |
| 入口 | **`@dreamer/view/devtools`**（扩展 P2-4；不进主 barrel／`/reactivity`） |
| 基线 | **不**改／抬 `size:check`／`consumer:bundle:check` 基线数字 |
| 禁止（开刀时） | 浏览器扩展／UI 壳；改 `createSignal`／`createRoot`／`insert` 默认；默认时间分片 |
| 注 | **3.0** 另刀已落地主入口瘦身＋更严水合；本 DX 亦增 `component-rerun`＋`setupKeys`（见 [`P1-view-rerun-fetch-guard.md`](./P1-view-rerun-fetch-guard.md)） |
| EN | [`../en-US/P2-dev-warn-oversubscribe.md`](../en-US/P2-dev-warn-oversubscribe.md) |
| 相关 | [`P2-4-devtools.md`](./P2-4-devtools.md)；分析 §5.1；[`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) |

---

## 1. 目标

帮助作者抓到会导致焦点丢失／受控输入抖动的误用（§5.1）：

- **wide-subscription** — Effect 上游边过多（常是组件壳整段重跑）
- **remount-churn** — 逻辑 key 短时多次 remount，或 Owner 子节点在两次轮询间被整批换掉。从小占位（路由 loading 壳；examples dogfood 为 path `0/0` 子树 5→整页）一次性胀到大页面是首屏，不是 churn。体积相近的整树重建仍会警告。
- **component-rerun**（**3.0**）— 同一逻辑 key 下 setup 体被再次 note（失焦／裸 `fetch`）；与运行时 setup `untrack` 配套。

## 2. 如何 opt-in

```ts
import {
  createRootTracked,
  detectOversubscribe,
  enableOversubscribeWarnings,
  noteRemount,
} from "@dreamer/view/devtools";
import { createEffect, createSignal, getOwner } from "@dreamer/view/reactivity";

globalThis.VIEW_DEV = true; // *发出*警告时需要

createRootTracked((dispose) => {
  const n = createSignal(0);
  createEffect(() => n());

  // 一次性检查（默认不 console；emit: true 才打）
  console.log(detectOversubscribe(getOwner(), { maxUpstream: 8 }));

  // 实时监视（需 VIEW_DEV）；用完 stop
  const stop = enableOversubscribeWarnings({
    owner: getOwner(),
    maxUpstream: 8,
    intervalMs: 500,
  });

  // 可选：应用层标记 remount（PullRefresh 壳、路由等）
  noteRemount("PullRefresh");

  stop();
  dispose();
});
```

| API | 说明 |
|-----|-------|
| `detectWideSubscriptions`／`detectOversubscribe` | 一次性；无 `VIEW_DEV` 也可检查；**emit** 需 `VIEW_DEV`＋`emit: true` |
| `noteRemount`／`detectRemountChurn` | 显式 remount key＋滑动窗口（默认 3 次／2000ms） |
| `detectOwnerRemountChurn` | 轮询友好：节点下子身份整批替换 |
| `enableOversubscribeWarnings`／`disableOversubscribeWarnings` | 显式 opt-in 轮询；**要求** `VIEW_DEV` |

默认：`maxUpstream = 8`，`maxRemounts = 3`，`remountWindowMs = 2000`。

## 3. 生产零开销

| 机制 | 行为 |
|------|------|
| 独立 `/devtools` 子路径 | size／consumer 测量入口不 import → 基线不变 |
| 无热路径挂钩 | `createSignal`／`createRoot`／`insert` 不动 |
| 显式 enable | 仅在调用 `enableOversubscribeWarnings` 后轮询 |
| emit 门禁 | `console.warn`／`onWarn` 需 `VIEW_DEV` |

**不要**在生产应用入口 import `/devtools`。

## 4. 范围外

- 浏览器扩展／浮层 UI
- 改默认运行时语义或抬基线 JSON
- P2-1／2／3；3.0 水合改严；主入口瘦身

## 5. 验收

- `deno test -A tests`（含 E2E）绿
- `deno task size:check`＋`deno task consumer:bundle:check` 绿且**不**改基线数字
- CI 全绿（含 `e2e-examples`）
