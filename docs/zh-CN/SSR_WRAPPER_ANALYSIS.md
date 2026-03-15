# 去掉 keyed / dynamic 包装节点 — 可行性分析

## 一、现状与问题

- **Keyed 包装**：带 `key` 的子节点在 SSR 和客户端都会被包一层
  `<span data-view-keyed data-key="...">`（客户端此前用 span，已可改为 div 或
  `display:contents`）。用于按 key 做列表协调时通过 `data-key` 找到对应 DOM。
- **Dynamic 包装**：动态子节点（getter/function）被包一层
  `<div data-view-dynamic>`，作为稳定容器，getter 重跑时对容器
  `replaceChildren`。
- **问题**：多一层 DOM 会干扰 Grid/Flex、选择器、样式（如
  `:first-child`），即使用 `display:contents` 也不能解决所有场景。

下面分析能否**完全去掉**这两类包装，改为在「原有节点」上打标。

---

## 二、Keyed 包装 — 可以去掉

### 2.1 为什么现在要包一层？

- 协调时需要「按 key 找到对应 DOM」。
- 当前做法：父级的 `children` 里每个子节点都是「包装元素」，在包装上写
  `data-key`，通过 `container.children[i].getAttribute("data-key")` 建立 key →
  包装的映射，再对 `wrapper.firstChild` 做 patch。

### 2.2 去掉的思路：把 key 打在内容根上

- 不再创建包装节点；让「每个 keyed 项渲染出来的根节点」自己带 `data-key`。
- **SSR**：对 keyed 子节点**不**输出包装 span，改为在「该 keyed
  子节点输出的第一个元素」的 open tag 上注入 `data-key="..."`。
- **客户端**：
  - 不创建 wrapper，直接 `createElement(v)` 得到 `node`。
  - 对「根」设置 key：若 `node` 是 Element，则
    `node.setAttribute("data-key", key)`；若 `node` 是 DocumentFragment，则对
    `node.firstElementChild` 设 `data-key`（若没有
    firstElementChild，只能退化为包一层 span 或要求 keyed 项至少渲染一个元素）。
- **协调**：`keyToWrapper` 改为「key → 内容根节点」（即 parent 的某个 child
  就是带 `data-key` 的根）。patch 时直接 patch 该根节点，不再用
  `wrapper.firstChild`。

### 2.3 实现要点

| 位置             | 改动                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **stringify.ts** | `walkElementChildrenStream` 里 keyed 分支不 yield 包装 span；给 `walkVNodeForSSR` 传入「injectKey」，在**第一次** yield 元素 open tag 时把 `data-key` 拼进属性，并清掉 injectKey。                                    |
| **element.ts**   | 已有逻辑：普通元素 VNode 若带 `vnode.key` 会在创建出的 el 上 setAttribute data-key。组件/Fragment 返回的根不会自动带 key，需在「对 keyed 项创建根」的调用点补设 data-key（或封装 `createElementAndSetKey(v, key)`）。 |
| **reconcile.ts** | keyed 分支不再创建 wrapper；`createElement(v)` 得到 node 后对根设 data-key；`keyToWrapper` 指向内容根；patch 目标从 `wrapper.firstChild` 改为该根节点本身。                                                           |
| **hydrate**      | 若仍通过 `data-key` 识别 keyed 节点，无需包装即可与上述结构一致。                                                                                                                                                     |

### 2.4 边界

- Keyed 项渲染为 **Fragment 且 firstElementChild
  为空**（例如全是文本）：无法在「原有节点」上挂 key，要么保留最小包装（如 span
  display:contents），要么约定 keyed
  项必须至少有一个元素根。建议约定或退化为单层包装。

---

## 三、Dynamic 包装 — 可以去掉，用 data-view-dynamic 即可定位更新

### 3.0 从 DOM 结构得到的结论（与截图一致）

实际 DOM 里经常出现：**外层 span 和内部节点都带有
`data-view-dynamic`**。原因是当前有「单节点优化」：getter
只返回一个元素时，会用该元素替换掉包装，并在该元素上打
`data-view-dynamic`。因此：

- **已有 `data-view-dynamic`
  的节点本身就是「动态槽」的容器**，更新时可以直接以该节点为锚点做
  `replaceChildren` 或按范围替换。
- 外层 span 在这种场景下是**冗余**的：识别与更新完全可以只依赖
  `data-view-dynamic` 属性，不必再依赖包装节点。
- 结论：**可以去掉 dynamic 的 span/div
  包装**，改为在「第一个节点」或「单节点时的该节点」上打
  `data-view-dynamic`（必要时加 slot index），根据该属性查找并更新即可。

