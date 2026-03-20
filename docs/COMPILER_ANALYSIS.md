# View 路线 C JSX 编译器 — 全面能力与缺口分析

本文档对 `@dreamer/view` 的 `compileSource` + `jsxToRuntimeFunction`
做**深度分析**，列出已支持与未支持/易出错的用户写法，便于排查「编译不了」或运行时异常。

---

## 一、编译入口与转换范围

- **入口**：`compileSource(source, fileName?, options?)`，对整份 TS/TSX
  源码做一次 `ts.transform`。
- **转换对象**：
  1. **ReturnStatement**：`return <jsx>` 或 `return ( <jsx> )` →
     `return (parent) => { ... }`（MountFn）。
  2. **ArrowFunction（表达式体）**：`() => ( <jsx> )` →
     `() => (parent) => { ... }`（返回 MountFn）。
- **递归顺序**：先 `visitEachChild` 再处理当前节点，因此**嵌套函数**（如 `.map`
  回调）内的 `return <jsx>` 会先被转成 `return (parent)=>...`，再处理外层
  return。
- **未走 compileSource 的文件**：若某 .tsx 未被 esbuild 的 onLoad 用
  `compileSource` 处理，其 JSX 会由 esbuild 的 JSX 转成
  `createElement`，运行时得到 VNode，易触发「组件可能未走编译」等提示。

---

## 二、已支持的写法（可放心使用）

| 类别               | 写法示例                                                                                  | 说明                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 根 return          | `return <div/>`、`return ( <Layout><Child/></Layout> )`                                   | 转为根 MountFn，支持括号包裹                                               |
| 箭头组件           | `const Icon = () => ( <svg/> );`                                                          | 转为 `() => (parent)=>...`，调用处 `Comp(props)` 得到 MountFn              |
| 嵌套 return        | `items.map((x) => { return <li key={x}>{x}</li>; })`                                      | 回调内 return 先被转成 MountFn，getter 返回 MountFn 数组                   |
| 表达式内组件       | `{ isDark ? <SunIcon /> : <MoonIcon /> }`、`{ cond && <Tip /> }`、`{ x ?? <Fallback /> }` | `transformExpressionJsxToCalls` 将 JSX 转为 `Comp(props)`，无原始 JSX 输出 |
| 括号/类型断言      | `{ ( <Comp /> ) }`、`{ <Comp /> as SomeType }`                                            | 递归剥括号、处理断言内的表达式                                             |
| 内置元素           | `<div>`、`<span className="x">`、`<input disabled>`                                       | createElement + setAttribute/属性/事件                                     |
| 组件（无 spread）  | `<Comp a={1} b={x()} />`、`<Comp><Child/></Comp>`                                         | Comp(props)，children 为 DocumentFragment 或 ErrorBoundary 的 mount 函数   |
| Fragment           | `<>...</>`、`<><A/><B/></>`                                                               | 子节点直接挂到 parent，无包装节点                                          |
| v-if / v-show      | `vIf={cond}`、`v-show={visible}`                                                          | 条件块包裹、style.display                                                  |
| ref / 事件 / style | `ref={r}`、`onClick={f}`、`style={{...}}`                                                 | ref 分支、addEventListener、Object.assign(el.style, ...)                   |
| 命名空间标签       | `<ns:Comp />`                                                                             | tagNameToExpression 转为 ns.Comp                                           |
| ErrorBoundary      | `<ErrorBoundary><Child/></ErrorBoundary>`                                                 | children 作为 (parent)=>void 传入                                          |

---

## 三、已知缺口与边界情况（可能编译不了或行为异常）

### 3.1 根 return 不是「单棵 JSX」，而是表达式

- **写法**：`return condition ? <A /> : <B />`、`return list.map(() => <li/>)`（无外层包装元素）。
- **原因**：`getJsxFromReturnExpression` 只识别「单棵」JSX（JsxElement /
  JsxFragment / JsxSelfClosingElement）及一层括号，不识别
  ConditionalExpression、CallExpression。
- **结果**：该 return 不会被替换，函数仍返回未编译的表达式（VNode 或 VNode
  数组），根组件可能白屏或报错。
