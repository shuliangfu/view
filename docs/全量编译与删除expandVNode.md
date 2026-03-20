# 全量编译与删除 expandVNode

## 目标

- **App 和所有子组件**都走 JSX 编译器，产出 `(parent) => void`
  的挂载函数，**不再返回 VNode**。
- 在此基础上**删除 expandVNode** 及整条 VNode 展开路径（insert 的 VNode
  分支、dom/element 内 expand 等），保持框架轻量。

## 前提

- 当前编译器已支持：`return <JSX>` →
  `return (parent) => { insert(parent, ...) }`。
- 当前仅对 **main.tsx** 做一次替换（只替换文件中第一个 `return <jsx>`）。

## 方案概览

1. **编译器**：支持「替换文件中所有 `return <jsx>`」，而不是只替换第一个（例如
   `replaceAllReturns: true`）。
2. **构建**：对**所有 .tsx** 在 onLoad 时跑该编译（filter: `\.tsx$`），这样
   App、Layout、路由页等都被编译。
3. **运行时 insert**：当 getter 或静态 value 的返回值是「单参函数」(parent) =>
   void 时，视为**编译后子组件的挂载函数**，执行 `value(parent)`，不再走
   expandVNode。
4. **删除 expandVNode**：确认无 VNode 返回路径后，删除 runtime.ts 中 insert 的
   VNode 分支、dom/element 中的
   expandVNode/createNodeFromExpanded/replacePlaceholderWithVNodeGetter
   等，以及仅被 expand 使用的类型/常量。

## 已实现（当前状态）

### 步骤 1：编译器 ✅

- `compileSource` 遍历 AST 时会对**文件中每一个**
  `return <JsxElement|JsxFragment|JsxSelfClosing>` 做替换，单文件多组件（如
  App、Layout）都会变成 `return (parent) => { ... }`，无需额外选项。

### 步骤 2：构建对所有 .tsx 跑编译 ✅

- 编译插件 filter 已改为 `\.tsx$`，对**所有** .tsx 执行
  `compileSource(source, path, { insertImportPath: "@dreamer/view" })`。
- 入口与所有被 import 的 .tsx 都走同一套编译。

### 步骤 3：insert 支持「编译后子组件」：(parent) => void ✅

- **runtime.ts** 的 `insert` 已支持：
  - `value` 为单参函数时：执行 `value(parent)`，不建 effect。
  - getter 返回单参函数时：清掉旧 wrapper，创建新 wrapper，执行 `next(wrapper)`
    并记入 currentNodes，避免重复插入。
- 编译后的 `<Child />` 变为 `insert(parent, Child(props))`，Child 返回
  `(parent) => void`，由 insert 直接调用挂载。

### 步骤 4：删除 expandVNode 及相关路径 ✅

- **runtime.ts**：已删 insert 中 VNode 分支，仅支持
  `(parent) => void`、string/number/Node 及 getter→上述。
- **dom/element.ts**：已移除
  expandVNode、createNodeFromExpanded、replacePlaceholderWithVNodeGetter、createElement、appendChildren
  等整条 VNode→DOM 路径；仅保留 `normalizeChildren` 与 `ChildItem`
  类型（供类型/兼容用）。
- **dom/hydrate.ts**：已删除（hydrateElement、hydrateFromExpanded 等 VNode
  水合路径）；客户端水合走 runtime/hydrate 的 fn(container) + 伪 document 约定。

## 结果与当前状态

- **已做**：全量 .tsx 编译 + insert 仅支持
  `(parent) => void`/string/number/Node。**expandVNode 及整条 VNode→DOM
  路径已全部删除**：runtime.ts insert 无 VNode 分支，dom/element 仅保留
  normalizeChildren，dom/hydrate 已删除，框架已按新架构轻量化。

## 注意事项

- **SSR**：若 renderToString/renderToStream 当前依赖 expandVNode 或 VNode
  树，需单独改为「编译后组件 + 服务端执行 (parent) => void
  并序列化」或保留一条仅服务端用的轻量展开，与客户端解耦。
- **Portal**：createPortal 当前用 insert(el, getter) 且 getter 可能返回
  VNode；全量编译后应改为传入 `(parent) => void` 或编译后的挂载函数，与 insert
  的「单参函数」约定一致。
- **类型**：编译后组件的类型应为 `(props) => (parent: Element) => void`，可在
  jsx-runtime 或类型声明中统一。
