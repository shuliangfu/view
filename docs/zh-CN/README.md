# @dreamer/view 中文文档

> **细粒度响应式视图库**：无虚拟 DOM，以 **Signal / Effect** 追踪依赖，通过
> **`insert`** 对真实 DOM 做最小更新。支持 **CSR、SSR、流式输出、水合**；内置
> **路由、异步 Resource、Store、表单、Context、Suspense / ErrorBoundary**
> 等能力。\
> **英文对照**（章节与本文一一对应）：**[docs/en-US/README.md](../en-US/README.md)**；仓库根
> **[README.md](../../README.md)** 为简版索引。

[English](../en-US/README.md) | 中文

[![JSR](https://jsr.io/badges/@dreamer/view)](https://jsr.io/@dreamer/view)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](../../LICENSE)
[![Tests](https://img.shields.io/badge/tests-290%20%2F%20229%20passed%20Deno%20Bun-brightgreen)](./TEST_REPORT.md)

---

## 一、整体架构（阅读后续 API 前建议先理解）

1. **无虚拟 DOM**\
   更新不经过「整树 diff」。`jsx` / `jsxs` 返回的是
   **Thunk**：`() => 实际 UI`（类型上常写作 `VNode`），在 `insert` 或 Effect
   执行时才求值，并与 **Signal** 订阅绑定。

2. **Owner 树**\
   每个组件函数在 **独立 Owner** 下运行（透明 `Provider`
   除外）。`createRoot`、`onCleanup`、`onError`、`useContext` 等都挂在 Owner
   链上。

3. **核心渲染 API：`insert(parent, value, current?, before?)`**
   - 若 `value` 为函数，会 **`createEffect`** 包裹，内部重复求值并 patch DOM。
   - **原生元素**上，非 `on*` 的 **函数型 prop** 会走
     **`createRenderEffect`**，用于 `className={() => ...}`、`value={() => ...}`
     等响应式属性。

4. **与 `deno.json` 完全一致的子路径**\
   本包在 JSR 上**仅**注册下文「安装」中的导出键；**不存在**
   `/store`、`/router`、`/csr` 等额外入口——`createStore`、`createRouter` 等均在
   **`jsr:@dreamer/view`** 主入口。

---

## 二、安装

### 2.1 全局 CLI（`view-cli`）

```bash
deno run -A jsr:@dreamer/view/setup
```

安装后 `view-cli` 在 `PATH` 中。根级支持 **`--version` /
`-v`**。完整参数以解析器为准，可执行
**`view-cli --help`**、**`view-cli <子命令> --help`**。

| 命令                         | 说明                                                                                                                                                            | 常用选项                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **`view-cli init`** `[目录]` | 在指定目录（省略则为当前目录）生成新项目脚手架。                                                                                                                | **`--beta`** — 在适用场景下采用偏 beta 链路的默认项。                       |
| **`view-cli dev`**           | 开发服务器（HMR、路由表生成等）。                                                                                                                               | **`-h` / `--host`** — 监听主机；**`-p` / `--port`** — 端口。                |
| **`view-cli start`**         | 托管 **已构建** 的静态产物（需先 **`build`**）。                                                                                                                | **`-h` / `--host`**、**`-p` / `--port`**。                                  |
| **`view-cli build`**         | 按 `view.config.ts` 执行生产构建并输出到配置目录。                                                                                                              | —                                                                           |
| **`view-cli upgrade`**       | 向 JSR 查询 **`@dreamer/view`** 最新版；若高于当前 CLI 所用版本，则执行 **`jsr:@dreamer/view@<version>/setup`**，使 **全局** 安装的 `view-cli` 与该发行版对齐。 | **`--beta`** — 解析「最新」时包含 beta / 预发布线。                         |
| **`view-cli update`**        | 在 **当前项目** 目录执行 **`deno update`** 或 **`bun update`**，更新 **工程内** 依赖与 lockfile。                                                               | **`--latest`** — 传给运行时；其余参数可一并附加（如 **`--interactive`**）。 |

### 2.2 在项目中添加依赖

**Deno**

```bash
deno add jsr:@dreamer/view
```

**Bun**

```bash
bunx jsr add @dreamer/view
```

### 2.3 `exports` 一览（与仓库 `view/deno.json` 一致）

| 子路径                              | 说明                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `jsr:@dreamer/view`                 | **主入口**：响应式、运行时、`insert`、`mount` / `hydrate`、路由、Resource、Store、控制流、表单、Suspense、HMR 等 |
| `jsr:@dreamer/view/types`           | 公共类型：`VNode`、`JSXRenderable` 等                                                                            |
| `jsr:@dreamer/view/cli`             | CLI 实现（工具链使用）                                                                                           |
| `jsr:@dreamer/view/setup`           | 全局安装脚本入口                                                                                                 |
| `jsr:@dreamer/view/jsx-runtime`     | JSX 自动运行时（`jsx` / `jsxs` / `Fragment`）                                                                    |
| `jsr:@dreamer/view/jsx-dev-runtime` | 开发期 JSX 入口（与 jsx-runtime 同源，满足部分打包器对 `jsxDEV` 的解析）                                         |
| `jsr:@dreamer/view/portal`          | 仅 **`createPortal`**（可按需单独引用）                                                                          |
| `jsr:@dreamer/view/compiler`        | **`compileSource` / `transformJSX`** 等与 TS 编译相关的 API                                                      |
| `jsr:@dreamer/view/optimize`        | **`optimize` / `createOptimizePlugin`** 构建期字符串压缩等                                                       |
| `jsr:@dreamer/view/ssr`             | **`renderToString` / `renderToStringAsync` / `renderToStream`**、`generateHydrationScript` 及 SSR 辅助符号       |

按需增加子路径示例：

```bash
deno add jsr:@dreamer/view
deno add jsr:@dreamer/view/ssr
deno add jsr:@dreamer/view/compiler
deno add jsr:@dreamer/view/optimize
deno add jsr:@dreamer/view/portal
deno add jsr:@dreamer/view/types
```

---

## 三、TypeScript 与 JSX 配置

在 **`deno.json`**（或等价配置）中启用自动 JSX，并指定
**`jsxImportSource`**，使编译器从本包加载运行时：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jsr:@dreamer/view"
  }
}
```

- 开发时也可把 `jsxImportSource` 写成 `"@dreamer/view"`，只要在 `imports`
  里映射到同一模块即可。
- 类型声明：可使用包内 `JSX` 命名空间；若单独维护 **`jsx.d.ts`**，需
  `/// <reference types="..." />` 或 `compilerOptions.types` 指向正确声明。

---

## 四、最小可运行示例（客户端）

下面使用 **`mount`**：第一个参数是 **返回 UI 的函数**，第二个参数是 **挂载到的
DOM 节点**。`mount` 会先清空容器再插入（适合纯 CSR）。

```tsx
import { createSignal, mount } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

/**
 * 计数器页面：演示 Signal 在 JSX 中与事件中的两种用法。
 */
function App(): VNode {
  const count = createSignal(0);

  return (
    <div>
      <p>当前计数：{count}</p>
      <button
        type="button"
        onClick={() => {
          count.value = count.value + 1;
        }}
      >
        +1
      </button>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  mount(() => <App />, root);
}
```

**要点：**

- 文本位置写 **`{count}`**：运行时会把 **`SignalRef`** 当作响应式插值订阅。
- 在 **`onClick` / `createEffect`** 里请用 **`count.value`** 读写，与 JSX
  插值区分。

---

## 五、`createRoot` 与手动 `insert`（细粒度控制）

**`createRoot`** 签名：`createRoot(<T>(fn: (dispose: () => void) => T) => T)`。\
常用于：需要 **显式 `dispose()`** 卸载整棵子树，或自行传入 **父节点** 与
**`insert`** 布局。

```tsx
import { createRoot, createSignal, insert } from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

function App(): VNode {
  const n = createSignal(0);
  return (
    <div>
      <span>{n}</span>
      <button type="button" onClick={() => (n.value += 1)}>+</button>
    </div>
  );
}

const el = document.getElementById("root")!;

const stop = createRoot((dispose) => {
  insert(el, () => <App />);
  // 若需要对外暴露卸载：可把 dispose 存到模块级变量
  return dispose;
});

// 稍后整树卸载：
// stop();
```

---

## 六、挂载与水合 API

### 6.1 `mount(fn, container)`

- **`fn`**: `() => InsertValue`，返回值交给 **`insert(container, …)`**。
- 会 **删除容器内所有子节点**，并清除容器上的 **`data-view-cloak`**（若有）。
- 卸载：当前实现通过 **`createRoot`** 返回的清理逻辑在内部关联；若你只用 `mount`
  且需卸载，请改用 **`createRoot` + `insert`** 模式以便拿到 **`dispose`**。

### 6.2 `hydrate(fn, container, bindings?)`

- **`fn`**: 与客户端激活时一致的 UI 工厂。
- **`container`**: 已含服务端 HTML 的节点。
- **`bindings`**:
  可选，**`[number[], string][]`**，与编译产物中的水合绑定表一致时使用；手写 CSR
  可省略。
- 会先 **`stopHydration()`** 再 **`internalHydrate(container, bindings)`**，然后
  **`insert`**。

```tsx
import { hydrate } from "jsr:@dreamer/view";

function RootView() {
  return <div id="app">...</div>;
}

const container = document.getElementById("root")!;
hydrate(() => <RootView />, container /* , bindingMap */);
```

---

## 七、响应式基础 API

### 7.1 `createSignal(initial, name?)`

**是的：`createSignal`
支持两种常用「风格」**（**同一个返回值**上的不同写法，可混用，不必二选一）。

| 风格                     | 读                 | 写                                       | 说明                                                                                                            |
| ------------------------ | ------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **`.value` / 调用式**    | `s.value` 或 `s()` | `s.value = x`、`s(x)`、`s(prev => next)` | JSX 里写 **`{s}`** 时会按响应式插值订阅；事件里多用 **`.value`** 更清晰                                         |
| **元组解构（Solid 式）** | `get()`            | `set(x)`、`set(prev => next)`            | `const [get, set] = createSignal(0)`，与 **`signal[0]` / `signal[1]`** 及 **`signal.set`** 同一套 getter/setter |

补充：

- **`signal.set`** 与元组里的 **`set`** 是同一个 setter。
- 第二参数 **`name`**（可选）：**`createSignal(0, "counter")`** 具名信号，便于
  HMR/调试等场景与内部注册表对齐（见 `signal.ts`）。

返回值 **`Signal<T>`** 同时具备：

- **`signal.value` / `signal.value = x`**
- **`signal()`** 读取、**`signal(x)`** 或 **`signal(prev => …)`**
  写入（函数重载与 Solid 类似）
- **元组解构**：`const [get, set] = createSignal(0)`，`get()` / `set(1)`（也可用
  **`for…of`** 解构，因实现了迭代器）

```tsx
import { createEffect, createMemo, createSignal } from "jsr:@dreamer/view";

const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);

createEffect(() => {
  console.log("count =", count(), "double =", double());
});

setCount(1);
```

### 7.2 `createEffect(fn)` / `createRenderEffect(fn)`

- **`createEffect`**：标准副作用，依赖在 **`fn`** 内通过读 Signal / Memo
  自动收集，异步微任务批量刷新。
- **`createRenderEffect`**：同步倾向更强，用于与 DOM
  属性更新时序强相关的场景（框架内部也用于原生节点上的函数型 prop）。

```tsx
import { createEffect, createSignal, onCleanup } from "jsr:@dreamer/view";

const id = createSignal(0);

createEffect(() => {
  const current = id.value;
  const timer = setInterval(() => {
    console.log("tick for id", current);
  }, 1000);
  onCleanup(() => clearInterval(timer));
});
```

### 7.3 `createMemo(fn)` 与别名 `memo`

```tsx
import { createMemo, createSignal, memo } from "jsr:@dreamer/view";

const n = createSignal(2);
const squared = createMemo(() => n() * n());
const same = memo(() => n() + 1); // 与 createMemo 等价
```

### 7.4 `batch(fn)`

在 **`fn`** 执行期间合并通知，减少多余 Effect 刷新（与调度器配合）。

```tsx
import { batch, createSignal } from "jsr:@dreamer/view";

const a = createSignal(0);
const b = createSignal(0);

batch(() => {
  a.value = 1;
  b.value = 2;
});
```

### 7.5 `untrack(fn)`

在 **`fn`** 内读取响应式源 **不** 建立依赖。

### 7.6 `onMount(fn)` / `onCleanup(fn)` / `onError(fn)` / `catchError(err)`

- **`onMount`**：基于 **`createEffect` +
  `untrack`**，只在挂载后执行一次你传入的逻辑。
- **`onCleanup`**：向当前 Owner 注册清理函数。
- **`onError` / `catchError`**：与 **ErrorBoundary**、Owner 错误冒泡配合。

### 7.7 `createDeferred(signal)`、`useTransition`、`startTransition`

用于延迟提交、过渡更新（与 **`createEffect`** 调度配合）。

```tsx
import { createDeferred, createSignal, useTransition } from "jsr:@dreamer/view";

const source = createSignal(0);
const deferred = createDeferred(source);
const [isPending, startTransitionFromHook] = useTransition();

// deferred() 在微任务后对齐到最新 source；第二项为启动 transition 的函数
void startTransitionFromHook(() => {
  source.value = source.value + 1;
});
console.log("pending?", isPending());
```

### 7.8 `createSelector(source, compare?)`

列表选中态等场景下，按 key 缓存布尔 Signal，避免整表重算。\
**注意**：`source` 的读取时机应在合适的 Effect
作用域内，避免在错误层级订阅导致「整页跟着 source 抖动」（详见源码注释）。

---

## 八、Owner 与上下文工具

```tsx
import {
  createOwner,
  createRoot,
  getOwner,
  runWithOwner,
} from "jsr:@dreamer/view";

createRoot((dispose) => {
  const owner = getOwner();
  console.log("root owner", owner);
  // runWithOwner(某个Owner, () => { ... }) 在指定子树下执行
});
```

---

## 九、DOM 与 `insert`

### 9.1 `insert(parent, value, current?, before?)`

- **Thunk**：`value` 为函数时递归求值直到非函数或带 **`__VIEW_SIGNAL`** 标记的
  Signal getter。
- **文本 / 数字**：尽量复用文本节点。
- **数组 / 类数组**：写入 **`DocumentFragment`**。
- **`null` / `undefined` / `boolean`**：清除当前占位节点。

### 9.2 `getDocument()` / `createRef()` / `setProperty` / `spread`

- **`getDocument()`**：在浏览器返回 **`document`**；无 DOM 或 SSR 未注入 shadow
  文档时返回 **`null`**，避免直接访问全局 **`document`** 抛错。
- **`createRef()`**：与 **`ref={refObj}`** 配合，使节点挂载驱动响应式更新。
- **`setProperty` / `spread` /
  `setAttribute`**：底层属性扩散，扩展或编译产物可能用到。

### 9.3 `template` / `walk`（偏编译产物与高级用法）

- **`template(htmlString)`** + **`walk(root, path)`**：解析静态 HTML
  模板并在路径上定位节点；与 **`compileSource`** 生成代码配合。

---

## 十、控制流组件（均从主入口导入）

### 10.1 `Show`

```tsx
import { createSignal, Show } from "jsr:@dreamer/view";

const user = createSignal<{ name: string } | null>(null);

function Greeting() {
  return (
    <Show
      when={() => user.value}
      fallback={<p>未登录</p>}
    >
      {(u) => <p>你好，{u.name}</p>}
    </Show>
  );
}
```

- **`when`**：**`() => T | false | null | undefined`**。
- **`children`**：静态子 **或** **`(item: T) => …`**。
- **`fallback`**：条件不成立时显示。

### 10.2 `For`

```tsx
import { createSignal, For } from "jsr:@dreamer/view";

const items = createSignal([
  { id: "1", label: "A" },
  { id: "2", label: "B" },
]);

function List() {
  return (
    <For
      each={() => items.value}
      fallback={<p>列表为空</p>}
    >
      {(row, index) => (
        <div>
          #{index()} — {row.label}
        </div>
      )}
    </For>
  );
}
```

- **`each`** 必须是 **getter**：**`() => 数组`**。不要写
  **`each={items.value}`**（一次性快照，不订阅）。可简写 **`each={items}`** 当
  **`items`** 本身是 **Signal 且 `items()` 返回数组**。
- **`index`** 也是 **getter**：**`() => number`**。

### 10.3 `Index`

与 **`For`** 类似，语义偏 **按下标追踪**（同一索引位置复用节点）。**`each`**
仍为 **`() => 数组`**，**`children(item, index)`** 签名与 **`For`** 相同；**无**
`fallback` 参数（见源码类型定义）。

### 10.4 `Switch` / `Match`

```tsx
import { createSignal, Match, Switch } from "jsr:@dreamer/view";

const status = createSignal<"idle" | "loading" | "error">("idle");

function StatusView() {
  return (
    <Switch fallback={<span>未知状态</span>}>
      <Match when={() => status.value === "idle"}>
        <span>就绪</span>
      </Match>
      <Match when={() => status.value === "loading"}>
        <span>加载中…</span>
      </Match>
      <Match when={() => status.value === "error"}>
        <span>出错了</span>
      </Match>
    </Switch>
  );
}
```

### 10.5 `Dynamic`

```tsx
import { createSignal, Dynamic } from "jsr:@dreamer/view";

const Tag = createSignal<"h1" | "h2">("h1");

function Heading(props: { text: string }) {
  return (
    <Dynamic
      component={() => Tag.value}
      className="title"
    >
      {props.text}
    </Dynamic>
  );
}
```

- **`component`**：字符串标签名 **或** 组件函数；响应式时请传 **零参函数** 或
  **Signal**（勿传 **`tag.value` 单次快照**）。

### 10.6 `lazy`

```tsx
import { lazy, Suspense } from "jsr:@dreamer/view";

const Heavy = lazy(() => import("./Heavy.tsx"));

function Page() {
  return (
    <Suspense fallback={<p>加载模块…</p>}>
      <Heavy />
    </Suspense>
  );
}
```

---

## 十一、`Suspense` 与 `createResource`

### 11.1 基本用法

```tsx
import { createResource, ErrorBoundary, Suspense } from "jsr:@dreamer/view";

/**
 * 在模块或父级作用域创建 Resource，避免每次父组件执行都 new 一份。
 */
const profile = createResource(async () => {
  const res = await fetch("/api/me");
  if (!res.ok) throw new Error("加载失败");
  return res.json() as Promise<{ name: string }>;
});

function ProfileCard() {
  const data = profile();
  return <div>用户：{data?.name}</div>;
}

export function PageWithSuspense() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>{String(err)}</p>
          <button type="button" onClick={reset}>重试</button>
        </div>
      )}
    >
      <Suspense fallback={<p>加载中…</p>}>
        <ProfileCard />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### 11.2 带依赖的 `createResource(source, fetcher)`

```tsx
import { createResource, createSignal } from "jsr:@dreamer/view";

const userId = createSignal(1);

const user = createResource(
  () => userId.value,
  async (id) => {
    const r = await fetch(`/api/user/${id}`);
    return r.json();
  },
);
```

### 11.3 Resource 对象上的字段

- **`resource()`**：读数据；若有 **error** 会 **throw**（交给
  **ErrorBoundary**）。
- **`resource.loading()`** / **`resource.error()`**
- **`resource.mutate(value)`** / **`resource.refetch()`**

框架在 **`resource()` / `resource.loading()`** 时会确保挂到当前 **Suspense**（含
**ErrorBoundary** 重置后的新边界）。

---

## 十二、`ErrorBoundary`

```tsx
import { createSignal, ErrorBoundary } from "jsr:@dreamer/view";

const key = createSignal(0);

function MaybeFail() {
  if (key.value < 0) throw new Error("key 无效");
  return <span>ok</span>;
}

export function Guarded() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>{String(err)}</p>
          <button
            type="button"
            onClick={() => {
              key.value = 1;
              reset();
            }}
          >
            修复并重试
          </button>
        </div>
      )}
      resetKeys={() => [key.value]}
    >
      <MaybeFail />
    </ErrorBoundary>
  );
}
```

- **`resetKeys`**：在 **错误已发生** 的前提下，仅当返回值与上次 **Object.is**
  逐项比较不同时，清除错误并重试子树。

---

## 十三、`Portal` 与 `createPortal`

### 13.1 声明式 `Portal`

```tsx
import { createSignal, Portal } from "jsr:@dreamer/view";

