# CSR / Hybrid 外部调用分析与优化建议

## 一、现状简述

- **SSR / SSG**：外部框架只需调用 `renderToString(fn)` 或
  `renderToStream(fn)`，拿到 HTML 或流，再拼进自己的 HTML
  模板即可，**对接简单**。
- **CSR / Hybrid**：需要区分入口、自己取容器、调用不同 API（`render` vs
  `hydrate`），且 Hybrid 还要协调服务端与客户端两套逻辑，**对接相对麻烦**。

下面从「外部框架如何调用」的角度归纳问题，并给出可落地的优化方向。

## 二、当前 CSR 的用法与痛点

### 2.1 当前用法

```ts
// 外部框架通常需要：
import { createRoot } from "jsr:@dreamer/view/csr"; // 或主入口
const container = document.getElementById("root")!;
createRoot(() => <App />, container);
container.removeAttribute("data-view-cloak");
```

或使用便捷方法：

```ts
import { render } from "jsr:@dreamer/view/csr";
render(() => <App />, document.getElementById("root")!);
```

### 2.2 痛点

| 痛点                      | 说明                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **入口选择**              | 必须知道用 `@dreamer/view/csr` 做纯客户端；用主入口会带上 SSR/hydrate 代码，体积更大。                                      |
| **容器必须自己取**        | API 只接受 `Element`，若框架习惯传选择器（如 `"#root"`），需要自行 `document.querySelector`，且要处理 null、重复挂载等。    |
| **cloak 需手动处理**      | 若 HTML 里写了 `data-view-cloak`，需在挂载后自己 `removeAttribute`，否则要依赖全局样式。                                    |
| **与 React 等习惯不一致** | 常见习惯是 `createRoot(container).render(<App />)` 或 `mount("#root", App)`，当前是 `render(fn, container)`，需要适配一层。 |

---

## 三、当前 Hybrid 的用法与痛点

### 3.1 当前用法

**服务端（框架侧）：**

```ts
import { generateHydrationScript, renderToString } from "jsr:@dreamer/view";
const html = renderToString(() => <App />);
const scripts = generateHydrationScript({
  scriptSrc: "/client.js",
  dataKey: "__VIEW_DATA__",
});
// 拼进 HTML：<div id="root">${html}</div> + scripts
```

**客户端（框架侧）：**

```ts
import { hydrate } from "jsr:@dreamer/view/hybrid";
const container = document.getElementById("root")!;
hydrate(() => <App />, container);
```

### 3.2 痛点

| 痛点                     | 说明                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **双入口、双构建**       | 服务端用主包（或 stream），客户端必须用 `@dreamer/view/hybrid`，框架要配置两套入口、两个 chunk，心智和构建都更重。                                                            |
| **CSR vs Hybrid 要分支** | 同一套前端代码，若既要支持「纯 CSR」又要支持「先 SSR 再激活」，需在客户端根据「是否有服务端 HTML」分支：有则 `hydrate`，无则 `render`。框架若自己实现这套逻辑，容易漏或写错。 |
| **容器与结构约定**       | 必须保证服务端输出的 DOM 和客户端的 `container` 一致（例如都是 `<div id="root">...</div>`），且客户端拿到的就是该根节点，否则 hydrate 行为可能错乱。                          |
| **dataKey 等约定**       | `generateHydrationScript` 的 `dataKey`、`scriptSrc` 需与客户端约定一致，没有统一「客户端取初始数据」的 API 时，框架容易各写各的。                                             |
| **无「一键激活」**       | 没有类似「传一个 selector + 根组件，自动判断是 hydrate 还是 render」的单一 API，框架要自己判断并调用不同方法。                                                                |

---

## 四、优化方向建议

### 4.1 统一挂载 API：`mount(container, fn, options?)`

在 **csr** 和 **hybrid** 两个入口都提供同一个高层
API，减少外部框架的分支和心智负担。

- **csr**：`mount(container, fn, options?)` 内部等价于 `render(fn, container)` +
  可选 cloak 清理。
- **hybrid**：`mount(container, fn, options?)` 内部：
  - 若 `container` 已有子节点 → 视为服务端已渲染，调用
    `hydrate(fn, container)`；
  - 否则 → 调用 `render(fn, container)`。

这样外部框架在「纯 CSR」和「Hybrid 客户端」两种场景下都可以只调 `mount`，由 view
内部决定是 render 还是 hydrate。

**签名建议：**

```ts
// container 支持 Element | string（选择器）
// 返回 Root，便于 unmount / 生命周期
function mount(
  container: Element | string,
  rootFn: () => VNode,
  options?: { removeCloak?: boolean },
): Root;
```

- `container` 为 string 时内部
  `document.querySelector(container)`，找不到可抛错或返回 noop Root（可配置）。
