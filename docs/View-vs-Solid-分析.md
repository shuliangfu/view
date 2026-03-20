# View 与 Solid.js 对比分析

## 一、核心差异总览

| 维度                              | View                                                                                                         | Solid.js                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **组件执行时机**                  | 父级「效应」重跑时会再次执行子组件（如 getter 重跑 → 子组件拿到新 props 再跑一遍）                           | **组件只执行一次**，挂载时跑完就结束，之后不再因 props/state 重跑                                               |
| **更新机制**                      | 根 effect 重跑 → 整棵 VNode 重新 expand → **patchRoot**（diff/patch 已展开的树）                             | 无整树 re-expand：**细粒度绑定**，只有依赖到该 signal 的「插入点」会重跑，直接改 DOM                            |
| **是否有 Virtual DOM / 整树展开** | 有「逻辑上的整树」：expandVNode 得到树，再 mount 或 patch                                                    | **无虚拟 DOM**；JSX 编译成「模板 + 动态插入点」，插入点才是响应式单元                                           |
| **组件在 patch 中的命运**         | 对**函数组件**做 patch 时：当前实现是 **replaceChild（整节点替换）**，不区分「同类型组件就地更新」           | 不涉及「对组件做 patch」：组件只跑一次，产出 DOM + 绑定；之后更新走的是绑定，不是「再跑组件再 patch」           |
| **Props 响应式**                  | 传 getter 时在组件内读 `props.current()` 建立订阅；或父级传 `current()` 导致父级 getter 重跑，子组件整棵重跑 | **Props 是 getter**，在 JSX 里写 `props.xxx` 才会建立订阅；解构会丢响应式，要用 `splitProps` 或直接 `props.xxx` |

---

## 二、View 的流程（导致「轮播问题」的链路过哪里）

1. **根 effect 驱动整树**
   - `createRoot(fn, container)` 里有一个 `createEffect`。
   - 任何在 `fn()` 执行过程中被读到的 signal 变化 → 会 schedule 这个 effect →
     微任务里 effect 重跑。
   - 重跑时：`vnode = fn()` → `newExpanded = expandVNode(vnode)` → 若已挂载则
     `patchRoot(container, mounted, lastExpanded, newExpanded)`。

2. **子组件何时「再跑一次」**
   - 父级是「动态 getter」时（例如
     `{ () => <Carousel current={current()} /> }`）：
     - getter 被调用的时机就是在「某个 effect」里（例如
       getDynamicChildEffectBody 的 effect）。
     - 当 `current()` 变化 → 该 effect 重跑 → getter 再跑 → 得到新的
       `<Carousel current={1} />`。
     - 接下来会 **expand 这棵新的 Carousel**，即 **Carousel
       函数再执行一次**，得到新的子 VNode 树。
   - 所以：**父级依赖的 signal 一变，子组件会在「重新
     expand」的路径上再跑一遍**，不是「只跑一次然后只改绑定」。

3. **Patch 时对函数组件的处理**
   - 在 `patchNode` 里，当 `newV.type === "function"`（即组件）时：
     - 只有「当前 DOM 是 `data-view-dynamic` 且能拿到新 getter」时，才走
       **updateDynamicChild**（复用容器、不 replace）。
     - 否则一律 **createElement(newV) + replaceChild(next,
       dom)**，即**整节点替换**。
   - 因此：像 `<Image>` 这种普通函数组件，在 View
     里**没有「同类型组件就地更新」**，每次 patch 到它都是 **replace** →
     **卸载旧 Image、挂载新 Image** → 轮播里就会反复出现「只看到占位 /
     第一张正常后面不正常」等现象。

4. **问题本质**
   - 父级 getter 重跑 → 子组件整棵重新 expand → 得到新树 → patch。
   - Patch 到子组件时又是「整节点替换」→ 子组件（包括里面的
     Image）被反复卸载/挂载 → 状态和 DOM（如图片加载）被重置。

---

## 三、Solid.js 的流程（为什么没有我们这种「整块替换」问题）

1. **组件只跑一次**
   - 组件函数**仅在首次挂载时执行**，用于：
     - 创建 signal / store / effect / memo；
     - 返回 JSX。
   - 之后**无论 props 或 state
     怎么变，组件函数都不会再执行**；更新完全由「已经建立好的响应式图」驱动。

2. **JSX 编译成「模板 + 插入点」**
   - Solid 的 JSX 会编译成：
     - 静态的 DOM 结构（或模板）；
     - 以及**动态插入点**（expression）：哪里用了 `{ ... }`，哪里就是一个「在
       signal 变化时会被重新执行并更新 DOM」的插入点。
   - 所以**没有「整棵组件树再跑一遍再 diff/patch」**，只有「某个 signal 变了 →
     只重跑依赖它的那几条 expression → 直接改对应 DOM 节点」。

