# P2：DEV 浮动 DevTools 面板（对齐 Next 指示器）

| 项 | 值 |
|----|-----|
| 性质 | **加法 DX**：浮动指示器＋多 tab 探查面板 |
| 包 | `@dreamer/view` **v2.2.0**（`dev`） |
| 入口 | **仅** `@dreamer/view/devtools/overlay` |
| 基线 | **不**抬 `size:check`／`consumer:bundle:check` |
| 禁止 | JSR／npm；生产自动挂载；改内核；动 ui-view／dweb-admin／xlang |
| EN | [`../en-US/P2-devtools-overlay-ui.md`](../en-US/P2-devtools-overlay-ui.md) |

---

## 能力

| Tab | 内容 |
|-----|------|
| **Overview** | effects／memos／nodes／上游边＋健康度＋Top Sources |
| **Tree** | 可展开 Owner 树（`inspectOwnerIndexed` path）、过滤、选中看详情 |
| **Signals** | registry Source 列表＋搜索过滤 |
| **Warnings** | 过订阅／remount；**点击**跳到 Tree 对应 path |
| **Settings** | 角落、刷新间隔、快捷键说明、复位位置／清空警告 |

**加分：** `⌘/Ctrl+Shift+D` 开合、`Esc` 关闭、拖拽角标／标题、贴边吸附、`localStorage` 记忆。

## 生产绝不出

- 独立子路径（不进 size／consumer 测量）
- 非 `VIEW_DEV`：`mountDevtoolsOverlay()`→`null`、不建 DOM
- 框架不自动挂；examples 仅 `if (VIEW_DEV)`

## 演示

`examples/src/main.tsx`（`examples` 下 `deno task dev`）。

## 验收

- `deno test -A tests`（含 E2E）绿
- size／consumer-bundle 绿且未改基线
- CI 含 `e2e-examples` 全绿

## 多语言（中／英，浏览器安全）

面板文案跟**页面当前语言**（`html[lang]`／`document.documentElement.lang`），经
`overlay-l10n.ts` + `devtools/locales/{en,zh}.json`。**无**语言切换 UI。**不**
import `src/i18n.ts`（避免 `node:*` 进浏览器包）。仍仅 `VIEW_DEV`。

## HMR

有 `@dreamer/server` DEV HMR 时：overlay `claimUi` 藏独立胶囊，Overview → HMR 展示状态；无桥则降级。生产绝不出。