- **建议**：根组件尽量 `return ( <div>... 或 <>...</> )` 包一层；或后续扩展：当
  `expressionContainsJsx(expr)` 时生成
  `return (parent) => { insertReactive(parent, () => transformExpressionJsxToCalls(expr)); }`。

### 3.2 成员表达式作为组件标签（如 `<Foo.Bar />`）

- **写法**：`<Foo.Bar />`、`<Layout.Header />`。
- **现状**：已在 `tagNameToExpression` 中增加对
  `ts.isPropertyAccessExpression(tag)` 的分支，直接返回该 Expression，编译产物为
  `Foo.Bar(props)` 正确形态。
- **说明**：ElementAccessExpression（如 `<Comp[tagName] />`）仍走 getText
  fallback，若需支持可再扩展。

### 3.3 JSX 属性展开（spread）

- **写法**：`<Comp {...props} />`、`<div {...attrs} className="x" />`。
- **原因**：各处属性处理（buildAttributeStatements、buildPropsFromAttributes、buildComponentStatements）对
  `ts.isJsxSpreadAttribute(prop)` 直接 `return` 跳过，不收集到 props/attrs。
- **结果**：展开的属性全部丢失，组件或元素缺少本应传入的 props/attrs。
- **建议**：在 props/attrs 构建处识别 JsxSpreadAttribute，用 Object.assign
  或展开运算合并进最终 props 对象（需注意顺序：先 spread 再具名属性覆盖）。

### 3.4 表达式中的 Fragment（`<>...</>`）

- **写法**：`{ show ? <>...</> : <Fallback /> }`。
- **原因**：`transformExpressionJsxToCalls` 只处理
  JsxElement、JsxSelfClosingElement 及三元/逻辑/括号/类型断言，未处理
  JsxFragment。
- **结果**：Fragment 保持为原始 JSX 输出，经 esbuild 后变成
  createElement(Fragment, ...)，得到 VNode，insertReactive 可能异常或仅占位。
- **建议**：在表达式中对 JsxFragment 生成「创建 DocumentFragment + 对 children
  递归 buildChildStatements + 挂到 parent」的 MountFn 形态，或返回一个
  (parent)=>... 的合成函数供 insertReactive 调用。

### 3.5 表达式中的内置元素

- **写法**：`{ cond ? <div>a</div> : <span>b</span> }`。
- **原因**：`transformExpressionJsxToCalls` 对「组件」才转为
  `Comp(props)`，对内置标签直接 `return expr`，不生成 createElement 逻辑。
- **结果**：输出仍含该 JSX，esbuild 转为 createElement，得到 VNode；若未在
  toNodeForInsert 等路径处理，易出现占位或告警。
- **建议**：要么在表达式中也支持内置元素（生成 createElement + append 的
  MountFn），要么在运行时对 VNode 做兜底（当前已有部分兜底与报错）。

### 3.6 多个 return 或复杂控制流

- **写法**：`if (a) return <A/>; if (b) return <B/>; return <C/>;`
- **现状**：每个 `return <jsx>` 都会被替换成
  `return (parent)=>...`，语法正确，但只有**第一个被执行到的 return**
  会生效（与原生 JS 一致）。
- **说明**：无额外缺口，仅需注意逻辑分支与预期一致。

### 3.7 合成节点上调用 getText()

- **写法**：任意在「嵌套 return 被替换后」参与构建的 AST 节点（如 `.map` 的
  CallExpression）。
- **原因**：替换后部分节点由 factory 创建，无
  sourceFile，`(expr as ts.Node).getText?.()` 内部访问 `sourceFile.text`
  会抛错。
- **现状**：已在 buildChildStatements 的 JsxExpression 分支中，对无 sourceFile
  的节点避免调用 getText（仅在有 sourceFile 且 trim 为空时跳过）。
- **说明**：已修复；若其它路径对合成节点调用 getText，需同样加 sourceFile 判断。

### 3.8 key / 列表稳定性

- **写法**：`list.map((x) => <div key={x.id}>...</div>)`。
- **现状**：key 作为普通 prop 传入组件；对内置元素会 setAttribute("key",
  value)，DOM 无 key 语义。
