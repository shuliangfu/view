# P0-4：组件作者指南（Memo／ref／订阅边界）

| 项 | 值 |
|----|-----|
| 对象 | `@dreamer/view` **v2.2.0**，分支 `dev` |
| 日期 | **2026-11-04**（Asia/Shanghai） |
| 性质 | **文档为主**（可含文内示例）；**不改运行时语义**；禁 JSR／npm |
| 来源 | [`view-framework-analysis.md`](./view-framework-analysis.md) P0-4；ui-view（`PullRefresh`／`ScrollList`／`Affix`／`MobilePortalHostScope` 等）踩坑沉淀 |
| 英文 | [`../en-US/P0-4-component-author-guide.md`](../en-US/P0-4-component-author-guide.md) |
| 相关 | README [§二十二 render thunk](./README.md#二十二性能render-thunk避免根-effect-乱订阅)；[§七 Memo／Effect](./README.md#七响应式基础-api)；[§九 createRef](./README.md#九dom-与-insert) |

---

## 1. 心智模型：setup 一次，更新走细粒度绑定

`@dreamer/view` **不是** React：理想情况下组件函数在独立 **Owner** 下跑完
**setup**（创建 Signal／Memo／Effect／ref 桥），之后 **DOM 更新**由
`insert`／属性上的 Effect／子组件订阅完成，**不必**整段组件函数反复执行。

一旦外层「模板克隆／根 `insert`」的 Effect **误订阅**了业务 Signal／Memo，
信号一变就会：

1. 重跑组件体或整段 `_tmpl$()`；
2. `replaceChild`／卸挂再挂；
3. `ref(null)` → `ref(el)`、监听器被拆、焦点／手势／IO 丢失。

**作者目标：** 让「读 Signal」落在**尽量小的子树**里；外壳保持静态或只绑稳定引用。

---

## 2. 勿在组件顶层同步读 Signal／Memo（整段替换）

### 2.1 错因

在组件函数**顶层**（含 `return` 前算好整段 VNode、或在与静态壳同一 JSX
闭包里）同步调用 `sig()`／`memo()`／`.value`，会把外层 insert／模板 Effect
登记为下游。加载态、拖拽位移等一变 → **整段根树替换**。

ui-view 实锤：`PullRefresh` 若在根 JSX 读 `pullDragPx()`／`isLoading()`，
下拉时整壳重挂 → `ref(null)` → 手势 `detach` → `pointercancel`；
`ScrollList` 若在顶层算好 `loadMore` VNode 并读 `loadingMore()`，分页 loading
会重挂整个 `PullRefresh`／`List` 外壳。

### 2.2 做法

| 做法 | 说明 |
|------|------|
| **拆「只读信号的子组件」** | 头区／角标等单独组件内读 Signal；根壳 **return 时不读** |
| **`return () => (…)` thunk** | 见 README §二十二：动态子树进内层 Effect，避免父级乱订 |
| **控制流** | `Show`／`Switch` 的条件用 Signal／getter，勿先解成布尔再塞静态树 |
| **传 Signal／零参 getter** | `loading={sig}` 或 `loading={() => sig.value}`；**勿** `loading={sig.value}` 快照 |
| **手势／高频回调里用 `untrack`** | 需要「此刻值」但不订阅时：`untrack(() => sig())` |

```tsx
import { createMemo, createSignal, Show } from "jsr:@dreamer/view/csr";

/** 只读 loading：订阅限制在头区 */
function RefreshHead(props: { loading: () => boolean }) {
  return () => (
    <div className="head">{props.loading() ? "加载中…" : "下拉刷新"}</div>
  );
}

function PullShell(props: { loading: ReturnType<typeof createSignal<boolean>> }) {
  // setup：Memo 创建一次；本函数 return **不**调用 loading()／isLoading()
  const isLoading = createMemo(() => props.loading.value);
  return (
    <div className="shell">
      <RefreshHead loading={isLoading} />
      <div className="scroll">{/* 列表：同样勿在此读 isLoading */}</div>
    </div>
  );
}
```

反例（勿模仿）：

```tsx
function Bad(props: { loading: () => boolean }) {
  // 顶层读 → 外层 insert 订阅 loading
  const text = props.loading() ? "加载中" : "空闲";
  return <div className="shell">{text}<List /></div>;
}
```

---


### 2.3 勿顶层裸 `fetch`（重复请求的真凶）

组件因过宽订阅被整段重跑时，写在 setup／`return` 前的裸 `fetch`／`axios` 会**再发一次**，并常伴随失焦。副作用请放进 `createEffect` 或 `createResource`（带 `signal`）。DEV 可用 `@dreamer/view/devtools` 的 `noteComponentSetup`／过订阅警告（见 [`P1-view-rerun-fetch-guard.md`](./P1-view-rerun-fetch-guard.md)）。

## 3. `createMemo`：何时用／勿滥用

| 该用 | 不该用 |
|------|--------|
| 多处只读的**派生值**（`createMemo(() => read(props.x))`） | 把 Memo 当「跨次执行的稳定对象仓库」 |
| 合并 class／派生布尔，减少重复计算 | 在**每次**组件体重跑路径上新建 Memo 来「缓存」ref 回调 |
| 子树需要订阅 props 里的 Signal／getter | 代替 `createSignal` 存 DOM 指针或可变桥 |

**要点：** 每次调用 `createMemo(fn)` 都会 **新建** 一个 Memo。若组件因误订阅被整段重跑，顶层再 `createMemo` 会得到**新** getter／新回调引用 → `ref={新函数}` 触发整节点重绑，看起来像 DOM「被整块换掉」。

稳定跨「同一次 Owner 生命周期」的桥：

- 在 **setup 只跑一次** 的前提下，组件顶层创建的函数引用本身是稳定的；
- 若组件可能被重跑：把桥挂在 **Owner 单例**／`getOwner()` 关联表上（ui-view `PullRefreshDomBridge` 模式），**不要**每次 `createMemo(() => bridge)`。

```tsx
import { createMemo, createSignal } from "jsr:@dreamer/view/reactivity";

const items = createSignal<{ id: number; label: string }[]>([]);
// ✅ 派生：多处读同一计算结果
const count = createMemo(() => items().length);

// ❌ 不要：每次重跑新建 memo 只为「稳住」回调
// const bridge = createMemo(() => ({ onRef(el) { ... } }));
```

---

## 4. `ref` 边界

### 4.1 推荐

- 需要 `.current`：用 **`createRef<T>()`** + `ref={refObj}`（与编译器／JSX 约定一致）。
- 函数 ref：保持 **同一函数引用**（Owner 级桥），供滚动根、IO、手势挂载。

### 4.2 瞬态 `ref(null)`

响应式子树更新时，运行时可能先 **`ref(null)` 再 `ref(同一节点)`**。
若在 `null` 分支无条件地 `removeEventListener`／`disconnect`／清空宿主信号，会：

- 拆掉仍在用的手势／IO；
- 或与同步重渲染叠成 **maximum synchronous depth** 类死循环（见 ui-view `Affix`）。

**防护：** `ref(null)` 且节点仍 **`isConnected`** 时视为调度瞬态，**忽略**；仅在真正断开（卸载）时清理。

```tsx
function bindScrollRootRef(el: HTMLElement | null) {
  if (el == null) {
    const prev = currentScrollEl;
    if (prev && prev.isConnected) return; // 瞬态 null：勿 detach
    detach(prev);
    currentScrollEl = null;
    return;
  }
  currentScrollEl = el;
  attach(el);
}
```

### 4.3 与编译路径

个别触发器场景下，`createRef` 内部信号可能被编译路径订阅，叠加函数子插入导致重复挂载——此时可用**稳定函数 ref + 局部变量**代替（ui-view DatePicker／ColorPicker 注释）。优先稳定引用与拆订阅，而不是到处禁用 `createRef`。

---

## 5. 订阅边界（`createEffect`／追踪）

| 规则 | 说明 |
|------|------|
| **读即订** | 在 Effect／Memo／被追踪的 JSX 表达式里读 Signal／Memo 会订阅 |
| **窄订阅** | 高频 `scroll`／`pointermove` **不要**订 `loading` 这类会重建壳的信号 |
| **`untrack`** | 事件处理器里只需快照时包一层 `untrack` |
| **`onMount`／一次性** | 基于 Effect + `untrack`；副作用初始化放这里，勿绑进模板 Effect |
| **Resource** | 在模块或父级 setup 创建；勿在「每次父组件因误订阅重跑」的路径里 `createResource`（会重复请求） |

拆壳示例：

```text
PullRefreshRoot（return 不读业务 Signal）
 ├─ PullRefreshHead      ← 唯一读 pullDragPx / isLoading
 └─ PullRefreshScroller  ← 不读上述信号；只挂稳定 ref／手势
```

---

## 6. Context：勿把裸函数当作 `value`

`useContext` 会对 **函数型 value 当场执行一次**。若
`Provider value={() => hostEl()}`，消费者拿到的是 `HTMLElement | null`，
而不是 getter → 运行时 `is not a function`。

```tsx
// ✅
<HostCtx.Provider value={{ getHost }}>
// ❌
<HostCtx.Provider value={getHost}>
```

---

## 7. Props 约定（组件库作者）

| 推荐 | 避免 |
|------|------|
| `open={sig}`／`loading={() => sig.value}` | 只传 `sig.value` 布尔快照（Hybrid／父级不重跑时永不更新） |
| 列表 `items={sig}` 或 `items={() => rows}`，子级 `createMemo(() => read(props.items))` | 父级解构后丢失响应式，或顶层 `props.items()` 订太宽 |
| 文档写明「ControlledOpenInput = boolean \| Signal \| () => boolean」 | 假定父级会像 React 一样每拍重渲染 |

---

## 8. 子路径导入（轻触）

组件库／应用新代码优先：

- `jsr:@dreamer/view/reactivity` — Signal／Memo／Effect／Context
- `jsr:@dreamer/view/csr` — mount + 控制流 + Suspense
- 表单／路由／Resource 用对应子路径

主入口 `@dreamer/view` 仍可用（2.x 完整兼容），但是 **convenience barrel**（包体更大），且属 **[P1-1 弃用预告](./P1-1-main-entry-deprecation-preview.md)**。完整表见 README §2.3；本指南不重做子路径专题。

---

## 9. 自检清单

- [ ] 根组件 `return` 路径是否同步读了会频繁变的 Signal／Memo？
- [ ] 读信号的 UI 是否已拆到最小子组件／thunk／`Show`？
- [ ] `createMemo` 是否只在 setup 建一次，而不是当稳定仓库反复新建？
- [ ] 函数 `ref` 引用是否稳定？`ref(null)` 是否按 `isConnected` 忽略瞬态？
- [ ] 手势／scroll 回调是否误订了会重建壳的信号？
- [ ] Context `value` 是否为对象／原始值，而非「当 getter 用」的裸函数？
- [ ] 受控 props 是否接受 Signal／getter，文档是否写清？

---

## 10. 非目标（本刀）

- 不改 `insert`／Effect／`createMemo`／`ref` 默认运行时语义
- DEV-only 过订阅／卸挂再挂警告见 [`P2-dev-warn-oversubscribe.md`](./P2-dev-warn-oversubscribe.md)（`/devtools` 显式 opt-in）
- 不改 ui-view／dweb-admin 产品代码；不发 JSR／npm
- 不把 P0-2 体积分析、P0-3 编译器优化、P1\* 塞进本刀
