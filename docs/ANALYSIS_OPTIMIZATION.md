# @dreamer/view 优化分析

本文档从**性能**、**代码结构**、**安全**、**轻量化**四方面对 view
包做全面分析，并给出可实施的优化建议，便于进一步压榨体积与提升运行时表现。

---

## 一、性能分析

### 1.1 当前优势

| 方面           | 现状            | 说明                                                                                                                               |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **调度**       | 微任务批处理    | `scheduler.ts` 使用 `queueMicrotask`（fallback Promise/setTimeout）统一 flush，避免 signal 变更时同步重入、减少重复 layout/paint。 |
| **依赖收集**   | 细粒度          | getter 读 signal 时登记当前 effect，setter 只通知订阅者，更新范围小。                                                              |
| **DOM 更新**   | 插入点 + effect | `insertReactive` 的 getter 在 effect 内求值，仅该插入点随依赖更新，无 vdom diff。                                                  |
| **flush 实现** | 索引 for 循环   | `flushQueue` 用 `for (let i = 0; i < copy.length; i++) copy[i]()`，避免 for-of 迭代器分配（注释已说明）。                          |

### 1.2 可优化点

| 项                               | 位置         | 建议                                                                                                                                                                     | 收益                           | 状态                                                                      |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------- |
| **insertReactive 分支顺序**      | `runtime.ts` | 按实际场景统计：若 MountFn 最常见，将 `isMountFn(next)` 提前到最前，减少后续类型判断。                                                                                   | 热路径少 1～2 次分支。         | ✅ 已落实（MountFn 已为首分支，并补充注释）                               |
| **currentNodes 更新**            | `runtime.ts` | MountFn 分支中 `Array.from(parentNode.childNodes).slice(beforeLen)` 在子节点很多时会有临时数组。可考虑只记录「本次挂载的节点」而非 slice 整段（需与 cleanup 逻辑一致）。 | 大列表下减少临时数组分配。     | ✅ 已落实（新增 `captureNewChildren`，四处替换为直接 for 收集）           |
| **Object.is 与 setter 提前返回** | `signal.ts`  | 已用 `Object.is(value, nextValue)` 避免无变化时通知，现状合理。                                                                                                          | -                              | ✅ 已确认，无需改动                                                       |
| **unwrapSignalGetterValue 内联** | `signal.ts`  | 若主包或 compiled 入口在热路径频繁调用，可评估将「是否为 getter + 调用」内联到 insertReactive 内，减少一层函数调用（需权衡包体积与可读性）。                             | 微任务/effect 密集时略降 CPU。 | ✅ 已落实（insertReactive 内内联 getter 判断与调用，改用 isSignalGetter） |

### 1.3 不建议做的“优化”

- **同步 flush**：当前异步批处理能避免嵌套 set 导致的多轮
  run，改为同步可能引入重入与顺序问题。
- **合并多个 signal 更新为一次 effect run**：当前语义是「每次 set 调度一次
  run」，合并需改订阅模型，风险大。

---

## 二、代码结构分析

### 2.1 重复与可收敛逻辑

| 重复点                               | 出现位置                                                                                                                                    | 建议                                                                                                                                                                                                              | 状态                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **toNode / 值→Node**                 | `runtime.ts`（toNodeForInsert）、`compiler/insert.ts`（toNode）、`compiler/vnode-mount.ts`（toDomLeafNode）、`compiler/insert-replacing.ts` | 抽到 `compiler/insert.ts` 或共享小模块 `to-node.ts`，统一导出 `toNode(value, doc)`，各处在 SSR/CSR 传入 `getActiveDocument()`。主包 runtime 若不想依赖 compiler，可保留 toNodeForInsert，仅收敛 compiler 内三处。 | ✅ 已收敛：新增 `compiler/to-node.ts` 导出 `valueToNode(value, doc)`，insert / vnode-mount / insert-replacing 均复用；runtime 的 toNodeForInsert 内部调用 valueToNode 并保留 VNode 警告。 |
| **isMountFn**                        | `runtime.ts`、`compiler/insert.ts`                                                                                                          | 两处逻辑一致，可考虑从 `compiler/insert.ts` 导出，主包 runtime 从 compiler 引用（或复制一份最小实现以避免循环依赖）。                                                                                             | ✅ 已统一：由 `compiler/insert.ts` 导出，runtime 从 compiler 引用。                                                                                                                       |
| **detachInsertReactiveTrackedChild** | `runtime.ts`、`compiler/insert.ts`                                                                                                          | 同上，可统一到一处实现。                                                                                                                                                                                          | ✅ 已统一：由 `compiler/insert.ts` 导出，runtime 从 compiler 引用。                                                                                                                       |