const open = createSignal(false);

export function ModalDemo() {
  return (
    <div>
      <button type="button" onClick={() => (open.value = !open.value)}>
        切换
      </button>
      <Portal mount={document.body}>
        {() => open.value && <div className="modal">浮层内容</div>}
      </Portal>
    </div>
  );
}
```

- **`mount`** 可选，默认 **`document.body`**。

### 13.2 命令式 `createPortal`（`jsr:@dreamer/view/portal` 或主入口）

```tsx
import { createPortal } from "jsr:@dreamer/view/portal";
import { createSignal } from "jsr:@dreamer/view";

const box = document.getElementById("modal-root")!;
const visible = createSignal(true);

const root = createPortal(
  () => (visible.value ? <div className="toast">提示</div> : null),
  box,
);

// root.unmount();
```

---

## 十四、`createContext` / `useContext`

```tsx
import { createContext, useContext } from "jsr:@dreamer/view";

const ThemeCtx = createContext<"light" | "dark">("light");

function Panel() {
  const theme = useContext(ThemeCtx);
  return <div className={theme}>面板</div>;
}

export function App() {
  const mode = "dark" as const;
  return (
    <ThemeCtx.Provider value={mode}>
      <Panel />
    </ThemeCtx.Provider>
  );
}
```

**`Provider`** 为 **透明组件**：不新建 Owner，只在当前 Owner 上写入 context。

---

## 十五、`createStore` / `produce` / `reconcile`

### 15.0 有几种定义、几种用法？

**是的：对象根的 `createStore`
同样支持两种主要「使用形态」**，外加多种**函数重载**（创建方式不同，得到的是同一套深度代理机制）。

**使用形态（仅讨论「对象」作根状态；数组根见下文）**

| 形态         | 写法                                                     | 读 / 写                                                                                                                    |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **整表代理** | `const store = createStore({ count: 0 })`                | **`store.count`** 读写字段；**`store.setState(...)`** 批量或函数式更新                                                     |
| **元组解构** | `const [getStore, setState] = createStore({ count: 0 })` | **`getStore()`** 返回与上面**同一张**代理（便于细粒度追踪）；**`setState("count", 1)`** 或 **`setState(produce(...))`** 等 |

**`createStore` 的重载（如何调用构造函数）**

1. **`createStore(initialState)`** — 最常见。
2. **`createStore(initialState, { name?, persist? })`** — 自定义注册名、可选
   **localStorage** 等持久化。
3. **`createStore(storeName, initialState, persist?)`** — **具名单例**（全局
   registry 用 `storeName`）+ 可选第三参持久化。

**数组根（根状态本身是数组）**

- 得到的是**带 `setState` 的数组代理**，类型上**刻意不与** `[get, set]`
  元组交叉（否则 `list[0]` 会被误判成元组项）。
- 请用 **`.setState`** 或下标赋值等 API
  更新；**不要**按对象根的方式去解构二元组。

下文 **15.1 / 15.2** 分别展开「整表代理」与「元组」的完整示例。

### 15.1 对象根：代理 + `setState`

```tsx
import { createEffect, createStore, produce } from "jsr:@dreamer/view";