### 3.1 为什么现在要包一层？

- 父级 children 里既有静态项又有 getter；每个 getter
  需要一块「稳定区域」，getter 重跑时只替换这块区域，避免整父级
  `replaceChildren` 导致失焦等问题。
- 当前做法：为每个 getter 创建一个带 `data-view-dynamic` 的容器，getter
  输出挂到容器里，更新时只对容器 `replaceChildren`。

### 3.2 去掉的思路：用「范围」代替「容器」

- 不创建包装节点；父级的子节点变成「扁平」列表：`[ 动态块1的节点…, 动态块2的节点…, 静态节点… ]`。
- 需要能标识每段动态块的**起止**，以便 getter 更新时只替换这一段。
- **做法**：在每段动态内容的**第一个节点**上打标，例如 `data-view-dynamic` +
  `data-view-dynamic-index="0"`（第几个 getter 槽位）。客户端根据 index 找到对应
  getter，再根据「从该节点到下一个 data-view-dynamic 或 parent 末尾」确定这段的
  range，更新时删除该 range 内节点并插入新内容。

### 3.3 实现要点

| 位置                                | 改动                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **stringify.ts**                    | 动态子节点不输出 `<div data-view-dynamic>`；改为在「该 getter 输出的第一个节点」上注入 `data-view-dynamic` 和 slot index（遍历 children 时对每个 getter 递增 index）。若 getter 返回空或仅文本，需一个占位节点（如注释或最小 span）来挂 data-view-dynamic，否则无法界定范围。 |
| **element.ts / appendDynamicChild** | 不再创建 wrapper；直接把 getter 的产出 append 到 parent，并在**第一个产出节点**上 setAttribute data-view-dynamic 和 index。                                                                                                                                                   |
| **reconcile / hydrate**             | 识别带 data-view-dynamic 的节点，按 index 对应到 getter；计算该 slot 的 end（下一个 data-view-dynamic 或 parent 末尾）；注册 effect，更新时 replace 这段 range（remove 旧节点、insert 新节点）。                                                                              |

### 3.4 难点与边界

- **范围计算**：要正确处理「0 个节点」「多个节点」「Fragment」；若 getter 先输出
  3 个节点再变成 1 个，需要准确 replace 整段。
- **Hydration**：服务端已输出展开后的节点，客户端需按 DOM 顺序与 children
  列表（getter/静态混合）一一对应，并在遇到 data-view-dynamic 时绑定 getter 与
  range，逻辑比「一个 wrapper 对应一个 getter」更复杂。
- **空 getter**：若 getter
  返回空，没有「第一个节点」可打标，需要约定用占位节点（如注释节点或带
  data-view-dynamic 的 span）表示空槽，否则无法在更新时找到要替换的 range。

**要点**：从 DOM 上可以确认，只要节点上有
`data-view-dynamic`，就可以作为「该动态槽」的标识并用于更新；不依赖外层 span/div
包装。

---

## 四、建议

1. **Keyed**：建议实现「去掉 keyed 包装」：改动集中在
   stringify（injectKey）、reconcile（不建 wrapper、给根设 data-key）、以及
   createElement 对 keyed 根的 key 传递；边界上可约定 keyed
   项至少有一个元素根，或 Fragment 无 firstElementChild 时退化为单层包装。
2. **Dynamic**：与 DOM 表现一致，**可以去掉包装**：用
   `data-view-dynamic`（及必要时 slot
   index）在首节点或单节点上打标，根据该属性定位并更新即可；需实现「按 range
   替换」与空 getter 占位，实现量大于 keyed 但方向明确。
3. 若两者都去包装，建议先做 **keyed**，再做 **dynamic**，便于分步验证 SSR /
   hydrate / 协调。

---

## 五、总结

| 类型        | 能否去掉 | 难度 | 核心改动                                                                                          |
| ----------- | -------- | ---- | ------------------------------------------------------------------------------------------------- |
| **Keyed**   | 能       | 中   | 把 data-key 打到内容根；SSR 用 injectKey 注入首元素；客户端不建 wrapper，直接 patch 根。          |
| **Dynamic** | 能       | 高   | 用 data-view-dynamic + index 标记每段动态块起止，按 range 替换；需处理空 getter 与 hydrate 顺序。 |

结论：**keyed 与 dynamic 包装都可以去掉**。从 DOM 可见，带 `data-view-dynamic`
的节点已能标识动态槽并用于更新，无需依赖外层 span；实现上 keyed 先做、dynamic
用「首节点打标 + 按 range 替换」即可。