### 2.2 编译器体积

- **transform.ts** 约 2700+ 行，占 src 行数比例高。建议：
  - **按职责拆文件**：如 v-if 链、v-for、Suspense、ref、指令等拆成
    `transform-vif.ts`、`transform-vfor.ts` 等，`transform.ts`
    只做编排与入口，便于维护和按需 tree-shake（若构建支持）。
  - **常量与工厂收敛**：重复的 `factory.create*` 模式可抽成少量
    helper，减少单文件长度。
- 编译器仅在构建时运行，不进入浏览器
  bundle；优化主要收益在**维护成本与编译期耗时**，对运行时体积无影响。

### 2.3 主入口与子路径

- **mod.ts** 已只导出核心 API，不直接导出
  boundary、directive、router、store，这些由子路径按需使用，有利于
  tree-shaking。
- **compiled.ts** 已提供「仅运行时 + signal +
  effect」的薄入口，全编译应用可只用此入口进一步减小 bundle。

---

## 三、安全分析

### 3.1 已有措施

| 方面                  | 现状              | 说明                                                                                                                                              |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SSR 文本/属性转义** | `escape.ts`       | `escapeForText`（&、<、>）、`escapeForAttr`（&、"、<、>）、`escapeForAttrHtml`（含单引号）在 ssr-document、meta、generateHydrationScript 中使用。 |
| **SSR 序列化**        | `ssr-document.ts` | 文本节点 `serialize()` 用 `escapeForText`，元素属性用 `escapeForAttr`，避免直接拼接未转义用户内容。                                               |
| **Hydration 脚本**    | `runtime.ts`      | `generateHydrationScript` 中 nonce、scriptSrc 等用 `escapeForAttr` 写入，降低注入风险。                                                           |
| **CSP**               | 支持 nonce        | 脚本标签可带 nonce，便于与 CSP 配合。                                                                                                             |

### 3.2 风险与建议

| 项                          | 风险                                                                          | 建议                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **dangerouslySetInnerHTML** | 若 SSR 或客户端直接写 innerHTML 且内容来自用户，存在 XSS。                    | 文档明确标注：任何使用 `dangerouslySetInnerHTML` 或等价能力的场景，必须由调用方保证内容已消毒或可信。SSR 的 `SSROptions.allowRawHtml` 为 false 时，应在实现上保证对应内容走转义路径（当前文档已约定，需在代码中落实并单测）。 |
| **setAttribute 注入**       | 若属性值来自用户且未转义，在 SSR 输出为 HTML 时可能引入属性注入。             | 服务端序列化时属性值已通过 `escapeForAttr` 处理；客户端 `setAttribute` 由浏览器自动转义，一般安全。建议在文档中说明「用户可控的 attribute 在 SSR 下应避免直接插到未转义字符串」。                                             |
| **全局状态**                | `globals.ts`、`KEY_*` 存在 globalThis 上，若多实例或沙箱共存需注意 key 隔离。 | 当前 KEY 使用 `view.` 前缀与 Symbol，冲突概率低；多根应用共享同一 scheduler/effect 全局状态属设计如此，文档注明即可。                                                                                                         |

### 3.3 建议补充

- 在 **README 或安全说明** 中增加简短「安全」章节：推荐 CSP、说明 SSR 转义与
  `allowRawHtml`、禁止将未消毒用户输入写入 `dangerouslySetInnerHTML`。
- 若存在「服务端根据 allowRawHtml 决定是否转义
  dangerouslySetInnerHTML」的逻辑，建议加单测覆盖 allowRawHtml: false
  时输出为转义文本。

---

## 四、轻量化分析

### 4.1 已做的轻量化

| 项                        | 说明                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **子路径导出**            | 主入口不拖入 router、store、directive、boundary、resource、context 等，按需从 `@dreamer/view/router` 等导入。                   |
| **compiled 入口**         | `@dreamer/view/compiled` 不含 jsx-runtime、directive 等，全编译应用可只依赖此入口。                                             |
| **insert-replacing 独立** | 占位替换 API 从 `@dreamer/view/insert-replacing` 按需导入，主包不导出。                                                         |
| **三原语**                | insertStatic / insertReactive / insertMount 明确分离，编译器与手写可按需选用，利于 tree-shake。                                 |
| **VNode 路径**            | normalizeChildren、mountVNodeTree 等在 compiler 子模块，主 runtime 通过 vnode-insert-bridge 回调 insertReactive，避免主包膨胀。 |