const store = createStore({
  user: { name: "Ada", age: 36 },
  tags: ["ts", "deno"],
});

createEffect(() => {
  console.log(store.user.name);
});

store.user.name = "Bob";
store.setState({ tags: [...store.tags, "bun"] });
store.setState(
  produce((draft) => {
    draft.user.age += 1;
  }),
);
```

### 15.2 元组解构：`[getStore, setState]`

```tsx
import { createStore } from "jsr:@dreamer/view";

const [getStore, setState] = createStore({ count: 0 });

setState("count", 1);
console.log(getStore().count);
```

### 15.3 具名单例 + 持久化

**写法 A：三参数 `createStore(storeName, initialState, persist?)`**

源码见 **`reactivity/store.ts`** 的 **`PersistOptions<T>`**：

| 字段              | 是否必填 | 说明                                                                                                                              |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **`key`**         | 必填     | 写入 `storage` 的键名                                                                                                             |
| **`storage`**     | 可选     | 需实现 **`getItem` / `setItem`**；省略且存在 **`globalThis.localStorage`** 时默认用它，否则持久化逻辑无后端（不抛错，但无法落盘） |
| **`serialize`**   | 可选     | **`(state: T) => string`**，默认 **`JSON.stringify`**                                                                             |
| **`deserialize`** | 可选     | **`(str: string) => T`**，默认 **`JSON.parse`**（类型需自行断言或与运行时数据一致）                                               |

**与 `view/examples/src/stores/user.ts`
对齐的「写全」示例**（便于对照类型与默认值）：

```tsx
import { createStore } from "@dreamer/view";

