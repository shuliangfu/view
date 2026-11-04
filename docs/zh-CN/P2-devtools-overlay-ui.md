# P2：DEV 浮动 DevTools 面板（对齐 Next 指示器）

| 项 | 值 |
|----|-----|
| 性质 | **加法 DX**：浮动指示器＋多 tab 探查面板 |
| 包 | `@dreamer/view` **3.0.0**（`dev`；overlay 始于 2.2） |
| 入口 | **仅** `@dreamer/view/devtools/overlay` |
| 基线 | **不**抬 `size:check`／`consumer:bundle:check` |
| 禁止 | JSR／npm；生产自动挂载；改内核；动 ui-view／dweb-admin／xlang |
| EN | [`../en-US/P2-devtools-overlay-ui.md`](../en-US/P2-devtools-overlay-ui.md) |

---

## 能力

| Tab | 内容 |
|-----|------|
| **Overview** | effects／memos／nodes／上游边＋健康度＋Top Sources。**3.0：** 随路由刷新为当前页快照（`popstate`＋history push／replace）；页面级，非整应用累计 |
| **Tree** | 可展开 Owner 树（`inspectOwnerIndexed` path）、过滤、选中看详情（含 DOM 数量）。**点击**节点：树行选中态，并在页面上勾出该 Owner 的 DOM 轮廓 |
| **Signals** | registry Source 列表＋搜索过滤 |
| **Warnings** | 过订阅／remount／`component-rerun`；工具栏**清空**；**点击**跳到 Tree 对应 path |
| **Settings** | 角落、刷新间隔、快捷键说明、复位位置／清空警告 |

**加分：** `⌘/Ctrl+Shift+D` 开合、`Esc` 关闭、拖拽角标／标题、贴边吸附、`localStorage` 记忆。

## 生产绝不出

- 独立子路径（不进 size／consumer 测量）
- 非 `VIEW_DEV`：`mountDevtoolsOverlay()`→`null`、不建 DOM
- 框架不自动挂；examples 仅 `if (VIEW_DEV)`

## 点击高亮

`VIEW_DEV` 下，`createRootTracked`（以及 `mountDevtoolsOverlay`）会在被跟踪的
渲染**之前**安装 `globalThis.__DREAMER_OWNER_DOM__`。`jsx()` 把宿主元素记在
**调用 `jsx()` 时**的 Owner（组件）上，而不是稍后执行 thunk 的 Effect。
面板不往应用节点上写属性。轮廓是面板下方的 `pointer-events: none` 层
（`data-dreamer-view-inspect`）；关闭面板即隐藏，卸载时移除。没有已连接 DOM
的 Owner（例如纯 effect）仍保持树行选中，并提示「没有已连接的 DOM」。

`installOwnerDomTracking`／`collectOwnerDomElements` 在 `@dreamer/view/devtools`。
不引用 `src/i18n.ts`。

## 演示

`examples/src/main.tsx`（`examples` 下 `deno task dev`）。
打开角标 →「树」→ 点击节点：该行保持选中，蓝色矩形罩住对应 DOM。滚动或缩放会重算位置。

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
