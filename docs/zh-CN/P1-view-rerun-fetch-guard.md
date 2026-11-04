# P1：组件重跑／裸 fetch 防护（DEV 警告）

| 项     | 值                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 包     | `@dreamer/view` **3.0.0**（`dev`）                                                                                                      |
| 性质   | **DEV／opt-in DX**＋文档 — setup 体被多余重跑时警告（失焦＋裸 `fetch` 重发）                                                            |
| 入口   | `@dreamer/view/devtools`（`noteComponentSetup`／`detectComponentRerun`；扩展 oversubscribe）                                            |
| 范围外 | 重写响应式内核；改 Effect 默认微任务；自动挂钩每个组件；发 JSR                                                                          |
| EN     | [`../en-US/P1-view-rerun-fetch-guard.md`](../en-US/P1-view-rerun-fetch-guard.md)                                                        |
| 相关   | [`P0-4-component-author-guide.md`](./P0-4-component-author-guide.md) · [`P2-dev-warn-oversubscribe.md`](./P2-dev-warn-oversubscribe.md) |

---

## 0. 运行时防护（已落地）

经 `jsx()`／`jsxs()` 调用的函数组件，其 **setup 在 `untrack` 下执行**。 setup
顶层读 Signal／Memo **不会**订到父级 `insert` Effect，因此非路由状态变化
**不会**再 `cleanNode`＋整段 `replaceChild`（失焦／裸 `fetch`
重发）。细粒度更新仍走 子树内 `insert`／`createRenderEffect`／`createEffect`。

**Context：** `useContext` 对 Signal getter 必须经 Proxy
在每次属性访问时重读；若一次性 unwrap 成快照，对象型 `value={signal}` 只能靠整树
remount 刷新，与 setup `untrack` 冲突。同刀已修。

**仍会重建（允许）：** 父级 Effect 重跑（路由切换、父 thunk 显式重读页面
Signal）、 水合 `mismatchMode: "remount"`、业务主动 remount。

测锁：`tests/unit/runtime/component-rerun-guard.test.ts`。

## 1. 问题

重复请求多半**不是** `createResource` 坏了，而是过宽订阅让**整段组件 setup
重跑**， 顶层裸 `fetch(...)` 再次触发；整树替换还会丢掉输入焦点。

**口诀**

1. 组件／页面函数 **setup 只跑一次**。
2. 副作用进 **`createEffect`** 或 **`createResource`**（传入 `AbortSignal`）。
3. **不要**在组件顶层或 `return` 路径裸调 `fetch`／`axios`。
4. 根 `return` 不要同步读会变的 Signal（见 P0-4）。

---

## 2. Opt-in API

```ts
import {
  detectComponentRerun,
  enableOversubscribeWarnings,
  noteComponentSetup,
} from "@dreamer/view/devtools";

globalThis.VIEW_DEV = true;

function Page() {
  noteComponentSetup("Page"); // 第二次调用 → component-rerun 风险
  // 错：fetch("/api");
  // 对：createResource(() => fetch("/api", { signal }).then(r => r.json()))
  return <Shell />;
}

const stop = enableOversubscribeWarnings({
  setupKeys: ["Page"],
  remountKeys: ["PullRefresh"],
});
stop();

detectComponentRerun("Page", { emit: true });
```

既有 **wide-subscription**／**remount-churn** 文案已点明失焦与裸 fetch 重发。

---

## 3. Resource AbortSignal（薄配套）

`createResource` 每次 load 传 `{ signal }`；**source 变化**／`refetch`／外层
**`options.signal`** 会 abort。切页请传 `{ signal: routeAbort.signal }`——
**不要**指望 Owner dispose（Suspense 切 fallback 也会 dispose 子 Owner）。

Abort **治不好**「setup 每次重跑又 new 一个 Resource」——根因仍靠 untrack＋DEV
警告。