export const USER_STORE_PERSIST_KEY = "view-examples-user";

export interface UserState {
  name: string;
  role: "guest" | "user" | "admin";
  loginCount: number;
  lastLogin: string | null;
}

export const userStore = createStore(
  "examples-user-store",
  {
    name: "Guest",
    role: "guest",
    loginCount: 0,
    lastLogin: null,
  } as UserState,
  {
    key: USER_STORE_PERSIST_KEY,
    storage: globalThis.localStorage,
    serialize: (state: UserState) => JSON.stringify(state),
    deserialize: (str: string) => JSON.parse(str) as UserState,
  },
);
```

**极简写法**（与框架默认等价：只配 **`key`**，**`storage` / `serialize` /
`deserialize` 走默认**）：

```tsx
import { createStore } from "jsr:@dreamer/view";

export const PERSIST_KEY = "my-app-user";

export const userStore = createStore(
  "my-app-user-store",
  {
    name: "Guest",
    role: "guest",
    loginCount: 0,
    lastLogin: null as string | null,
  },
  { key: PERSIST_KEY },
);
```

测试或 SSR 等场景可只改 **`storage`** 为 mock / 内存实现，无需动
**`serialize`**，除非自定义格式。

**写法 B：第二参数为 options 对象（与具名三参数等价能力，按项目风格二选一）**

```tsx
import { createStore } from "jsr:@dreamer/view";