- `removeCloak` 默认 `true`，在挂载/激活后移除容器及其子树上的
  `data-view-cloak`。

这样外部框架只需：

- CSR：`import { mount } from "jsr:@dreamer/view/csr"; mount("#root", () => <App />);`
- Hybrid
  客户端：`import { mount } from "jsr:@dreamer/view/hybrid"; mount("#root", () => <App />);`\
  无需再判断「有没服务端 HTML」再选 render/hydrate。

### 4.2 选择器与容器解析

- 在 `mount`（以及可选地在 `render` / `hydrate`）中支持 **string 选择器**（如
  `"#root"`），内部转为 `Element`。
- 约定：若传入 string 且查不到元素，可：
  - 抛出一个明确错误（推荐），或
  - 返回一个 noop Root（`unmount`
    为空），并在文档中说明，便于框架做降级或错误上报。

这样框架不必在每个调用点写
`document.getElementById("root")!`，也更易做单测（例如可 mock
`document.querySelector`）。

### 4.3 Hybrid 客户端「初始数据」小工具（可选）

- 服务端用 `generateHydrationScript({ data, dataKey })` 注入 `window[dataKey]`。
- 在 **hybrid** 入口提供
  `getHydrationData<T>(dataKey?: string): T | undefined`，内部读
  `globalThis[dataKey ?? KEY_VIEW_DATA]` 并反序列化（若为 JSON 字符串则
  `JSON.parse`），方便客户端统一取数，减少框架自己拼 `window.__VIEW_DATA__`
  的差异和错误。

### 4.4 文档与示例

- 在 **README / 文档**中单独开一节「外部框架集成」：
  - **CSR**：推荐用 `@dreamer/view/csr` +
    `mount("#root", () => <App />)`，并说明与主入口的体积差异。
  - **Hybrid**：服务端 `renderToString` + `generateHydrationScript`，客户端仅需
    `@dreamer/view/hybrid` 的 `mount("#root", () => <App />)`；说明
    `dataKey`、容器结构、以及可选 `getHydrationData` 的用法。
- 若提供「最小可运行」的 CSR 与 Hybrid 示例（含 HTML 壳 +
  单入口脚本），更利于框架作者直接拷贝和改。

### 4.5 保持现有 API 不变

- `createRoot`、`render`、`hydrate` 保持现有签名与行为不变，仅作为底层能力。
- `mount` 作为推荐给外部使用的上层 API，内部调用现有 `render` /
  `hydrate`，这样不破坏现有用户，又能简化对接。

---

## 五、实现优先级建议

| 优先级 | 项                                                                                                      | 说明                                                     |
| ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P0     | 在 csr / hybrid 中实现 `mount(container, fn, options?)`，支持选择器与「有子节点则 hydrate 否则 render」 | 一步到位减少框架分支和心智负担。                         |
| P1     | 选择器解析（string → Element）+ 查不到时的明确错误或 noop 行为                                          | 与 P0 一起做即可，改动小。                               |
| P2     | 文档「外部框架集成」+ CSR/Hybrid 最小示例                                                               | 降低接入成本。                                           |
| P3     | `getHydrationData`（hybrid）                                                                            | 方便需要「服务端传初始数据」的 Hybrid 场景，可按需实现。 |

---

## 六、外部 Router 集成（细粒度渲染与整树重跑）

### 6.1 问题

View 与 React/Preact 不同：**View 是细粒度更新**（类似 Dweb），根 effect
只在**其依赖的 signal 变化**时重跑。当宿主框架**使用自己的 Router**（不用 View
的 router）时，路由状态在 View 外维护，根 effect
不会重跑，**页面主体可能不重新渲染**。

### 6.2 建议方案

若外部 Router 能把「当前路由」同步到 View 的 signal（如 `getRoute()`），使用
**`createReactiveRoot(container, getRoute, (route) => <App route={route} />)`**，
状态变化时自动 patch，无需额外 API。

若无法将路由同步到 signal，可在路由变更后调用 **`root.forceRender()`** 强制根
effect 重新执行一次，实现整树重算。`createRoot` / `render` 返回的 `Root` 上提供
`forceRender` 方法，专用于此类「由外部驱动、需手动触发重跑」的场景。

---

## 七、小结

- **SSR/SSG** 已较友好，维持现状即可。
- **CSR/Hybrid** 可通过「统一 mount API + 选择器 + 自动 render/hydrate
  判断」显著简化外部调用；再辅以文档与可选
  `getHydrationData`，外部框架接入成本会明显降低，且无需改动现有底层 API。
- **外部 Router**：建议用 `createReactiveRoot` 并传入路由对应的 getter，由 View
  响应式更新页面主体；无法接入 signal 时可用 `root.forceRender()` 在路由变更后手动触发根重跑。
