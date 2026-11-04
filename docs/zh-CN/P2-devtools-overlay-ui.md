# P2：DEV 浮动 DevTools 面板（对齐 Next 指示器）

| 项 | 值 |
|----|-----|
| 性质 | **加法 DX**：本地开发浮动指示器＋面板 |
| 包 | `@dreamer/view` **v2.2.0**（`dev`） |
| 入口 | **仅** `@dreamer/view/devtools/overlay`（不进主 barrel／`/reactivity`／`/devtools`） |
| 基线 | **不**改／抬高 `size:check`／`consumer:bundle:check` 数字 |
| 禁止 | JSR／npm；生产自动挂载；推倒响应式内核；动 ui-view／dweb-admin／xlang |
| EN | [`../en-US/P2-devtools-overlay-ui.md`](../en-US/P2-devtools-overlay-ui.md) |

---

## 1. 目标

对齐 **Next.js Dev 指示器／面板** 的层次：

- 收起：圆形 **V** 角标（默认左下）
- 展开：暗色毛玻璃面板，分区 **Overview／Warnings／Sources**
- 关闭：**✕** 或 **Esc**；**Refresh** 重扫

复用 `@dreamer/view/devtools` API；无浏览器扩展。

## 2. 生产绝不出

| 机制 | 行为 |
|------|------|
| 独立子路径 | 不进 size／consumer-bundle 测量入口 |
| `VIEW_DEV` 门闸 | 非 DEV 时 `mountDevtoolsOverlay()` 返回 `null` 且 **不建 DOM** |
| 显式 opt-in | 框架**从不**自动挂；examples／脚手架在 `if (VIEW_DEV)` 下调用 |
| 开发服注入 | `view dev` 注入 `VIEW_DEV`；`build`／`start` 不注入 |

## 3. 用法

```ts
import { mountDevtoolsOverlay } from "@dreamer/view/devtools/overlay";

const overlay = mountDevtoolsOverlay({ corner: "bottom-left" });
overlay?.open();
```

演示：`examples/src/main.tsx` 在 `VIEW_DEV` 为真时挂载（`examples` 下 `deno task dev`）。

## 4. 美观自检

| 态 | 表现 |
|----|------|
| 默认 | 42px 毛玻璃圆钮、蓝色 V、绿色状态点 |
| 展开 | ~380px 面板、分区标题、等宽数字、等宽 Source 行 |
| 关闭 | 面板 ✕ 与 Esc |

## 5. 验收

- `deno test -A tests`（含 E2E）绿
- size／consumer-bundle 绿且**未**改基线
- CI 含 `e2e-examples` 全绿