const prefs = createStore(
  { theme: "light" as const },
  {
    name: "app-prefs",
    persist: { key: "prefs-v1", storage: globalThis.localStorage },
  },
);
```

### 15.4 `reconcile`

用于列表/树的部分更新、保持引用稳定（与 **`setState`** 组合使用）。

---

## 十六、`createForm`（受控表单）

### 16.1 能力与边界

| 项目              | 说明                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **签名**          | **`createForm(initialValues, options?)`** — 第二参可选，不传时与旧版行为兼容                                             |
| **双向绑定**      | **`field(name)`** → **`value` + `onInput`**（文本 **`<input>`**，读 **`HTMLInputElement.value`**）                       |
| **规则校验**      | **`options.rules`**：每字段 **`(value, data) => string \| null`**，`null` 表示通过                                       |
| **校验时机**      | **`validateOn`**：**`submit`**（默认）、**`change`**、**`blur`**，可传数组组合                                           |
| **API**           | **`validate()`** 整表、**`validateField(name)`** 单字段、**`handleSubmit(onValid, onInvalid?)`**                         |
| **未内置 schema** | 不与 Zod 等绑定；可在 **`rules`** 内调用外部解析，或继续手写 **`errors`**                                                |
| **控件类型**      | **`checkbox` / `select` / `textarea`** 等仍需自写事件或后续扩展；**`produce` 改 data 不会自动触发 `validateOn: change`** |

类型导出（与主入口一并导出）：**`CreateFormOptions`**、**`FormValidateOn`**、**`FormFieldRule`**。

### 16.2 无规则（最简，与旧文档一致）

```tsx
import { createForm } from "jsr:@dreamer/view";