### 4.2 可进一步压榨的方向

| 方向                      | 做法                                                                                                                                                                                | 收益                                       | 成本                             | 状态                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **主入口再瘦身**          | 将 `renderToStream`、`renderToString`、`getActiveDocument` 从 mod.ts 移到仅 compiler 或单独子路径，主入口只保留 createRoot/render/mount、insert、signal、effect、ref、getDocument。 | 仅做 CSR 且不用 SSR 的 bundle 可再少一点。 | 破坏性变更，需改文档与迁移指南。 | ✅ 已落实：新增子路径 `@dreamer/view/ssr` 导出上述 API，主入口已移除；SSR 需从 `@dreamer/view/ssr` 或 `@dreamer/view/compiler` 导入。                  |
| **router / store 懒加载** | 若构建支持，router.ts、store.ts 等大文件可考虑动态 import 再 re-export，使首屏 bundle 不包含未用路由/状态逻辑。                                                                     | 首屏体积下降。                             | 需要约定入口形态与构建配置。     | ✅ 已满足：router/store 仅从子路径 `@dreamer/view/router`、`@dreamer/view/store` 导出，主入口不导出；首屏不引用即不打入主包，构建工具按需 code-split。 |
| **compiler 产物优化**     | 编译产物中重复的 `createElement("div")`、`setAttribute("class", "…")` 等可考虑更短别名或共享变量（如同一 class 只 set 一次），需编译器配合。                                        | 产物略小、解析略快。                       | 编译器改动与测试成本。           | ✅ 已落实：mount 函数内首行注入 `const _doc = getActiveDocument()`，产物中 createElement/createTextNode 统一使用 `_doc.xxx`，减少重复调用与产物体积。  |
| **effect 清理链表**       | 当前 `_cleanups` 为数组，若 effect 很多且 cleanup 频繁，可评估改为链表或复用数组池，减少小数组分配。                                                                                | 高负载下内存与 GC 略好。                   | 实现与回归成本中等。             | ✅ 已落实：`_cleanups` 改为 `_cleanupHead`/`_cleanupTail` 链表，顺序执行并清空，避免数组扩容与多次小数组分配。                                         |

### 4.3 不建议的“轻量化”

- **合并 signal 与 effect 为单一抽象**：会削弱语义清晰度与 tree-shake 能力。
- **移除 subpath 只保留单入口**：会迫使未使用 router/store
  的应用也拉取这些代码，总体 bundle 更大。
- **为省几行而删错误信息**：现有 `console.error` / throw 对排查「未编译
  VNode」等问题很重要，不宜为体积删除。

---

## 五、优先级建议

| 优先级 | 类别 | 建议项                                                                | 理由                                           |
| ------ | ---- | --------------------------------------------------------------------- | ---------------------------------------------- |
| P1     | 代码 | 收敛 toNode / isMountFn / detachInsertReactiveTrackedChild 到共享实现 | 减少重复、降低后续修改成本，且不改变对外 API。 |
| P1     | 安全 | 文档补充安全章节；若有 allowRawHtml: false 逻辑则加单测               | 提升可审计性与用户信任。                       |
| P2     | 性能 | insertReactive 分支顺序按真实场景调优；评估 currentNodes 记录方式     | 热路径收益明显，改动面小。                     |
| P2     | 轻量 | 评估主入口是否再拆出 SSR/compiler 相关导出                            | 需权衡破坏性与收益。                           |
| P3     | 代码 | 编译器 transform 按职责拆文件、常量/工厂收敛                          | 提升可维护性，对运行时无影响。                 |
| P3     | 性能 | unwrapSignalGetterValue 内联、effect cleanup 数据结构                 | 边际收益，可在有性能基线后再做。               |

---

## 六、小结

- **性能**：调度与依赖收集设计合理；可做的主要是热路径分支顺序、currentNodes
  处理方式及少量内联/结构优化。
- **代码**：重复的「值→Node」与挂载/清理逻辑适合收敛到共享模块；编译器大单文件适合按职责拆分。
- **安全**：SSR 与脚本生成已使用统一转义；建议明确文档约定并对 allowRawHtml
  等路径补测。
- **轻量化**：子路径、compiled 入口、insert-replacing
  独立已较好；可再评估主入口瘦身与 router/store 懒加载，在破坏性与收益间权衡。

按上述优先级推进，可在不破坏现有 API
的前提下进一步压榨体积、提升可维护性与安全性；性能优化建议在具备基准数据后再做细调。