- **说明**：编译器/运行时未做基于 key 的复用或
  reorder，列表更新为「整段替换」；若需稳定
  identity，需用户侧保证结构或后续引入显式 key 处理。

### 3.9 未经过 compileSource 的模块

- **场景**：某 .tsx 未被 esbuild plugin 的 onLoad 用 compileSource
  处理（例如未走 deno-file-tsx、或路径未被包含）。
- **结果**：该文件中 JSX 保持 createElement 形态，运行时为
  VNode，易触发「组件可能未走编译」。
- **说明**：属构建/插件配置问题，需保证所有需编译的 .tsx 都经 compileSource。

---

## 四、按「用户写法」的速查表

| 用户写法                                     | 是否支持 | 备注                                               |
| -------------------------------------------- | -------- | -------------------------------------------------- |
| `return <div/>` / `return ( <App/> )`        | ✅       | 根 MountFn                                         |
| `return condition ? <A/> : <B/>`             | ❌       | 见 3.1                                             |
| `return list.map(() => <li/>)`（无外层包装） | ❌       | 见 3.1                                             |
| `const C = () => ( <div/> );`                | ✅       | 返回 MountFn                                       |
| `list.map((x) => { return <li>{x}</li>; })`  | ✅       | 嵌套 return 转 MountFn，数组由 insertReactive 处理 |
| `{ isDark ? <SunIcon /> : <MoonIcon /> }`    | ✅       | 表达式内组件转 Comp(props)                         |
| `{ show && <Modal /> }`、`{ x ?? <Def /> }`  | ✅       | 同上                                               |
| `{ show ? <>...</> : <Fallback /> }`         | ❌       | 见 3.4 Fragment                                    |
| `{ cond ? <div>a</div> : <span>b</span> }`   | ⚠️       | 见 3.5，输出仍含 JSX/VNode                         |
| `<Foo.Bar />`、`<Layout.Header />`           | ✅       | 见 3.2（已支持 PropertyAccessExpression）          |
| `<Comp {...props} />`、`<div {...attrs} />`  | ❌       | 见 3.3 spread 被忽略                               |
| `<>...</>` 作为顶层或子节点                  | ✅       | Fragment 直接展开子节点                            |
| `<ErrorBoundary><Child/></ErrorBoundary>`    | ✅       | children 为 mount 函数                             |
| `vIf` / `v-show` / ref / onClick / style     | ✅       | 见第二节                                           |
| 多个 `return <jsx>` 分支                     | ✅       | 仅第一个执行到的生效                               |

---

## 五、建议的后续增强（优先级供参考）

1. **高**：根 return 为「含 JSX 的表达式」时（如
   `return cond ? <A/> : <B/>`），生成
   `(parent) => { insertReactive(parent, () => transformExpressionJsxToCalls(expr)); }`。
2. **已做**：`tagNameToExpression` 已支持
   PropertyAccessExpression（`<Foo.Bar />`）。
3. **中**：props/attrs 中支持 JsxSpreadAttribute（Object.assign 或展开合并）。
4. **中**：表达式中的 JsxFragment 转为 MountFn（或等效的 insert 逻辑）。
5. **低**：表达式中的内置元素也编译为 createElement + append 的 MountFn，减少
   VNode 路径。
6. **低**：key 的显式处理（若将来做列表复用/reorder）；ElementAccessExpression
   标签（如 `<Comp[tagName] />`）可选支持。

---

## 六、与构建链的配合

- **谁调用 compileSource**：通常由 esbuild 的 resolver + onLoad（如
  deno-file-tsx）在解析到 .tsx 时调用。
- **确保覆盖**：布局、路由入口、首页、以及所有被引用到的 .tsx 都应走同一套
  compileSource；相对路径、别名、namespace 需在 resolver 中统一为「可解析到 .tsx
  并返回 deno-file-tsx」。
- **单测**：`view/tests/unit/jsx-compiler.test.ts` 覆盖根
  return、箭头组件、三元内组件、.map 回调等；新增写法可在该处加用例防回归。

以上为当前编译器的全面能力与缺口分析；实现上述「建议增强」后可进一步减少「编译不了」和运行时异常。