export function LoginForm() {
  const form = createForm({ username: "", password: "" });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        console.log(form.data.username, form.data.password);
      }}
    >
      <input type="text" {...form.field("username")} />
      <input type="password" {...form.field("password")} />
      <button type="submit">登录</button>
      <button type="button" onClick={() => form.reset()}>
        重置
      </button>
    </form>
  );
}
```

- 仍可使用 **`form.validate()`**：无 **`rules`** 时会**清空全部 `errors`**
  并返回 **`true`**。
- **`form.data` / `form.errors`** 为 **Store**；**`form.produce`** 更新
  **`data`**。

### 16.3 推荐：`rules` + 默认仅提交时校验

```tsx
import { createForm } from "jsr:@dreamer/view";

export function LoginForm() {
  const form = createForm(
    { username: "", password: "" },
    {
      rules: {
        username: (v) => (String(v).trim() ? null : "请输入用户名"),
        password: (v) => (String(v).length >= 6 ? null : "密码至少 6 位"),
      },
      // validateOn 省略时等价于 ["submit"]
    },
  );

  return (
    <form onSubmit={form.handleSubmit((data) => console.log(data))}>
      <input type="text" {...form.field("username")} />
      {form.errors.username && <span>{form.errors.username}</span>}
      <input type="password" {...form.field("password")} />
      {form.errors.password && <span>{form.errors.password}</span>}
      <button type="submit">登录</button>
    </form>
  );
}
```

- **`handleSubmit(onValid, onInvalid?)`**：内部 **`preventDefault`** →
  **`validate()`** → 通过则 **`onValid(getDataSnapshot())`**（**浅拷贝**
  普通对象，避免外抛 Proxy）。
- 也可手写：**`onSubmit={(e) => { e.preventDefault(); if (!form.validate()) return; … }}`**。

### 16.4 `validateOn: "change"` / `"blur"` / 数组

- **`change`**：该字段 **`onInput`**（以及 **`updateField`**）后，**若该字段有
  `rule`**，自动 **`validateField(name)`**。
- **`blur`**：该字段有 **`rule`** 时，**`field()`** 返回值附带
  **`onBlur`**，失焦时校验。
- 多选示例：**`validateOn: ["change", "blur", "submit"]`**。

```tsx
const form = createForm(
  { code: "" },
  {
    rules: {
      code: (v) => (String(v).length >= 3 ? null : "至少 3 个字符"),
    },
    validateOn: "change",
  },
);
```

### 16.5 跨字段规则（第二参数 `data`）

```tsx
const form = createForm(
  { password: "", password2: "" },
  {
    rules: {
      password: (v) => (String(v).length >= 6 ? null : "至少 6 位"),
      password2: (_v, d) =>
        d.password === d.password2 ? null : "两次密码不一致",
    },
  },
);
```

整表 **`validate()`** 会按 **`initialValues` 的键顺序**
跑规则；依赖别字段的项若需严格顺序，可把被依赖字段写在对象字面量前（如上）。

### 16.6 仍可自行扩展的方向

- **`field` 按类型分支**（`checkbox` / `number` / `textarea`）。
- 与 **Zod** 的薄封装（在 **`rules`** 里调 **`.safeParse`**）。
- 数组字段、嵌套路径错误模型（当前 **`errors` 与顶层键对齐）。

---

## 十七、路由：`createRouter` / `mountWithRouter` / `Link` / `useRouter`

### 17.1 创建路由器

```tsx
import {
  createRouter,
  Link,
  mountWithRouter,
  useRouter,
} from "jsr:@dreamer/view";
import type { VNode } from "jsr:@dreamer/view";