3. **不存在「对组件节点做 patch」**
   - 组件执行一次后，产出的是一棵「带洞」的 DOM + 一堆绑定（effect/insert）。
   - 之后数据变化 → 只有这些绑定会跑 → 只更新 textContent、attribute、style
     等，**不会把整颗「组件节点」replace 掉**。
   - 因此 **Solid 里不会出现「因为父级更新而导致子组件整节点被 replace、内部
     DOM（如图片）被反复挂载」** 的轮播式问题。

4. **Props 的用法**
   - Props 是**代理/getter**，在 JSX 里写 `props.current` 才会被追踪。
   - 若在组件顶层解构
     `const { current } = props`，就只读了一次，**不会**在「当前 current
     变化时」再更新。
   - 正确用法：在 JSX 或 memo 里用 `props.current`，或使用 `splitProps` 等
     API，保证**访问发生在追踪上下文中**。

---

## 四、Solid 是否也存在「我们这种」问题？

- **不会。**
  - 我们这边的问题可以概括成：**「父级重跑 → 子组件整棵重算 → patch
    时对函数组件做 replace → 子组件（含 Image）反复挂载」**。
  - Solid
    没有「父级重跑导致子组件整棵重算」这一层：子组件只跑一次；也没有「对函数组件做
    patch/replace」：更新是细粒度绑定，不替换组件根节点。
  - 所以 **Solid 不存在「轮播里 Image 被整块替换、只显示占位」这类由「组件
    replace」导致的问题**。

---

## 五、Solid 是怎么「解决」的（本质是设计不同）

1. **组件 = 只执行一次的初始化器**
   - 组件不负责「每次数据变都再产出一棵新树」，只负责：
     - 建 signal/effect/memo；
     - 返回 JSX（编译成模板 + 插入点）。
   - 之后所有更新都走**已经绑好的插入点**，不再重新执行组件。

2. **编译期就知道「哪里是动态的」**
   - 编译时就能区分：哪里是静态结构，哪里是 `{ expression }`。
   - 运行时只需在 expression 对应的位置做「读 signal → 更新这一处
     DOM」，不需要整树 expand、整树 patch。

3. **不依赖「对组件节点做 patch」**
   - 没有「同类型组件就地 patch」的需求，因为**组件不会因为 props
     变化而「再跑一次」**；
   - 自然也就没有「patch 时误把子组件整节点 replace 掉」的问题。

---

## 六、View 若要缓解「我们这种问题」可以走的方向

1. **Patch 时对「同类型函数组件」做就地更新（不 replace）**
   - 类似现在对 `data-view-dynamic` + getter 的
     **updateDynamicChild**，但对「普通组件」也做：
     - 若 `oldV.type === newV.type`（同一组件），且能根据 newProps 得到一个「新
       getter」或新产出，
     - 则**只更新该组件对应的 DOM 子树**（例如用 getter 重新展开后对子节点做
       patch），而不是 `replaceChild` 整颗组件节点。
   - 这样 Carousel 里的 `<Image>` 在 current
     变化时就不会被整块替换，可避免反复挂载和占位闪烁。

2. **减少「整树 re-expand」**
   - 例如：组件返回「静态结构 + 少量 getter 子节点」，只有 getter 在 effect
     里重跑并更新对应槽位，而不是整棵 Carousel 每次 current 变都重新 expand。
   - 需要约定「哪些子节点是动态槽位」，并让 patch
     只更新这些槽位，而不是整树替换。

3. **轮播场景的权宜之计（我们已用）**
   - 用原生 `<img>` 替代 `<Image>` 组件，避免「函数组件被 replace」；
   - 或传 `current()` 且保证 patch 时节点一一对应（例如不返回 getter、少一层
     data-view-dynamic），减轻错位和整块替换。

---

## 七、总结表

| 问题/现象                           | View 现状                                                    | Solid 情况                               |
| ----------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| 父级 signal 变 → 子组件会再跑一遍？ | 会（在「重新 expand」的路径上）                              | 不会，组件只跑一次                       |
| 对函数组件做 patch 时               | replace 整节点（除非 data-view-dynamic + getter）            | 不「对组件做 patch」，只更新绑定         |
| 轮播里 Image 被整块替换、只显示占位 | 会出现                                                       | 不会出现（无此更新路径）                 |
| 解决思路                            | 同类型组件就地 patch，或减少整树 re-expand，或轮播用原生 img | 设计上就无需「组件 replace」，无需额外修 |

以上是 View 与 Solid.js 的差异，以及 Solid
为何不存在我们这类「组件被整块替换导致轮播异常」问题的原因与对应设计。
