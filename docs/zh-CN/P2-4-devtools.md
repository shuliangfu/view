# P2-4：DEV-only DevTools（Owner 树／订阅数）

| 项   | 值                                                                              |
| ---- | ------------------------------------------------------------------------------- |
| 性质 | **加法 DX**：观察 Owner 树与订阅边计数                                          |
| 包   | `@dreamer/view` **3.0.0**（`dev`；始于 2.2）                                    |
| 入口 | **仅** `@dreamer/view/devtools`（不进主 barrel／`/reactivity`）                 |
| 基线 | 本刀本身**不**抬测量门；后续 3.0 战役 DX 可另刷基线                             |
| 禁止 | JSR／npm 发布；浏览器扩展／UI 壳；推倒响应式内核；动 ui-view／dweb-admin／xlang |
| EN   | [`../en-US/P2-4-devtools.md`](../en-US/P2-4-devtools.md)                        |

---

## 1. 目标

开发期排查 **根泄漏** 与 **过度订阅**：

- 遍历／汇总 **Owner** 子树（effect／memo／disposables／深度）
- 统计 **订阅边**（Observer 上游、Source／Signal 下游）
- 可选根登记＋ registry Source 快照

## 2. 生产零开销

| 机制             | 生产行为                                                            |
| ---------------- | ------------------------------------------------------------------- |
| 独立子路径       | 未 import `/devtools` 的应用不会把它打进 size／consumer 测量入口    |
| **无热路径挂钩** | `createSignal`／`createRoot` **未改**；响应式内核无 WeakMap／根 Set |
| 探针计数         | `getSignalObserverCount` 临时挂探针 Observer，计数后清理            |
| 可选根跟踪       | `trackRoot`／`createRootTracked` 仅存在于 `/devtools`               |

**不要**在生产应用入口 import `/devtools`。

## 3. API（短）

```ts
import {
  createRootTracked,
  getSignalObserverCount,
  getTrackedRoots,
  summarizeOwnerTree,
} from "@dreamer/view/devtools";
import { createEffect, createSignal, getOwner } from "@dreamer/view/reactivity";

createRootTracked((dispose) => {
  const n = createSignal(0);
  createEffect(() => n());
  console.log(getSignalObserverCount(n)); // 1
  console.log(summarizeOwnerTree(getOwner()));
  dispose();
});
```

| API                                             | 说明                                        |
| ----------------------------------------------- | ------------------------------------------- |
| `inspectOwner`／`summarizeOwnerTree`            | 需持有 `Owner`（根内 `getOwner()`）         |
| `trackRoot`／`untrackRoot`／`createRootTracked` | 可选根列表，便于排泄漏                      |
| `getSignalObserverCount`                        | 探针 Observer——不改 `createSignal`          |
| `snapshotRegistrySources`                       | 具名 Source 始终可列；`VIEW_DEV` 下另含匿名 |
| `isViewDev`／`requireViewDev`                   | 镜像／断言 `globalThis.VIEW_DEV`            |

## 3b. 后续：过订阅警告

§5.1 显式 opt-in
警告同属本子路径：[`P2-dev-warn-oversubscribe.md`](./P2-dev-warn-oversubscribe.md)。

## 4. 不在范围

- 浏览器扩展或网络协议（浮动面板见
  [P2-devtools-overlay-ui.md](./P2-devtools-overlay-ui.md)）
- 改默认运行时语义／订阅链表实现
- 抬高 size／consumer-bundle 基线 JSON

## 5. 验收

- `deno test -A tests`（含 E2E）绿
- `deno task size:check`＋`deno task consumer:bundle:check`
  绿且**未**改写基线数字
- CI 全绿（含 `e2e-examples`）