function Home(): VNode {
  return (
    <div>
      <h1>首页</h1>
      <Link href="/user/42">用户 42</Link>
    </div>
  );
}

function UserPage(props: { params: Record<string, string> }): VNode {
  return <p>用户 ID：{props.params.id}</p>;
}

const router = createRouter({
  basePath: "",
  routes: [
    { path: "/", component: Home },
    { path: "/user/:id", component: UserPage },
  ],
  notFound: { path: "*", component: () => <p>404</p> },
  scroll: "top",
  beforeEach: (to, from) => {
    console.log("navigate", to.path, from?.path);
    return true;
  },
});

mountWithRouter("#root", router);
```

- **`createRouter`** 支持 **`createRouter(routes[])`** 简写。
- **动态段**：**`:id`**；**尾缀捕获**：**`/files/*`** → **`params["*"]`**。
- **`router.navigate` / `replace`**：返回 **`Promise<void>`**，在
  **`beforeEach`** 与 **`history`** 提交后 resolve。
- **`Link`**：**`href`** 会经 **`resolveHref`** 拼 **`basePath`**；**`replace`**
  prop 为真时走 **`replace`**。
- **`useRouter()`**：取当前单例（需在 **`createRouter`**
  之后、同一应用内使用）。
- **当前匹配**：**`router.match()`**（含 **`params` / `query` / `pattern` /
  `route`**）。
- **创建路由器时** 已注册 **`popstate`**，并在 **`interceptLinks !== false`**
  时注册 **文档捕获点击**（同源 **`a`** 委托）；**`Link`** 带
  **`data-view-link`**，与委托逻辑配合。

### 17.2 在布局里渲染当前页

示例项目常见写法：根组件里 **`router.render()`** 返回当前路由对应的 VNode（含
**layout 嵌套** 与 **懒加载**）。

```tsx
import { useRouter } from "jsr:@dreamer/view";

export function Shell() {
  const router = useRouter();
  return (
    <main>
      {router.render()}
    </main>
  );
}
```

---

## 十八、SSR（`jsr:@dreamer/view/ssr`）

### 18.1 `renderToString`

```tsx
import { jsx } from "jsr:@dreamer/view/jsx-runtime";
import { renderToString } from "jsr:@dreamer/view/ssr";

const html = renderToString(() =>
  jsx("div", { id: "root", children: "hello" })
);
```

### 18.2 `renderToStringAsync` / `renderToStream`

- 与 **`registerSSRPromise`**、内部队列配合，用于异步数据就绪后再输出（见
  **`server.ts`** 实现）。

### 18.3 `generateHydrationScript(id, bindingMap)`

生成一段 **`<script type="module">`** 片段；**具体与客户端 `hydrate`
签名、构建产物是否一致** 取决于你的打包链路，接入时请对照当前
**`hydrate(fn, container, bindings?)`** 自行校验。

### 18.4 其它导出

- **`isServer`**、**`enterSSRDomScope` /
  `leaveSSRDomScope`**、**`queueSsrAsyncTask`**、**`registerSSRPromise`**
  等：编写高级 SSR 管线或测试时使用。

---

## 十九、编译器子路径（`jsr:@dreamer/view/compiler`）

```ts
import { compileSource } from "jsr:@dreamer/view/compiler";

const out = compileSource(sourceTsx, "App.tsx", {
  insertImportPath: "jsr:@dreamer/view",
  hydration: false,
  generate: "dom",
  hmr: false,
});
```

- 输出前会注入 **`template` / `insert` / `walk` / `setProperty` /
  `spread`**（及按需 **`memo`**、**`createHMRProxy`**）等 import。
- 适合工具链在构建期把 TSX 转为与本运行时对齐的 **`insert`** 代码。

---

## 二十、优化子路径（`jsr:@dreamer/view/optimize`）

```ts
import { createOptimizePlugin, optimize } from "jsr:@dreamer/view/optimize";

const code = optimize(bundleSource);
// createOptimizePlugin(/\.js$/) 用于 @dreamer/esbuild 插件链
```

---

## 二十一、HMR（`createHMRProxy`）

开发环境且全局存在 **`VIEW_DEV`** 时，**`createHMRProxy(id, Component)`**
会注册可热替换的组件包装；一般由 **CLI / 编译** 注入，应用代码少手写。

---

## 二十二、性能：`render` Thunk（避免根 Effect 乱订阅）

当子树里有 **`Show` / 函数型 prop / 局部 Signal**，若直接写在父组件返回的 JSX
里，可能让 **父级 `insert` 对应的 Effect** 订阅到子状态，导致
**父级整段重复执行**。\
做法是：组件 **`return () => ( ... JSX ... )`**，把动态子树包进 **内层
Effect**。

```tsx
import { createSignal } from "jsr:@dreamer/view";

function ModalHost() {
  const open = createSignal(false);
  return () => (
    <div>
      <button type="button" onClick={() => (open.value = !open.value)}>
        开关
      </button>
      {open.value && <div className="modal">内容</div>}
    </div>
  );
}
```

---

## 二十三、使用 `view-cli init` 时的目录约定（摘要）

| 路径                     | 作用                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `view.config.ts`         | 开发服务器、构建、HMR、CSS 等                                                                      |
| `src/main.tsx`           | 入口：`createRouter` + `mountWithRouter`                                                           |
| `src/views/`             | 文件式路由；**`_app.tsx` / `_layout.tsx` / `_loading.tsx` / `_404.tsx` / `_error.tsx`** 为约定文件 |
| `src/router/routers.tsx` | **生成文件**（勿手改），由扫描 **`src/views`** 得到                                                |

---

## 二十四、安全

- **`dangerouslySetInnerHTML` / `innerHTML`**：仅用于可信内容。
- SSR 输出若暴露用户输入，需在服务端做转义或严格白名单。

---

## 二十五、测试报告与变更日志

- **当前版本 [2.0.2] — 2026-04-18**：**变更** `deno.json` / `package.json` 中
  **`@dreamer/server`**、**`@dreamer/test`**、**`@dreamer/plugins`** 等 JSR 与
  npm 别名区间；示例工程同步
  **`@dreamer/plugins`**、**`@dreamer/esbuild`**。完整条目见
  **[CHANGELOG.md](./CHANGELOG.md)**；英文版
  **[../en-US/CHANGELOG.md](../en-US/CHANGELOG.md)**。
- 测试概况见 **[TEST_REPORT.md](./TEST_REPORT.md)**（**2026-04-06**：Deno
  **290** 通过、Bun **229** 通过，**62** 个测试文件，均为 **0**
  失败；两种运行器计数方式不同，详见报告正文）。

---

## 二十六、许可证

Apache License 2.0，见仓库根目录 **[LICENSE](../../LICENSE)**。

---

<div align="center"><strong>Made with ❤️ by Dreamer Team</strong></div>
