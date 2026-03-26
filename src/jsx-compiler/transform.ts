/**
 * JSX 编译器实现：将 TSX 中的 JSX 转为对 `insert` / `document.createElement` / `insertReactive` 等的运行时调用 AST。
 *
 * **规则概要：**
 * - 内置元素 `<div>` → `createElement` + `appendChild`，子节点递归
 * - 组件 `<Comp />` → 执行 `Comp(props)`，再 `insert(parent, getter | () => value)`；**`For` / `Index`** 子节点按 render prop 展开，`each={expr}` 编译为 `each: () => expr`；**`Show`** 的 `when={expr}` 编译为 `when: () => expr`；**`Switch`** 将子级 **`<Match when={expr}>`** 展开为 `matches: [{ when: () => expr, … }, …]`；**`Dynamic`** 的 `component={expr}` 编译为 `component: () => expr`（见 {@link buildListRenderStmts}、{@link buildShowStmts}、{@link buildSwitchStmts}、{@link buildDynamicStmts}）
 * - `{ expr }` → 若源码判定为静态（纯本征 JSX、字面量等）则 `insert(parent, expr)`，否则 `insertReactive(parent, () => expr)`（步骤 4 MVP）；**字面量间** `===` / `!==`、**纯数字算术**、**字符串字面量 `+` 拼接** `"a"+"b" === "ab"`、**数字关系运算** `1 < 2`、**仅与 null/undefined 的** `==` / `!=`、**`typeof` 字面量** 等参与编译期真值判定，使 `1 === 1 ? <a/> : <b/>`、`(1+1) && <x/>` 等可在编译期折叠死分支；**不**折叠一般 `==`（避免 `1 == true` 误判）；**可选链** `?.map` / `?.flatMap` / `?.filter`（含 `?.['map']`）在表达式树（含 `&&` / `||` / `??`、三元、一般调用实参、**表达式体** `.map` 回调、**块体**内 `return`/`if`/`for`/`switch`/`try`、**块内 `const f = () => sub?.map`** 等）内自动包 `coalesceIrList`（与列表回调内局部渲染函数的常见写法一致）
 * - 文本 → `insert(parent, text)`
 *
 * **内置指令：** v-if / v-else-if / v-else（兄弟链）、v-once（`untrack`）、v-cloak（`data-view-cloak`）、**vSlotGetter**（任意自定义组件将 children 编译为 `() => slot`，与 Suspense/ErrorBoundary 运行时约定一致）等；显隐可用 **`vIf`** 或 **`<Show>`**；多路分支用 **`<Switch>` / `<Match>`**；**`<Dynamic>`** 的 `component={expr}` 包 accessor（见 {@link buildDynamicStmts}）。根级 **`insertReactive(parent, () => …)`** 若经 {@link peelToFragmentRoot} 可剥出 **`<></>`**（含 **`"" + (<>…</>)`**、逗号表达式最右段等）且含可证的 **静态子 + 动态子**，则拆成 **`insert`（静态段）+ `insertReactive`（动态段）**（见 {@link trySplitFragReactive}）；若经 {@link tryUnwrapStaticJsxRoot} 得 **本征根**（如 **`"" + <div>…</div>`**），则 **`insert(parent, jsxToRuntimeFunction(根))`**，在 **元素子级** 内继续做 insert / insertReactive 分段（见 {@link tryIntrinsicRootInserts}）。**compileSource** 对函数体维护 **createSignal 绑定栈**（见 {@link collectScopedSignalsAndShadows}），在 {@link buildChildStatements} / Fragment 拆分中经 {@link jsxExpressionMayHoistToInsertWithDeps} 放宽「仅字面量才静态」的限制。
 * 自定义 `registerDirective` 与运行时指令仍见 `@dreamer/view/directive`。
 *
 * @module @dreamer/view/jsx-compiler/transform
 * @internal 由 `@dreamer/view/jsx-compiler` 聚合导出 `compileSource` / `jsxToRuntimeFunction`，构建请依赖该入口
 */

import ts from "typescript";

import { collectSlotGetterTagLocalsFromImports } from "./boundary-slot-imports.ts";
import {
  collectScopedSignalsAndShadows,
  jsxExpressionMayHoistToInsertWithDeps,
} from "./dependency-graph.ts";

const factory = ts.factory;

/**
 * 编译生成的「挂到父 DOM」挂载函数形参名（如 `(here) => { here.appendChild(...) }`）。
 * 若与组件根 `return (parent) => { ... }` 同名 `parent`，在嵌套场景下（Suspense + Promise.then 内 JSX
 * 会再生成内层挂载箭头）部分工具链可能把内层函数体里的 `parent` 误解析为外层形参，导致内层
 * `appendChild` 收到 undefined/null。根挂载与 v-if 分支挂载箭头须与此一致。
 */
const JSX_MOUNT_FN_PARENT_PARAM = "__viewMountParent";

let varCounter = 0;

/**
 * compileSource 单次 transform 期间有效：从当前文件 import 解析出的「应以无参 getter 传 children」的 JSX 标签本地名。
 * 嵌套的 jsxToRuntimeFunction / transformExpressionJsxToCalls 共用此集合；非 compileSource 调用时为 undefined，回退标签名启发式。
 */
let slotGetterTagLocalsForCurrentCompile: ReadonlySet<string> | undefined =
  undefined;

/**
 * compileSource 单次 transform 期间有效：函数嵌套栈，栈顶为当前函数体可见的 **createSignal 绑定名**（已处理块内遮蔽）。
 * 供 {@link jsxToRuntimeFunction}、{@link jsxChildIsFullyStaticForFragmentHoist}、{@link buildChildStatements} 做 insert 提升判定。
 */
let reactiveBindingsStackForCompile: Set<string>[] = [];

/**
 * 返回当前编译作用域的响应式绑定集合；栈空（如直接调用 {@link jsxToRuntimeFunction} 非经 compileSource）时返回 `undefined`。
 */
function getCurrentReactiveBindingsForCompile():
  | ReadonlySet<string>
  | undefined {
  if (reactiveBindingsStackForCompile.length === 0) return undefined;
  return reactiveBindingsStackForCompile[
    reactiveBindingsStackForCompile.length - 1
  ]!;
}

function nextVar(): string {
  return `_${varCounter++}`;
}

function resetVarCounter(): void {
  varCounter = 0;
}

/**
 * 从源码安全取节点文本：优先 slice(pos,end)，避免对无 real position 的节点调用 getText()
 * （TS 5.9+ 会 assertHasRealPosition，如 JSX 中箭头函数属性 `fallback={(err) => <p/>}`）。
 */
function safeNodeText(node: ts.Node): string {
  const sf = node.getSourceFile?.();
  if (!sf) return "";
  if (node.pos >= 0 && node.end <= sf.text.length) {
    return sf.text.slice(node.pos, node.end);
  }
  try {
    return node.getText(sf);
  } catch {
    return "";
  }
}

/** 是否为内置 HTML 标签（小写或含连字符），否则视为组件 */
function isIntrinsicElement(tagName: string): boolean {
  if (tagName.length === 0) return false;
  return tagName[0] === tagName[0].toLowerCase() || tagName.includes("-");
}

/** SVG 命名空间 URI；编译产物中 <svg>/<path> 等须用 createElementNS 才能在浏览器中正确渲染 */
const SVG_NS_COMPILER = "http://www.w3.org/2000/svg";

/** 需用 createElementNS(SVG_NS, tag) 创建的内置标签（与 vnode-mount 的 SVG_TAG_NAMES 对齐） */
const SVG_TAG_NAMES_COMPILER = new Set([
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "defs",
  "g",
  "use",
  "clipPath",
  "pattern",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "text",
  "tspan",
  "image",
  "title",
  "desc",
]);

function isSvgTag(tagName: string): boolean {
  return SVG_TAG_NAMES_COMPILER.has(tagName.toLowerCase());
}

/**
 * 将 JsxTagNameExpression 转为可调用的 Expression（组件引用）。
 * 支持：Identifier、JsxNamespacedName（ns:Comp）、PropertyAccessExpression（Foo.Bar），否则 fallback 为 getText。
 */
function tagNameToExpression(tag: ts.JsxTagNameExpression): ts.Expression {
  if (ts.isIdentifier(tag)) return tag;
  if (ts.isJsxNamespacedName(tag)) {
    const nsText = ts.isIdentifier(tag.namespace)
      ? tag.namespace.text
      : safeNodeText(tag.namespace);
    const nameText = ts.isIdentifier(tag.name)
      ? tag.name.text
      : safeNodeText(tag.name);
    return factory.createPropertyAccessExpression(
      factory.createIdentifier(nsText),
      factory.createIdentifier(nameText),
    );
  }
  if (ts.isPropertyAccessExpression(tag)) return tag;
  return factory.createIdentifier(safeNodeText(tag as ts.Node));
}

/** 将 onXxx 转为 DOM 事件名（全小写），如 onClick -> click、onMouseDown -> mousedown */
function eventNameFromProp(name: string): string {
  if (name.length <= 2) return name.toLowerCase();
  return name.slice(2).toLowerCase();
}

/** 已知布尔型 HTML 属性，编译为 el.prop = !!val，避免 setAttribute 歧义 */
const BOOLEAN_ATTRS = new Set([
  "disabled",
  "checked",
  "hidden",
  "readOnly",
  "readonly",
  "selected",
  "multiple",
  "autofocus",
  "contentEditable",
  "draggable",
  "spellCheck",
]);

/** 3.3 从 attributes 中取出 v-if 条件表达式，无则返回 null */
function getVIfCondition(attrs: ts.JsxAttributes): ts.Expression | null {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name !== "vIf" && name !== "v-if") continue;
    if (!prop.initializer) return factory.createTrue();
    if (ts.isJsxExpression(prop.initializer)) {
      const expr = prop.initializer.expression;
      if (!expr || safeNodeText(expr as ts.Node).trim() === "") {
        return factory.createTrue();
      }
      return expr as ts.Expression;
    }
    return factory.createTrue();
  }
  return null;
}

/** 编译产物生成上下文：insert/createEffect/untrack 标识符与 v-once 子树；自定义指令需 applyDirectives/registerDirectiveUnmount；函数 ref 需 scheduleFunctionRef */
type EmitContext = {
  insertId: ts.Identifier;
  insertReactiveId: ts.Identifier;
  createEffectId: ts.Identifier;
  untrackId: ts.Identifier;
  /** 编译产物用 getActiveDocument().createElement/createTextNode，浏览器内 renderToString 可不替换 window.document */
  getActiveDocumentId: ts.Identifier;
  /** mount 内复用的 document 变量（4.2 产物优化：避免重复 getActiveDocument() 调用） */
  docId: ts.Identifier;
  inOnceSubtree: boolean;
  applyDirectivesId: ts.Identifier;
  registerDirectiveUnmountId: ts.Identifier;
  scheduleFunctionRefId: ts.Identifier;
  /**
   * 当前文件从 boundary 解析出的本地标签名；为 undefined 时表示未跑 import 扫描或非 compileSource 场景，配合标签名回退。
   */
  slotGetterTagLocals: ReadonlySet<string> | undefined;
  /**
   * 函数级 createSignal 绑定名（含外层穿透、内层遮蔽后）；`undefined` 时不做依赖图放宽，仅走字面量静态判定。
   */
  reactiveBindings: ReadonlySet<string> | undefined;
};

/** v-if → v-else-if* → v-else? 兄弟链的一支 */
type IfChainBranch = {
  kind: "if" | "elseIf" | "else";
  cond: ts.Expression | null;
  node: ts.JsxElement | ts.JsxSelfClosingElement;
};

/** 是否带有 vIf / v-if（含无值视为 true） */
function hasVIfAttribute(attrs: ts.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vIf" || name === "v-if") return true;
  }
  return false;
}

/** 3.3 v-else-if 条件表达式，无属性则返回 null */
function getVElseIfCondition(attrs: ts.JsxAttributes): ts.Expression | null {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name !== "vElseIf" && name !== "v-else-if") continue;
    if (!prop.initializer) return factory.createTrue();
    if (ts.isJsxExpression(prop.initializer)) {
      const expr = prop.initializer.expression;
      if (!expr || safeNodeText(expr as ts.Node).trim() === "") {
        return factory.createTrue();
      }
      return expr as ts.Expression;
    }
    return factory.createTrue();
  }
  return null;
}

/** 是否带有 vElseIf / v-else-if */
function hasVElseIfAttribute(attrs: ts.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vElseIf" || name === "v-else-if") return true;
  }
  return false;
}

/** 是否带有 vElse / v-else（布尔指令，无值亦视为存在） */
function hasVElseAttribute(attrs: ts.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vElse" || name === "v-else") return true;
  }
  return false;
}

/** v-once：子树内 signal 读取不建立长期订阅（untrack） */
function hasVOnceAttribute(attrs: ts.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vOnce" || name === "v-once") return true;
  }
  return false;
}

/** v-cloak：首屏隐藏，createRoot 后 removeCloak 移除 data-view-cloak */
function hasVCloakAttribute(attrs: ts.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vCloak" || name === "v-cloak") return true;
  }
  return false;
}

/**
 * vSlotGetter / v-slot-getter：任意**自定义组件**上声明后，子节点按 `() => slot` 编译（与 Suspense/ErrorBoundary 默认形态一致）。
 * 用于用户自写边界类组件，无需修改编译器常量。
 */
function hasVSlotGetterAttribute(attrs: ts.JsxAttributes): boolean {
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vSlotGetter" || name === "v-slot-getter") return true;
  }
  return false;
}

/**
 * 是否将组件 children 编译为无参 getter：显式 vSlotGetter、或从 boundary 模块 import 解析到的绑定、或非 compileSource 场景下标签名为 Suspense/ErrorBoundary。
 */
function shouldCompileComponentChildrenAsSlotGetter(
  attrs: ts.JsxAttributes,
  tagNameStr: string,
  ctx: EmitContext,
): boolean {
  if (hasVSlotGetterAttribute(attrs)) return true;
  if (
    ctx.slotGetterTagLocals != null && ctx.slotGetterTagLocals.has(tagNameStr)
  ) {
    return true;
  }
  if (ctx.slotGetterTagLocals == null) {
    return tagNameStr === "Suspense" || tagNameStr === "ErrorBoundary";
  }
  return false;
}

function jsxChildToTagNode(
  child: ts.JsxChild,
): ts.JsxElement | ts.JsxSelfClosingElement | null {
  if (ts.isJsxElement(child)) return child;
  if (ts.isJsxSelfClosingElement(child)) return child;
  return null;
}

/** 从 start 起跳过仅空白 JsxText，返回下一有意义子节点下标（可等于 length） */
function skipWhitespaceChildIndex(
  children: readonly ts.JsxChild[],
  start: number,
): number {
  let j = start;
  while (j < children.length && isWhitespaceOnlyJsxText(children[j]!)) j++;
  return j;
}

/**
 * 自 children[start] 解析 v-if → v-else-if* → v-else? 兄弟链；首节点须带 v-if。
 *
 * @returns 分支列表与链结束后的下一索引（供外层顺序扫描）
 */
function tryParseIfChain(
  children: readonly ts.JsxChild[],
  start: number,
): { branches: IfChainBranch[]; endExclusive: number } | null {
  const i0 = skipWhitespaceChildIndex(children, start);
  if (i0 >= children.length) return null;
  const first = jsxChildToTagNode(children[i0]!);
  if (!first) return null;
  const open0 = ts.isJsxSelfClosingElement(first)
    ? first
    : first.openingElement;
  if (getVIfCondition(open0.attributes) === null) return null;

  const branches: IfChainBranch[] = [];
  let i = i0;
  branches.push({
    kind: "if",
    cond: getVIfCondition(open0.attributes),
    node: first,
  });
  i = skipWhitespaceChildIndex(children, i + 1);

  while (i < children.length) {
    const ch = children[i]!;
    if (isWhitespaceOnlyJsxText(ch)) {
      i++;
      continue;
    }
    const tag = jsxChildToTagNode(ch);
    if (!tag) break;
    const op = ts.isJsxSelfClosingElement(tag) ? tag : tag.openingElement;
    const attrs = op.attributes;
    if (getVIfCondition(attrs) !== null) break;
    const elseIfCond = getVElseIfCondition(attrs);
    if (elseIfCond !== null) {
      branches.push({ kind: "elseIf", cond: elseIfCond, node: tag });
      i = skipWhitespaceChildIndex(children, i + 1);
      continue;
    }
    if (hasVElseAttribute(attrs)) {
      branches.push({ kind: "else", cond: null, node: tag });
      i = skipWhitespaceChildIndex(children, i + 1);
      break;
    }
    break;
  }
  return { branches, endExclusive: i };
}

/**
 * v-once 子树内将表达式包一层 untrack(() => expr)，使 insertReactive 的 getter 不订阅 signal。
 */
function wrapExprInUntrackIfOnce(
  expr: ts.Expression,
  ctx: EmitContext,
): ts.Expression {
  if (!ctx.inOnceSubtree) return expr;
  return factory.createCallExpression(ctx.untrackId, undefined, [
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      expr,
    ),
  ]);
}

/**
 * 在元素已 appendChild 到父节点后执行 ref；先于 applyDirectives，便于指令与 ref 协同。
 * 函数 ref 经 scheduleFunctionRef：在微任务中重试直到 el.isConnected，避免 layout 插槽、根级先清子树等时序下 ref 指向未接入 document 的节点。
 * 卸载时登记 ref(null)，避免 replaceChildren/removeChild 后 ref 仍指向已脱离文档的节点。
 */
function buildRefStatementsAfterAppend(
  elVar: string,
  attrs: ts.JsxAttributes,
  ctx: EmitContext,
): ts.Statement[] {
  const out: ts.Statement[] = [];
  const registerUnmountId = ctx.registerDirectiveUnmountId;
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name !== "ref" || !prop.initializer) continue;
    if (ts.isStringLiteral(prop.initializer)) continue;
    if (!ts.isJsxExpression(prop.initializer)) continue;
    const expr = prop.initializer.expression;
    const isEmpty = !expr || safeNodeText(expr as ts.Node).trim() === "";
    if (isEmpty) continue;
    const exprNode = expr as ts.Expression;
    const refExprWrapped = factory.createParenthesizedExpression(exprNode);
    // ref 处理：函数 ref 调用 ref(el)，对象 ref 设置 ref.current = el
    // 同时为函数 ref 注册清理回调，在节点移除时调用 ref(null)
    const refIsFunctionVar = nextVar();
    out.push(
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              refIsFunctionVar,
              undefined,
              undefined,
              factory.createBinaryExpression(
                factory.createTypeOfExpression(refExprWrapped),
                factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                factory.createStringLiteral("function"),
              ),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      ),
    );
    // 函数 ref：由 scheduleFunctionRef 先 ref(null) 再在微任务中重试直到 el.isConnected。
    // 对象 ref（createRef）：同样经 scheduleFunctionRef，用 (_n) => ref.current = _n 包装。
    // 若仅在 append 时判断 el.isConnected，Hybrid / 嵌套 insertReactive 下节点常尚未接入 document，ref.current 会永久为 null（dweb 路由页典型）。
    // 卸载时仍由下方 registerDirectiveUnmount 将 ref.current = null，避免悬空节点。
    const scheduleFunctionRefId = ctx.scheduleFunctionRefId;
    const objectRefNodeParam = factory.createUniqueName("_viewRefNode");
    const refSetStmts: ts.Statement[] = [
      factory.createIfStatement(
        factory.createIdentifier(refIsFunctionVar),
        factory.createBlock(
          [
            factory.createExpressionStatement(
              factory.createCallExpression(scheduleFunctionRefId, undefined, [
                factory.createIdentifier(elVar),
                exprNode,
              ]),
            ),
          ],
          true,
        ),
        factory.createBlock(
          [
            factory.createExpressionStatement(
              factory.createCallExpression(scheduleFunctionRefId, undefined, [
                factory.createIdentifier(elVar),
                factory.createArrowFunction(
                  undefined,
                  undefined,
                  [
                    factory.createParameterDeclaration(
                      undefined,
                      undefined,
                      objectRefNodeParam,
                      undefined,
                      undefined,
                      undefined,
                    ),
                  ],
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  factory.createParenthesizedExpression(
                    factory.createBinaryExpression(
                      factory.createPropertyAccessExpression(
                        refExprWrapped,
                        factory.createIdentifier("current"),
                      ),
                      factory.createToken(ts.SyntaxKind.EqualsToken),
                      objectRefNodeParam,
                    ),
                  ),
                ),
              ]),
            ),
          ],
          true,
        ),
      ),
    ];
    out.push(
      factory.createIfStatement(
        factory.createBinaryExpression(
          refExprWrapped,
          factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
          factory.createNull(),
        ),
        factory.createBlock(refSetStmts, true),
        undefined,
      ),
    );
    // 函数 ref：节点移除时调用 ref(null)；对象 ref：节点移除时设置 ref.current = null，避免悬空引用
    out.push(
      factory.createIfStatement(
        factory.createIdentifier(refIsFunctionVar),
        factory.createBlock([
          factory.createExpressionStatement(
            factory.createCallExpression(registerUnmountId, undefined, [
              factory.createIdentifier(elVar),
              factory.createArrowFunction(
                undefined,
                undefined,
                [],
                undefined,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                factory.createCallExpression(exprNode, undefined, [
                  factory.createNull(),
                ]),
              ),
            ]),
          ),
        ], true),
        factory.createBlock([
          factory.createExpressionStatement(
            factory.createCallExpression(registerUnmountId, undefined, [
              factory.createIdentifier(elVar),
              factory.createArrowFunction(
                undefined,
                undefined,
                [],
                undefined,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                factory.createBlock(
                  [
                    factory.createExpressionStatement(
                      factory.createBinaryExpression(
                        factory.createPropertyAccessExpression(
                          refExprWrapped,
                          factory.createIdentifier("current"),
                        ),
                        factory.createToken(ts.SyntaxKind.EqualsToken),
                        factory.createNull(),
                      ),
                    ),
                  ],
                  true,
                ),
              ),
            ]),
          ),
        ], true),
      ),
    );
  }
  return out;
}

/**
 * JSX 属性名 → `setAttribute` 第一个参数（与 React DOM 一致：`htmlFor` 映射为 `for`）。
 *
 * @param jsxAttrName - JSX 上的属性名（如 htmlFor、className）
 * @returns 写入 DOM 的属性名
 */
function domAttrNameForSetAttribute(jsxAttrName: string): string {
  if (jsxAttrName === "htmlFor") return "for";
  return jsxAttrName;
}

/**
 * 响应式 style 属性：在 createEffect 内求值的对象表达式（与 value/checked 的 valueExpr 一致）。
 *
 * @param exprNode - `style={…}` 的 JSX 表达式
 */
function buildReactiveStyleValueReadExpr(
  exprNode: ts.Expression,
): ts.Expression {
  if (ts.isArrowFunction(exprNode) || ts.isFunctionExpression(exprNode)) {
    return factory.createCallExpression(exprNode, undefined, []);
  }
  return factory.createConditionalExpression(
    factory.createBinaryExpression(
      factory.createTypeOfExpression(exprNode),
      factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
      factory.createStringLiteral("function"),
    ),
    undefined,
    factory.createCallExpression(exprNode, undefined, []),
    undefined,
    factory.createCallExpression(
      factory.createIdentifier("unwrapSignalGetterValue"),
      undefined,
      [exprNode],
    ),
  );
}

/**
 * 本征 DOM 属性值是否与 `value` / `checked` / 动态 `style` 同类「可订阅」形态：
 * 标识符、属性链、`a[b]`、无参箭头/函数字面量。此类值在 mount 时单次求值无法随 signal 更新，须包在 `createEffect` 内调用 `setIntrinsicDomAttribute`。
 *
 * @param expr - `className={…}` 或通用本征属性 JSX 表达式
 */
function isIntrinsicDomAttrValueReactiveShape(expr: ts.Expression): boolean {
  return (
    ts.isIdentifier(expr) ||
    ts.isPropertyAccessExpression(expr) ||
    ts.isElementAccessExpression(expr) ||
    ((ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) &&
      expr.parameters.length === 0)
  );
}

/**
 * 生成本征属性写入：对「可订阅形态」走 `createEffect(() => setIntrinsicDomAttribute(...))`（v-once 子树内用 `untrack` 包一层，与 value/checked 一致）；否则保持 mount 时单次调用。
 *
 * @param stmts - 追加目标语句列表
 * @param elVar - 元素临时变量名
 * @param domAttrName - 传入 `setIntrinsicDomAttribute` 的 DOM 属性名（如 `class`、`for`）
 * @param valueExpr - 属性值表达式（已变换后的 AST）
 * @param ctx - 发射上下文（含 createEffect / untrack）
 */
function pushSetIntrinsicDomAttributeEffectOrMountStmt(
  stmts: ts.Statement[],
  elVar: string,
  domAttrName: string,
  valueExpr: ts.Expression,
  ctx: EmitContext,
): void {
  const createEffectId = ctx.createEffectId;
  const callExpr = factory.createCallExpression(
    factory.createIdentifier("setIntrinsicDomAttribute"),
    undefined,
    [
      factory.createIdentifier(elVar),
      factory.createStringLiteral(domAttrName),
      valueExpr,
    ],
  );
  if (!isIntrinsicDomAttrValueReactiveShape(valueExpr)) {
    stmts.push(factory.createExpressionStatement(callExpr));
    return;
  }
  const effectInner = ctx.inOnceSubtree
    ? factory.createCallExpression(ctx.untrackId, undefined, [
      factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        callExpr,
      ),
    ])
    : callExpr;
  stmts.push(
    factory.createExpressionStatement(
      factory.createCallExpression(createEffectId, undefined, [
        factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          effectInner,
        ),
      ]),
    ),
  );
}

/**
 * 将 JSX 属性转为对 element 的赋值、setAttribute、addEventListener、ref 等。
 * 1.1 事件：on* → addEventListener；1.2 ref 在 appendChild 后由 buildRefStatementsAfterAppend 处理；
 * 3.5 v-else / v-else-if / v-once / v-cloak 等指令名不写 DOM（cloak 由元素级 setAttribute data-view-cloak 处理）
 */
function buildAttributeStatements(
  elVar: string,
  attrs: ts.JsxAttributes,
  ctx: EmitContext,
): ts.Statement[] {
  const createEffectId = ctx.createEffectId;
  const stmts: ts.Statement[] = [];
  for (const prop of attrs.properties) {
    if (ts.isJsxSpreadAttribute(prop)) {
      stmts.push(
        factory.createExpressionStatement(
          factory.createCallExpression(
            factory.createIdentifier("spreadIntrinsicProps"),
            undefined,
            [
              factory.createIdentifier(elVar),
              prop.expression,
            ],
          ),
        ),
      );
      continue;
    }
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "vIf" || name === "v-if") continue;
    if (name === "vElse" || name === "v-else") continue;
    if (name === "vElseIf" || name === "v-else-if") continue;
    if (name === "vOnce" || name === "v-once") continue;
    if (name === "vCloak" || name === "v-cloak") continue;
    // React/Vue 式 key 仅用于协调，不写 DOM attribute
    if (name === "key") continue;
    // 自定义指令（vFocus、vCopy 等）交给 applyDirectives，不写 setAttribute
    if (isCustomDirectivePropName(name)) continue;
    // ref 在 appendChild 之后执行（见 buildRefStatementsAfterAppend），保证 isConnected 与指令 mounted 顺序正确
    if (name === "ref") continue;
    const isEvent = name.startsWith("on") && name.length > 2;
    if (prop.initializer) {
      if (ts.isStringLiteral(prop.initializer)) {
        const val = prop.initializer.text;
        if (name === "className") {
          stmts.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createPropertyAccessExpression(
                  factory.createIdentifier(elVar),
                  "setAttribute",
                ),
                undefined,
                [
                  factory.createStringLiteral("class"),
                  factory.createStringLiteral(val),
                ],
              ),
            ),
          );
        } else if (!isEvent && name !== "ref") {
          stmts.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createPropertyAccessExpression(
                  factory.createIdentifier(elVar),
                  "setAttribute",
                ),
                undefined,
                [
                  factory.createStringLiteral(domAttrNameForSetAttribute(name)),
                  factory.createStringLiteral(val),
                ],
              ),
            ),
          );
        }
      } else if (ts.isJsxExpression(prop.initializer)) {
        const expr = prop.initializer.expression;
        const isEmpty = !expr || safeNodeText(expr as ts.Node).trim() === "";
        if (!isEmpty) {
          const exprNode = expr as ts.Expression;
          if (isEvent) {
            const eventName = eventNameFromProp(name);
            stmts.push(
              factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier(elVar),
                    "addEventListener",
                  ),
                  undefined,
                  [
                    factory.createStringLiteral(eventName),
                    exprNode,
                  ],
                ),
              ),
            );
          } else if (name === "style") {
            /**
             * 动态 style：无参箭头 / createMemo 标识符 / 属性访问等须走 createEffect，与手写 vnode-mount 的 bindIntrinsicReactiveDomProps 一致。
             * 历史实现 `Object.assign(el.style, expr)` 在 expr 为函数时会把函数赋给 style，缩放等永不生效。
             */
            const styleCanBeReactive = ts.isIdentifier(exprNode) ||
              ts.isPropertyAccessExpression(exprNode) ||
              ts.isElementAccessExpression(exprNode) ||
              ((ts.isArrowFunction(exprNode) ||
                ts.isFunctionExpression(exprNode)) &&
                exprNode.parameters.length === 0);
            if (styleCanBeReactive) {
              const styleObjVar = "__viewStyleObj";
              const readExpr = buildReactiveStyleValueReadExpr(exprNode);
              const decl = factory.createVariableStatement(
                undefined,
                factory.createVariableDeclarationList(
                  [
                    factory.createVariableDeclaration(
                      factory.createIdentifier(styleObjVar),
                      undefined,
                      undefined,
                      readExpr,
                    ),
                  ],
                  ts.NodeFlags.Const,
                ),
              );
              const guard = factory.createIfStatement(
                factory.createBinaryExpression(
                  factory.createBinaryExpression(
                    factory.createBinaryExpression(
                      factory.createIdentifier(styleObjVar),
                      factory.createToken(
                        ts.SyntaxKind.EqualsEqualsEqualsToken,
                      ),
                      factory.createNull(),
                    ),
                    factory.createToken(ts.SyntaxKind.BarBarToken),
                    factory.createBinaryExpression(
                      factory.createTypeOfExpression(
                        factory.createIdentifier(styleObjVar),
                      ),
                      factory.createToken(
                        ts.SyntaxKind.ExclamationEqualsEqualsToken,
                      ),
                      factory.createStringLiteral("object"),
                    ),
                  ),
                  factory.createToken(ts.SyntaxKind.BarBarToken),
                  factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                      factory.createIdentifier("Array"),
                      "isArray",
                    ),
                    undefined,
                    [factory.createIdentifier(styleObjVar)],
                  ),
                ),
                factory.createReturnStatement(),
                undefined,
              );
              const removeAttr = factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier(elVar),
                    "removeAttribute",
                  ),
                  undefined,
                  [factory.createStringLiteral("style")],
                ),
              );
              const assignStyle = factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier("Object"),
                    "assign",
                  ),
                  undefined,
                  [
                    factory.createPropertyAccessExpression(
                      factory.createIdentifier(elVar),
                      "style",
                    ),
                    factory.createIdentifier(styleObjVar),
                  ],
                ),
              );
              const assignBlock = factory.createBlock(
                [decl, guard, removeAttr, assignStyle],
                true,
              );
              const rootEffectArrow = ctx.inOnceSubtree
                ? factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  factory.createCallExpression(ctx.untrackId, undefined, [
                    factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      factory.createToken(
                        ts.SyntaxKind.EqualsGreaterThanToken,
                      ),
                      assignBlock,
                    ),
                  ]),
                )
                : factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  assignBlock,
                );
              stmts.push(
                factory.createExpressionStatement(
                  factory.createCallExpression(createEffectId, undefined, [
                    rootEffectArrow,
                  ]),
                ),
              );
            } else {
              stmts.push(
                factory.createExpressionStatement(
                  factory.createCallExpression(
                    factory.createPropertyAccessExpression(
                      factory.createIdentifier("Object"),
                      "assign",
                    ),
                    undefined,
                    [
                      factory.createPropertyAccessExpression(
                        factory.createIdentifier(elVar),
                        "style",
                      ),
                      exprNode,
                    ],
                  ),
                ),
              );
            }
          } else if (
            (name === "value" || name === "checked") &&
            (ts.isIdentifier(exprNode) ||
              ts.isArrowFunction(exprNode) ||
              ts.isFunctionExpression(exprNode) ||
              // props.value / state.x 等为 PropertyAccess：若走 setAttribute，会把 getter 转成超长字符串（如密码框满屏点）且与 signal 真值脱节。
              ts.isPropertyAccessExpression(exprNode) ||
              ts.isElementAccessExpression(exprNode))
          ) {
            // value/checked 常为 getter（如 createSignal）：直接 setAttribute 会变成字符串化函数源码；用 createEffect 订阅并写 DOM 属性。
            /**
             * value/checked 的表达式可能是：无参 getter（createMemo）、`SignalRef`（createSignal）、或静态引用。
             * `SignalRef` 为对象，`typeof !== "function"`，若直接当右值会 `String(ref)` → "[object Object]"；
             * 非箭头/函数字面量分支须经 `unwrapSignalGetterValue` 解包 ref / 标记 getter。
             */
            const valueExpr =
              ts.isArrowFunction(exprNode) || ts.isFunctionExpression(exprNode)
                ? factory.createCallExpression(exprNode, undefined, [])
                : factory.createConditionalExpression(
                  factory.createBinaryExpression(
                    factory.createTypeOfExpression(exprNode),
                    factory.createToken(
                      ts.SyntaxKind.EqualsEqualsEqualsToken,
                    ),
                    factory.createStringLiteral("function"),
                  ),
                  undefined,
                  factory.createCallExpression(exprNode, undefined, []),
                  undefined,
                  factory.createCallExpression(
                    factory.createIdentifier("unwrapSignalGetterValue"),
                    undefined,
                    [exprNode],
                  ),
                );
            const propName = name === "value" ? "value" : "checked";
            const assignExpr = factory.createBinaryExpression(
              factory.createPropertyAccessExpression(
                factory.createIdentifier(elVar),
                propName,
              ),
              factory.createToken(ts.SyntaxKind.EqualsToken),
              name === "value"
                ? factory.createCallExpression(
                  factory.createIdentifier("String"),
                  undefined,
                  [valueExpr],
                )
                : factory.createPrefixUnaryExpression(
                  ts.SyntaxKind.ExclamationToken,
                  factory.createPrefixUnaryExpression(
                    ts.SyntaxKind.ExclamationToken,
                    valueExpr,
                  ),
                ),
            );
            const effectBody = ctx.inOnceSubtree
              ? factory.createCallExpression(ctx.untrackId, undefined, [
                factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  assignExpr,
                ),
              ])
              : assignExpr;
            stmts.push(
              factory.createExpressionStatement(
                factory.createCallExpression(createEffectId, undefined, [
                  factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    effectBody,
                  ),
                ]),
              ),
            );
          } else if (BOOLEAN_ATTRS.has(name)) {
            /**
             * 布尔 DOM 属性：历史实现为 `el.x = !!expr`。
             * 若 `expr` 为无参箭头/函数（如 `disabled={() => loading.value}`），`!!函数` 恒为 true，
             * 会导致按钮、input 等永久禁用。与 value/checked 一致：无参函数用 createEffect 内 `!!expr()` 同步。
             */
            const domProp = name === "readonly"
              ? "readOnly"
              : name === "contenteditable"
              ? "contentEditable"
              : name === "spellcheck"
              ? "spellCheck"
              : name;
            const isZeroArgFn = (ts.isArrowFunction(exprNode) ||
              ts.isFunctionExpression(exprNode)) &&
              exprNode.parameters.length === 0;
            if (isZeroArgFn) {
              const callExpr = factory.createCallExpression(
                exprNode,
                undefined,
                [],
              );
              const boolRhs = factory.createPrefixUnaryExpression(
                ts.SyntaxKind.ExclamationToken,
                factory.createPrefixUnaryExpression(
                  ts.SyntaxKind.ExclamationToken,
                  callExpr,
                ),
              );
              const assignExpr = factory.createBinaryExpression(
                factory.createPropertyAccessExpression(
                  factory.createIdentifier(elVar),
                  factory.createIdentifier(domProp),
                ),
                factory.createToken(ts.SyntaxKind.EqualsToken),
                boolRhs,
              );
              const effectBody = ctx.inOnceSubtree
                ? factory.createCallExpression(ctx.untrackId, undefined, [
                  factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    assignExpr,
                  ),
                ])
                : assignExpr;
              stmts.push(
                factory.createExpressionStatement(
                  factory.createCallExpression(createEffectId, undefined, [
                    factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      factory.createToken(
                        ts.SyntaxKind.EqualsGreaterThanToken,
                      ),
                      effectBody,
                    ),
                  ]),
                ),
              );
            } else {
              stmts.push(
                factory.createExpressionStatement(
                  factory.createBinaryExpression(
                    factory.createPropertyAccessExpression(
                      factory.createIdentifier(elVar),
                      factory.createIdentifier(domProp),
                    ),
                    factory.createToken(ts.SyntaxKind.EqualsToken),
                    factory.createPrefixUnaryExpression(
                      ts.SyntaxKind.ExclamationToken,
                      factory.createPrefixUnaryExpression(
                        ts.SyntaxKind.ExclamationToken,
                        exprNode,
                      ),
                    ),
                  ),
                ),
              );
            }
          } else if (name === "className" || name === "class") {
            // 动态 class：null/undefined 须 removeAttribute；与 value/checked 对齐，可订阅形态走 effect 细粒度更新
            pushSetIntrinsicDomAttributeEffectOrMountStmt(
              stmts,
              elVar,
              "class",
              exprNode,
              ctx,
            );
          } else {
            pushSetIntrinsicDomAttributeEffectOrMountStmt(
              stmts,
              elVar,
              domAttrNameForSetAttribute(name),
              exprNode,
              ctx,
            );
          }
        }
      }
    }
  }
  return stmts;
}

/**
 * 文本插值 `{count}`、`{props.value}`：包一层 `unwrapSignalGetterValue`，在 effect 内执行时可调用 signal 并登记依赖；
 * 不依赖仅靠 `insertReactive` 入口解包（避免生产压缩或多 bundle 副本下 marker 识别失败导致空白、点击看似无反应）。
 */
function wrapBareRefForTextInsert(expr: ts.Expression): ts.Expression {
  if (
    ts.isIdentifier(expr) ||
    ts.isPropertyAccessExpression(expr) ||
    ts.isElementAccessExpression(expr)
  ) {
    return factory.createCallExpression(
      factory.createIdentifier("unwrapSignalGetterValue"),
      undefined,
      [expr],
    );
  }
  return expr;
}

/**
 * 可选链调用且可能整体为 `undefined` 的数组方法名（列表类子表达式常见写法）。
 * 不含 `slice` 等：避免把「可能 undefined 但非列表源」误包进 coalesce。
 */
const OPTIONAL_CHAIN_LIST_COALESCE_METHOD_NAMES = new Set([
  "map",
  "flatMap",
  "filter",
]);

/**
 * 从调用表达式的「被调用目标」解析可选链上的方法名（点访问或 `?.['map']` 字面量）。
 *
 * @param call - 已变换后的调用表达式
 * @returns 若为带 `questionDotToken` 的属性/元素访问则返回方法名，否则 undefined
 */
function optionalChainedListMethodName(
  call: ts.CallExpression,
): string | undefined {
  const callee = call.expression;
  if (
    ts.isPropertyAccessExpression(callee) && callee.questionDotToken != null
  ) {
    return callee.name.text;
  }
  if (
    ts.isElementAccessExpression(callee) &&
    callee.questionDotToken != null &&
    ts.isStringLiteral(callee.argumentExpression)
  ) {
    return callee.argumentExpression.text;
  }
  return undefined;
}

/**
 * 是否为 `x?.map` / `x?.flatMap` / `x?.filter` 或 `x?.['map']` 等形态。短路为 `undefined` 时 `insertReactive` 无法走 `Array.isArray` 分支；
 * 与 `list()?.map` 等写法一致，须在 getter 外包 {@link coalesceIrList}。
 *
 * @param expr - 已做 JSX→调用变换后的表达式
 * @returns 若为上述可选链数组方法调用则为 true
 */
function isOptionalChainedListCoalesceCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const name = optionalChainedListMethodName(expr);
  return name != null && OPTIONAL_CHAIN_LIST_COALESCE_METHOD_NAMES.has(name);
}

/**
 * 递归变换「调用目标」一侧（如 `a.b?.map` 中的 `a.b` 与可选链节点），供 {@link wrapGetterOptMap} 使用。
 *
 * @param callee - CallExpression 的 expression 字段
 * @returns 变换后的 callee
 */
function wrapOptCoalesceCallee(
  callee: ts.Expression,
): ts.Expression {
  if (ts.isPropertyAccessExpression(callee)) {
    return factory.updatePropertyAccessExpression(
      callee,
      wrapGetterOptMap(callee.expression),
      callee.name,
    );
  }
  if (ts.isElementAccessExpression(callee)) {
    return factory.updateElementAccessExpression(
      callee,
      wrapGetterOptMap(callee.expression),
      callee.argumentExpression,
    );
  }
  return wrapGetterOptMap(callee);
}

/**
 * 递归改写语句树中所有带表达式的 `return`，对其表达式做可选链列表 coalesce；覆盖 `if`/`while`/`for`/`switch`/`try`、块内 `function` 声明体，以及 **`const`/`let`/`var` 初值为箭头或 `function` 表达式** 的体。
 *
 * @param stmt - `.map` 回调块内的单条语句
 * @returns 结构等价、可能已插入 coalesce 的语句
 */
function rewriteStmtOptCoalesce(
  stmt: ts.Statement,
): ts.Statement {
  if (ts.isReturnStatement(stmt) && stmt.expression != null) {
    const ne = wrapGetterOptMap(
      stmt.expression,
    );
    return ne === stmt.expression
      ? stmt
      : factory.updateReturnStatement(stmt, ne);
  }
  if (ts.isBlock(stmt)) {
    return rewriteBlockOptCoalesce(stmt);
  }
  if (ts.isIfStatement(stmt)) {
    const nt = rewriteStmtOptCoalesce(
      stmt.thenStatement,
    );
    const ne = stmt.elseStatement
      ? rewriteStmtOptCoalesce(
        stmt.elseStatement,
      )
      : undefined;
    if (nt === stmt.thenStatement && ne === stmt.elseStatement) return stmt;
    return factory.updateIfStatement(stmt, stmt.expression, nt, ne);
  }
  if (ts.isWhileStatement(stmt)) {
    const nb = rewriteStmtOptCoalesce(
      stmt.statement,
    );
    return nb === stmt.statement
      ? stmt
      : factory.updateWhileStatement(stmt, stmt.expression, nb);
  }
  if (ts.isDoStatement(stmt)) {
    const nb = rewriteStmtOptCoalesce(
      stmt.statement,
    );
    return nb === stmt.statement
      ? stmt
      : factory.updateDoStatement(stmt, nb, stmt.expression);
  }
  if (ts.isForStatement(stmt)) {
    const nb = rewriteStmtOptCoalesce(
      stmt.statement,
    );
    return nb === stmt.statement ? stmt : factory.updateForStatement(
      stmt,
      stmt.initializer,
      stmt.condition,
      stmt.incrementor,
      nb,
    );
  }
  if (ts.isForOfStatement(stmt)) {
    const nb = rewriteStmtOptCoalesce(
      stmt.statement,
    );
    return nb === stmt.statement ? stmt : factory.updateForOfStatement(
      stmt,
      stmt.awaitModifier,
      stmt.initializer,
      stmt.expression,
      nb,
    );
  }
  if (ts.isForInStatement(stmt)) {
    const nb = rewriteStmtOptCoalesce(
      stmt.statement,
    );
    return nb === stmt.statement ? stmt : factory.updateForInStatement(
      stmt,
      stmt.initializer,
      stmt.expression,
      nb,
    );
  }
  if (ts.isLabeledStatement(stmt)) {
    const nb = rewriteStmtOptCoalesce(
      stmt.statement,
    );
    return nb === stmt.statement
      ? stmt
      : factory.updateLabeledStatement(stmt, stmt.label, nb);
  }
  if (ts.isSwitchStatement(stmt)) {
    const newClauses = stmt.caseBlock.clauses.map((cl) => {
      if (ts.isCaseClause(cl)) {
        const nss = cl.statements.map(
          rewriteStmtOptCoalesce,
        );
        return nss.every((s, i) => s === cl.statements[i]!)
          ? cl
          : factory.updateCaseClause(cl, cl.expression, nss);
      }
      if (ts.isDefaultClause(cl)) {
        const nss = cl.statements.map(
          rewriteStmtOptCoalesce,
        );
        return nss.every((s, i) => s === cl.statements[i]!)
          ? cl
          : factory.updateDefaultClause(cl, nss);
      }
      return cl;
    });
    if (newClauses.every((c, i) => c === stmt.caseBlock.clauses[i]!)) {
      return stmt;
    }
    return factory.updateSwitchStatement(
      stmt,
      stmt.expression,
      factory.updateCaseBlock(stmt.caseBlock, newClauses),
    );
  }
  if (ts.isTryStatement(stmt)) {
    const nTry = rewriteBlockOptCoalesce(stmt.tryBlock);
    let nCatch = stmt.catchClause;
    if (stmt.catchClause != null) {
      const nCb = rewriteBlockOptCoalesce(
        stmt.catchClause.block,
      );
      if (nCb !== stmt.catchClause.block) {
        nCatch = factory.updateCatchClause(
          stmt.catchClause,
          stmt.catchClause.variableDeclaration,
          nCb,
        );
      }
    }
    let nFinally = stmt.finallyBlock;
    if (stmt.finallyBlock != null) {
      const nf = rewriteBlockOptCoalesce(stmt.finallyBlock);
      if (nf !== stmt.finallyBlock) nFinally = nf;
    }
    if (
      nTry === stmt.tryBlock &&
      nCatch === stmt.catchClause &&
      nFinally === stmt.finallyBlock
    ) {
      return stmt;
    }
    return factory.updateTryStatement(stmt, nTry, nCatch, nFinally);
  }
  if (ts.isVariableStatement(stmt)) {
    const newDecls = stmt.declarationList.declarations.map(
      rewriteVarDeclOptCoalesce,
    );
    if (newDecls.every((d, i) => d === stmt.declarationList.declarations[i]!)) {
      return stmt;
    }
    return factory.updateVariableStatement(
      stmt,
      stmt.modifiers,
      factory.updateVariableDeclarationList(stmt.declarationList, newDecls),
    );
  }
  if (ts.isFunctionDeclaration(stmt) && stmt.body != null) {
    const nb = rewriteBlockOptCoalesce(stmt.body);
    return nb === stmt.body ? stmt : factory.updateFunctionDeclaration(
      stmt,
      stmt.modifiers,
      stmt.asteriskToken,
      stmt.name,
      stmt.typeParameters,
      stmt.parameters,
      stmt.type,
      nb,
    );
  }
  return stmt;
}

/**
 * 对块内每条顶层语句递归 {@link rewriteStmtOptCoalesce}。
 *
 * @param block - `.map` 回调的块体
 * @returns 无改写则返回同一引用，否则为新块
 */
function rewriteBlockOptCoalesce(
  block: ts.Block,
): ts.Block {
  const newStmts = block.statements.map(
    rewriteStmtOptCoalesce,
  );
  return newStmts.every((s, i) => s === block.statements[i]!)
    ? block
    : factory.updateBlock(block, newStmts);
}

/**
 * 变量声明初值若为箭头函数或 `function` 表达式，对其体做与 `.map` 回调块相同的 coalesce 递归（例：`const render = () => row.sub?.map(...)`）。
 *
 * @param decl - `const` / `let` / `var` 的单条声明
 * @returns 无改写则返回原声明节点引用
 */
function rewriteVarDeclOptCoalesce(
  decl: ts.VariableDeclaration,
): ts.VariableDeclaration {
  if (!decl.initializer) return decl;
  const init = decl.initializer;
  if (ts.isArrowFunction(init)) {
    if (!ts.isBlock(init.body)) {
      const ne = wrapGetterOptMap(
        init.body as ts.Expression,
      );
      if (ne === init.body) return decl;
      return factory.updateVariableDeclaration(
        decl,
        decl.name,
        decl.exclamationToken,
        decl.type,
        factory.updateArrowFunction(
          init,
          init.modifiers,
          init.typeParameters,
          init.parameters,
          init.type,
          init.equalsGreaterThanToken,
          ne as ts.ConciseBody,
        ),
      );
    }
    const nb = rewriteBlockOptCoalesce(init.body);
    if (nb === init.body) return decl;
    return factory.updateVariableDeclaration(
      decl,
      decl.name,
      decl.exclamationToken,
      decl.type,
      factory.updateArrowFunction(
        init,
        init.modifiers,
        init.typeParameters,
        init.parameters,
        init.type,
        init.equalsGreaterThanToken,
        nb,
      ),
    );
  }
  if (ts.isFunctionExpression(init) && ts.isBlock(init.body)) {
    const nb = rewriteBlockOptCoalesce(init.body);
    if (nb === init.body) return decl;
    return factory.updateVariableDeclaration(
      decl,
      decl.name,
      decl.exclamationToken,
      decl.type,
      factory.updateFunctionExpression(
        init,
        init.modifiers,
        init.asteriskToken,
        init.name,
        init.typeParameters,
        init.parameters,
        init.type,
        nb,
      ),
    );
  }
  return decl;
}

/**
 * 对 `.map` / `.flatMap` 回调的块体做整树 `return` 表达式 coalesce；无变化时返回 undefined。
 *
 * @param block - 箭头或 function 的块体
 * @returns 更新后的块，或无需改写时为 undefined
 */
function wrapOptCoalesceMapBlock(
  block: ts.Block,
): ts.Block | undefined {
  const nb = rewriteBlockOptCoalesce(block);
  return nb === block ? undefined : nb;
}

/**
 * 对作为 `.map` / `.flatMap` 等实参的箭头或 `function`：对**表达式体**整段、或**块体**（`if` 分支 `return`、`const render = () => sub?.map` 等）做可选链列表 coalesce；
 * 与 `if (!row.sub) return null; return row.sub?.map(...)`、`const renderItems = () => row.sub?.map(...)` 等写法一致。
 *
 * @param fn - 已变换后的箭头或 `function` 表达式
 * @returns 可能更新后的函数字面量
 */
function wrapOptCoalesceMapArg(
  fn: ts.ArrowFunction | ts.FunctionExpression,
): ts.ArrowFunction | ts.FunctionExpression {
  if (ts.isArrowFunction(fn)) {
    if (!ts.isBlock(fn.body)) {
      const newBody = wrapGetterOptMap(
        fn.body as ts.Expression,
      );
      if (newBody === fn.body) return fn;
      return factory.updateArrowFunction(
        fn,
        fn.modifiers,
        fn.typeParameters,
        fn.parameters,
        fn.type,
        fn.equalsGreaterThanToken,
        newBody as ts.ConciseBody,
      );
    }
    const newBlock = wrapOptCoalesceMapBlock(fn.body);
    if (newBlock != null) {
      return factory.updateArrowFunction(
        fn,
        fn.modifiers,
        fn.typeParameters,
        fn.parameters,
        fn.type,
        fn.equalsGreaterThanToken,
        newBlock,
      );
    }
    return fn;
  }
  if (ts.isFunctionExpression(fn) && ts.isBlock(fn.body)) {
    const newBlock = wrapOptCoalesceMapBlock(fn.body);
    if (newBlock != null) {
      return factory.updateFunctionExpression(
        fn,
        fn.modifiers,
        fn.asteriskToken,
        fn.name,
        fn.typeParameters,
        fn.parameters,
        fn.type,
        newBlock,
      );
    }
  }
  return fn;
}

/**
 * 对 `insertReactive` getter 体：在可选链 `.map` / `.flatMap` / `.filter`（含 `?.['map']`）外包 `coalesceIrList`；
 * 并在 `&&` / `||` / `??`、三元、一元、一般调用的实参等子树中递归查找同类调用（如 `cond && list?.map`）。
 * `unwrapSignalGetterValue(…)` 仍只包其**单实参**内层，保持 unwrap 在外。
 * **表达式体**箭头与**块体**（分支内 `return`、`const f = () => …` 初值等）箭头 / `function` 实参会递归处理。
 *
 * @param expr - `wrapBareRefForTextInsert` 之后的结果
 * @returns 必要时包一层或多层 coalesce 后的表达式
 */
function wrapGetterOptMap(
  expr: ts.Expression,
): ts.Expression {
  if (ts.isParenthesizedExpression(expr)) {
    return factory.updateParenthesizedExpression(
      expr,
      wrapGetterOptMap(expr.expression),
    );
  }
  if (ts.isBinaryExpression(expr)) {
    return factory.updateBinaryExpression(
      expr,
      wrapGetterOptMap(expr.left),
      expr.operatorToken,
      wrapGetterOptMap(expr.right),
    );
  }
  if (ts.isConditionalExpression(expr)) {
    return factory.updateConditionalExpression(
      expr,
      wrapGetterOptMap(expr.condition),
      expr.questionToken,
      wrapGetterOptMap(expr.whenTrue),
      expr.colonToken,
      wrapGetterOptMap(expr.whenFalse),
    );
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    return factory.updatePrefixUnaryExpression(
      expr,
      wrapGetterOptMap(expr.operand),
    );
  }
  if (ts.isAsExpression(expr)) {
    return factory.updateAsExpression(
      expr,
      wrapGetterOptMap(expr.expression),
      expr.type,
    );
  }
  if (ts.isSatisfiesExpression(expr)) {
    return factory.updateSatisfiesExpression(
      expr,
      wrapGetterOptMap(expr.expression),
      expr.type,
    );
  }
  if (ts.isNonNullExpression(expr)) {
    return factory.updateNonNullExpression(
      expr,
      wrapGetterOptMap(expr.expression),
    );
  }
  if (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "unwrapSignalGetterValue" &&
    expr.arguments.length === 1
  ) {
    const a0 = wrapGetterOptMap(
      expr.arguments[0]!,
    );
    return factory.updateCallExpression(
      expr,
      expr.expression,
      expr.typeArguments,
      [a0],
    );
  }
  if (ts.isCallExpression(expr)) {
    const newCallee = wrapOptCoalesceCallee(
      expr.expression,
    );
    const newArgs = expr.arguments.map((arg) => {
      if (ts.isSpreadElement(arg)) {
        return factory.createSpreadElement(
          wrapGetterOptMap(arg.expression),
        );
      }
      const argExpr = arg as ts.Expression;
      if (ts.isArrowFunction(argExpr)) {
        return wrapOptCoalesceMapArg(argExpr);
      }
      if (ts.isFunctionExpression(argExpr)) {
        return wrapOptCoalesceMapArg(argExpr);
      }
      return wrapGetterOptMap(argExpr);
    });
    const updated = factory.updateCallExpression(
      expr,
      newCallee,
      expr.typeArguments,
      newArgs,
    );
    if (isOptionalChainedListCoalesceCall(updated)) {
      return factory.createCallExpression(
        factory.createIdentifier("coalesceIrList"),
        undefined,
        [updated],
      );
    }
    return updated;
  }
  return expr;
}

/**
 * 判断 JSX 开标签上的属性在源码层面是否「可一次性插入」：无展开、无 ref/自定义指令、无函数字面量（含 on*、value getter 等）。
 *
 * @param attrs - openingElement.attributes
 * @returns 全部为字面量或静态表达式时为 true
 */
function jsxOpeningAttributesSourceFullyStatic(
  attrs: ts.JsxAttributes,
): boolean {
  for (const prop of attrs.properties) {
    if (ts.isJsxSpreadAttribute(prop)) return false;
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (name === "ref") {
      if (prop.initializer) return false;
      continue;
    }
    if (isCustomDirectivePropName(name)) return false;
    if (!prop.initializer) continue;
    if (ts.isStringLiteral(prop.initializer)) continue;
    if (ts.isJsxExpression(prop.initializer)) {
      const ex = prop.initializer.expression;
      if (!ex) continue;
      if (ts.isArrowFunction(ex) || ts.isFunctionExpression(ex)) return false;
      if (!sourceExpressionIsStaticForOneShotInsert(ex)) return false;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * 子节点是否可在 `{ … }` 内安全改为 `insert(parent, …)`（不经 insertReactive）。
 *
 * @param child - JsxChild
 */
function jsxChildSourceFullyStatic(child: ts.JsxChild): boolean {
  if (isWhitespaceOnlyJsxText(child)) return true;
  if (ts.isJsxText(child)) return true;
  if (ts.isJsxExpression(child)) {
    const e = child.expression;
    if (!e) return true;
    return sourceExpressionIsStaticForOneShotInsert(e);
  }
  if (ts.isJsxFragment(child)) {
    return jsxFragmentSourceFullyStatic(child);
  }
  if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
    return jsxElementLikeSourceFullyStatic(child);
  }
  return false;
}

/**
 * Fragment 子树是否全静态（无组件、无指令）。
 *
 * @param node - JsxFragment
 */
function jsxFragmentSourceFullyStatic(node: ts.JsxFragment): boolean {
  return node.children.every(jsxChildSourceFullyStatic);
}

/**
 * 本征 JSX 元素/自闭合标签子树是否全静态（步骤 4：可 hoisting 到 insert 一次性挂载）。
 *
 * @param node - JsxElement 或 JsxSelfClosingElement
 */
function jsxElementLikeSourceFullyStatic(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): boolean {
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const tagName = typeof (open.tagName as ts.Identifier).text === "string"
    ? (open.tagName as ts.Identifier).text
    : safeNodeText(open.tagName as ts.Node) || "";
  if (!isIntrinsicElement(tagName)) return false;
  const attrs = open.attributes;
  if (!ts.isJsxAttributes(attrs)) return false;
  if (getVIfCondition(attrs) !== null) return false;
  if (hasVElseIfAttribute(attrs)) return false;
  if (hasVElseAttribute(attrs)) return false;
  if (hasVOnceAttribute(attrs)) return false;
  if (hasVCloakAttribute(attrs)) return false;
  if (hasVSlotGetterAttribute(attrs)) return false;
  if (!jsxOpeningAttributesSourceFullyStatic(attrs)) return false;
  if (ts.isJsxSelfClosingElement(node)) return true;
  return node.children.every(jsxChildSourceFullyStatic);
}

/**
 * 剥掉括号、`as` / `satisfies` / 非空断言等，便于编译期常量判定。
 *
 * @param e - 任意表达式
 * @returns 最内层被包表达式
 */
function stripExprWrappersForConstantEval(e: ts.Expression): ts.Expression {
  let x = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x)) x = x.expression;
    else if (ts.isAsExpression(x) || ts.isSatisfiesExpression(x)) {
      x = x.expression;
    } else if (ts.isTypeAssertionExpression(x)) {
      x = (x as ts.TypeAssertion).expression;
    } else if (ts.isNonNullExpression(x)) x = x.expression;
    else break;
  }
  return x;
}

/**
 * 编译期 `===` 可比较的操作数：字面量、`undefined` 标识符、`void`（恒 undefined）。
 * 不跟踪枚举、`as const` 传播或跨文件常量，避免误判。
 */
type CompileTimeStrictEqOperand =
  | { k: "undefined" }
  | { k: "null" }
  | { k: "boolean"; v: boolean }
  | { k: "number"; v: number }
  | { k: "string"; v: string }
  | { k: "bigint"; v: bigint };

/**
 * 从表达式提取 {@link CompileTimeStrictEqOperand}；无法唯一确定时为 null。
 *
 * @param e - 已或将被 {@link stripExprWrappersForConstantEval} 处理的表达式
 */
function compileTimeStrictEqOperand(
  e: ts.Expression,
): CompileTimeStrictEqOperand | null {
  const x = stripExprWrappersForConstantEval(e);
  if (x.kind === ts.SyntaxKind.TrueKeyword) {
    return { k: "boolean", v: true };
  }
  if (x.kind === ts.SyntaxKind.FalseKeyword) {
    return { k: "boolean", v: false };
  }
  if (x.kind === ts.SyntaxKind.NullKeyword) return { k: "null" };
  if (ts.isIdentifier(x) && x.text === "undefined") return { k: "undefined" };
  /** `void e` 运行时恒为 `undefined`。 */
  if (ts.isVoidExpression(x)) return { k: "undefined" };
  if (ts.isNumericLiteral(x)) {
    const v = Number(x.text);
    if (Number.isNaN(v)) return null;
    return { k: "number", v };
  }
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    return { k: "string", v: x.text };
  }
  if (ts.isBigIntLiteral(x)) {
    const raw = x.text;
    const core = raw.endsWith("n") ? raw.slice(0, -1) : raw;
    try {
      return { k: "bigint", v: BigInt(core) };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * JS `===` 语义下两操作数是否相等（类型不同则 false）。
 *
 * @param a - 左操作数
 * @param b - 右操作数
 */
function strictTripleEqualsOperands(
  a: CompileTimeStrictEqOperand,
  b: CompileTimeStrictEqOperand,
): boolean {
  if (a.k !== b.k) return false;
  if (a.k === "undefined" || a.k === "null") return true;
  if (a.k === "boolean") {
    return a.v ===
      (b as Extract<CompileTimeStrictEqOperand, { k: "boolean" }>).v;
  }
  if (a.k === "number") {
    return a.v ===
      (b as Extract<CompileTimeStrictEqOperand, { k: "number" }>).v;
  }
  if (a.k === "string") {
    return a.v ===
      (b as Extract<CompileTimeStrictEqOperand, { k: "string" }>).v;
  }
  return a.v === (b as Extract<CompileTimeStrictEqOperand, { k: "bigint" }>).v;
}

/**
 * 若表达式**仅**由数字字面量、`+` / `-`（一元、二元） / `*` / `/` / `%` / `**` 与括号组成，返回按 JS 语义求得的 number；遇 BigInt、除零取模、非数字子式时为 null。
 * 用于 `1 + 1 === 2` 等编译期常量折叠；不向标识符或调用扩展。
 *
 * @param e - 任意表达式
 */
function tryEvalCompileTimeNumberExpr(e: ts.Expression): number | null {
  const x = stripExprWrappersForConstantEval(e);
  if (ts.isNumericLiteral(x)) {
    const n = Number(x.text);
    return Number.isNaN(n) ? null : n;
  }
  if (ts.isBigIntLiteral(x)) return null;
  if (
    ts.isPrefixUnaryExpression(x) &&
    x.operator === ts.SyntaxKind.MinusToken
  ) {
    const inner = tryEvalCompileTimeNumberExpr(x.operand);
    return inner === null ? null : -inner;
  }
  if (
    ts.isPrefixUnaryExpression(x) &&
    x.operator === ts.SyntaxKind.PlusToken
  ) {
    return tryEvalCompileTimeNumberExpr(x.operand);
  }
  if (ts.isBinaryExpression(x)) {
    const op = x.operatorToken.kind;
    const L = tryEvalCompileTimeNumberExpr(x.left as ts.Expression);
    const R = tryEvalCompileTimeNumberExpr(x.right as ts.Expression);
    if (L === null || R === null) return null;
    if (op === ts.SyntaxKind.PlusToken) return L + R;
    if (op === ts.SyntaxKind.MinusToken) return L - R;
    if (op === ts.SyntaxKind.AsteriskToken) return L * R;
    if (op === ts.SyntaxKind.SlashToken) {
      if (R === 0) return null;
      return L / R;
    }
    if (op === ts.SyntaxKind.PercentToken) {
      if (R === 0) return null;
      return L % R;
    }
    if (op === ts.SyntaxKind.AsteriskAsteriskToken) return L ** R;
  }
  return null;
}

/**
 * 若表达式**仅**由字符串字面量、无插值模板字面量与 `+` 拼接组成，返回拼接后的 string；遇数字/标识符/模板插值等为 null（不向 `"a"+1` 推广）。
 *
 * @param e - 任意表达式
 */
function tryEvalCompileTimeStringConcatExpr(e: ts.Expression): string | null {
  const x = stripExprWrappersForConstantEval(e);
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    return x.text;
  }
  if (
    ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const L = tryEvalCompileTimeStringConcatExpr(x.left as ts.Expression);
    const R = tryEvalCompileTimeStringConcatExpr(x.right as ts.Expression);
    if (L !== null && R !== null) return L + R;
  }
  return null;
}

/**
 * 两侧均为 {@link tryEvalCompileTimeNumberExpr} 可求值时，返回关系运算的布尔结果；否则 null。
 *
 * @param left - 左操作数
 * @param right - 右操作数
 * @param op - `<` `<=` `>` `>=` 之一
 */
function tryEvalNumericRelationalExpr(
  left: ts.Expression,
  right: ts.Expression,
  op: ts.SyntaxKind,
): boolean | null {
  const L = tryEvalCompileTimeNumberExpr(left);
  const R = tryEvalCompileTimeNumberExpr(right);
  if (L === null || R === null) return null;
  if (op === ts.SyntaxKind.LessThanToken) return L < R;
  if (op === ts.SyntaxKind.LessThanEqualsToken) return L <= R;
  if (op === ts.SyntaxKind.GreaterThanToken) return L > R;
  if (op === ts.SyntaxKind.GreaterThanEqualsToken) return L >= R;
  return null;
}

/**
 * 若左右两侧均为可静态字面量，返回 `left === right` 的布尔结果；否则 null。
 *
 * @param left - `===` 左侧
 * @param right - `===` 右侧
 */
function tryEvalStrictTripleEquals(
  left: ts.Expression,
  right: ts.Expression,
): boolean | null {
  const a = compileTimeStrictEqOperand(left);
  const b = compileTimeStrictEqOperand(right);
  if (a !== null && b !== null) return strictTripleEqualsOperands(a, b);
  const nl = tryEvalCompileTimeNumberExpr(left);
  const nr = tryEvalCompileTimeNumberExpr(right);
  if (nl !== null && nr !== null) return nl === nr;
  const sl = tryEvalCompileTimeStringConcatExpr(left);
  const sr = tryEvalCompileTimeStringConcatExpr(right);
  if (sl !== null && sr !== null) return sl === sr;
  return null;
}

/**
 * 对**可静态判定**的操作数返回 JS `typeof` 结果（`null` → `"object"` 等），否则 null。
 * 不跟踪标识符（除 `undefined`）、调用表达式等。
 *
 * @param operand - `typeof` 的操作数
 */
function tryEvalTypeofKeyword(operand: ts.Expression): string | null {
  const x = stripExprWrappersForConstantEval(operand);
  if (
    x.kind === ts.SyntaxKind.TrueKeyword ||
    x.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return "boolean";
  }
  if (x.kind === ts.SyntaxKind.NullKeyword) return "object";
  if (ts.isIdentifier(x) && x.text === "undefined") return "undefined";
  if (ts.isVoidExpression(x)) return "undefined";
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    return "string";
  }
  if (ts.isNumericLiteral(x)) {
    const n = Number(x.text);
    if (Number.isNaN(n)) return null;
    return "number";
  }
  if (ts.isBigIntLiteral(x)) return "bigint";
  return null;
}

/**
 * 若一侧为 `typeof <静态操作数>`、另一侧为字符串字面量，返回 `===` 的布尔结果；否则 null。
 * 对 `typeof 1 === "number"` 等可在编译期定值的死分支折叠。
 *
 * @param left - `===` 左侧
 * @param right - `===` 右侧
 */
function tryEvalTripleEqualsWithTypeof(
  left: ts.Expression,
  right: ts.Expression,
): boolean | null {
  const tryOneOrder = (a: ts.Expression, b: ts.Expression): boolean | null => {
    const ae = stripExprWrappersForConstantEval(a);
    const be = stripExprWrappersForConstantEval(b);
    if (ts.isTypeOfExpression(ae) && ts.isStringLiteral(be)) {
      const t = tryEvalTypeofKeyword(ae.expression);
      if (t === null) return null;
      return t === be.text;
    }
    return null;
  };
  return tryOneOrder(left, right) ?? tryOneOrder(right, left);
}

/**
 * `===` 编译期求值：先尝试 {@link tryEvalStrictTripleEquals}（字面量与纯数字算术），再尝试
 * {@link tryEvalTripleEqualsWithTypeof}。
 *
 * @param left - 左操作数
 * @param right - 右操作数
 */
function tryEvalTripleEqualsCombined(
  left: ts.Expression,
  right: ts.Expression,
): boolean | null {
  const strict = tryEvalStrictTripleEquals(left, right);
  if (strict !== null) return strict;
  return tryEvalTripleEqualsWithTypeof(left, right);
}

/**
 * 判断 BigInt 字面量在编译期是否为 0n（TS AST 的 text 形如 `"0n"`）。
 *
 * @param node - BigInt 字面量节点
 */
function bigIntLiteralIsZeroAtCompileTime(node: ts.BigIntLiteral): boolean {
  const raw = node.text;
  const core = raw.endsWith("n") ? raw.slice(0, -1) : raw;
  try {
    return BigInt(core) === 0n;
  } catch {
    return false;
  }
}

/**
 * 表达式在编译期是否**必为假**（短路左侧可用于 `&&` / `||` 折叠）。
 * 仅认字面量、`undefined` 标识符、`void`（恒 undefined）、`0n`、简单 `!`；不跟踪枚举或跨文件常量。
 *
 * @param e - 待判定表达式
 */
function isDefinitelyFalsyAtCompileTime(e: ts.Expression): boolean {
  const x = stripExprWrappersForConstantEval(e);
  if (
    x.kind === ts.SyntaxKind.FalseKeyword ||
    x.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isIdentifier(x) && x.text === "undefined") return true;
  /** `void expr` 运行时恒为 `undefined`，与 `undefined` 同属假值。 */
  if (ts.isVoidExpression(x)) return true;
  if (ts.isNumericLiteral(x)) {
    const n = Number(x.text);
    return n === 0 && !Number.isNaN(n);
  }
  if (ts.isBigIntLiteral(x)) {
    return bigIntLiteralIsZeroAtCompileTime(x);
  }
  if (
    ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken
  ) {
    if (ts.isNumericLiteral(x.operand) && x.operand.text === "0") return true;
  }
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    return x.text.length === 0;
  }
  /**
   * 纯数字字面量算术式（如 `1 - 1`）在编译期可求值时参与假值判定。
   */
  const foldedFalsyNum = tryEvalCompileTimeNumberExpr(x);
  if (foldedFalsyNum !== null) {
    return foldedFalsyNum === 0 || Number.isNaN(foldedFalsyNum);
  }
  /**
   * 纯字符串字面量拼接式（如 `"" + ""`）在编译期可求值时参与假值判定。
   */
  const foldedFalsyStr = tryEvalCompileTimeStringConcatExpr(x);
  if (foldedFalsyStr !== null) {
    return foldedFalsyStr.length === 0;
  }
  if (
    ts.isPrefixUnaryExpression(x) &&
    x.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return isDefinitelyTruthyAtCompileTime(x.operand);
  }
  /**
   * 字面量间 `===` / `!==` 编译期求值，供三元与短路左侧判定（死分支折叠）。
   */
  if (ts.isBinaryExpression(x)) {
    const op = x.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      const r = tryEvalTripleEqualsCombined(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (r === null) return false;
      return r === false;
    }
    if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
      const r = tryEvalTripleEqualsCombined(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (r === null) return false;
      return r === true;
    }
    /** `expr == null` / `== undefined` / `void 0` 一侧：不向一般 `==` 扩展。 */
    if (op === ts.SyntaxKind.EqualsEqualsToken) {
      const q = tryEvalLooseEqNullishPattern(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (q !== null) return q === false;
      return false;
    }
    if (op === ts.SyntaxKind.ExclamationEqualsToken) {
      const q = tryEvalLooseEqNullishPattern(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (q !== null) return q === true;
      return false;
    }
    /** 纯数字字面量关系运算 `<` `<=` `>` `>=`。 */
    if (
      op === ts.SyntaxKind.LessThanToken ||
      op === ts.SyntaxKind.LessThanEqualsToken ||
      op === ts.SyntaxKind.GreaterThanToken ||
      op === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      const rel = tryEvalNumericRelationalExpr(
        x.left as ts.Expression,
        x.right as ts.Expression,
        op,
      );
      if (rel !== null) return rel === false;
      return false;
    }
  }
  return false;
}

/**
 * 表达式在编译期是否**必为真**（短路左侧可用于 `&&` / `||` 折叠）。
 *
 * @param e - 待判定表达式
 */
function isDefinitelyTruthyAtCompileTime(e: ts.Expression): boolean {
  const x = stripExprWrappersForConstantEval(e);
  if (x.kind === ts.SyntaxKind.TrueKeyword) return true;
  /** `void` 恒为 undefined，非真。 */
  if (ts.isVoidExpression(x)) return false;
  if (ts.isNumericLiteral(x)) {
    const n = Number(x.text);
    return n !== 0 && !Number.isNaN(n);
  }
  if (ts.isBigIntLiteral(x)) {
    return !bigIntLiteralIsZeroAtCompileTime(x);
  }
  if (
    ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.MinusToken
  ) {
    if (ts.isNumericLiteral(x.operand) && x.operand.text !== "0") return true;
  }
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    return x.text.length > 0;
  }
  /**
   * 纯数字字面量算术式（如 `1 + 1`）在编译期可求值时参与真值判定。
   */
  const foldedTruthyNum = tryEvalCompileTimeNumberExpr(x);
  if (foldedTruthyNum !== null) {
    return foldedTruthyNum !== 0 && !Number.isNaN(foldedTruthyNum);
  }
  /**
   * 纯字符串字面量拼接式在编译期可求值时参与真值判定（非空为真）。
   */
  const foldedTruthyStr = tryEvalCompileTimeStringConcatExpr(x);
  if (foldedTruthyStr !== null) {
    return foldedTruthyStr.length > 0;
  }
  if (
    ts.isPrefixUnaryExpression(x) &&
    x.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return isDefinitelyFalsyAtCompileTime(x.operand);
  }
  /**
   * 字面量间 `===` / `!==` 编译期求值（与 {@link isDefinitelyFalsyAtCompileTime} 对称）。
   */
  if (ts.isBinaryExpression(x)) {
    const op = x.operatorToken.kind;
    if (op === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      const r = tryEvalTripleEqualsCombined(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (r === null) return false;
      return r === true;
    }
    if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
      const r = tryEvalTripleEqualsCombined(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (r === null) return false;
      return r === false;
    }
    /** `expr == null` / `!= null` 等与 nullish 哨兵一侧的宽松相等（与 {@link isDefinitelyFalsyAtCompileTime} 对称）。 */
    if (op === ts.SyntaxKind.EqualsEqualsToken) {
      const q = tryEvalLooseEqNullishPattern(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (q !== null) return q === true;
      return false;
    }
    if (op === ts.SyntaxKind.ExclamationEqualsToken) {
      const q = tryEvalLooseEqNullishPattern(
        x.left as ts.Expression,
        x.right as ts.Expression,
      );
      if (q !== null) return q === false;
      return false;
    }
    /** 纯数字字面量关系运算（与 {@link isDefinitelyFalsyAtCompileTime} 对称）。 */
    if (
      op === ts.SyntaxKind.LessThanToken ||
      op === ts.SyntaxKind.LessThanEqualsToken ||
      op === ts.SyntaxKind.GreaterThanToken ||
      op === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      const rel = tryEvalNumericRelationalExpr(
        x.left as ts.Expression,
        x.right as ts.Expression,
        op,
      );
      if (rel !== null) return rel === true;
      return false;
    }
  }
  return false;
}

/**
 * 表达式在编译期是否必为 `null` / `undefined`（用于 `??` 右侧折叠）。
 *
 * @param e - 待判定表达式
 */
function isDefinitelyNullishAtCompileTime(e: ts.Expression): boolean {
  const x = stripExprWrappersForConstantEval(e);
  if (x.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(x) && x.text === "undefined") return true;
  /** `void expr` 运行时恒为 `undefined`，对 `??` 与 nullish 语义一致。 */
  if (ts.isVoidExpression(x)) return true;
  return false;
}

/**
 * 表达式在 `== null` / `== undefined` 语义下是否**必非** null 且非 undefined（用于安全折叠 `==` / `!=`，不向 `1 == true` 等一般宽松相等扩展）。
 *
 * @param e - 待判定表达式（须无 JSX）
 */
function isDefinitelyNonNullishForDoubleEqNull(e: ts.Expression): boolean {
  const x = stripExprWrappersForConstantEval(e);
  if (
    x.kind === ts.SyntaxKind.TrueKeyword ||
    x.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return true;
  }
  if (x.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isIdentifier(x) && x.text === "undefined") return false;
  if (ts.isVoidExpression(x)) return false;
  if (ts.isNumericLiteral(x)) return true;
  if (ts.isBigIntLiteral(x)) return true;
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
    return true;
  }
  /** `typeof` 运行时恒为 string，永非 nullish。 */
  if (ts.isTypeOfExpression(x)) return true;
  return false;
}

/**
 * 右侧是否为 `null`、`undefined` 标识符或 `void …`（`==` 另一侧与 nullish 判定的常见 TS 写法）。
 *
 * @param e - `==` 的一侧
 */
function isDoubleEqNullishSentinelOperand(e: ts.Expression): boolean {
  const x = stripExprWrappersForConstantEval(e);
  if (x.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(x) && x.text === "undefined") return true;
  if (ts.isVoidExpression(x)) return true;
  return false;
}

/**
 * 仅当一侧为 {@link isDoubleEqNullishSentinelOperand} 时，求 `left == right` 的布尔结果；否则 null。
 * 不向任意 `==` 推广，避免 `1 == true` 等陷阱。
 *
 * @param left - `==` 左侧
 * @param right - `==` 右侧
 */
function tryEvalLooseEqNullishPattern(
  left: ts.Expression,
  right: ts.Expression,
): boolean | null {
  const tryOneOrder = (a: ts.Expression, b: ts.Expression): boolean | null => {
    if (!isDoubleEqNullishSentinelOperand(b)) return null;
    if (expressionContainsJsx(a)) return null;
    if (isDefinitelyNullishAtCompileTime(a)) return true;
    if (isDefinitelyNonNullishForDoubleEqNull(a)) return false;
    return null;
  };
  return tryOneOrder(left, right) ?? tryOneOrder(right, left);
}

/**
 * 步骤 4 扩展（细粒度短路 JSX）：`true && <div/>`、`false || <div/>`、`null ?? <div/>` 等
 * **仅一侧为编译期常量、另一侧为含 JSX 的表达式**时，折叠为单侧再一次性 `insert`，
 * 避免 `insert(true && markMountFn(...))` 仍落入零参函数而走 `insertReactive`。
 *
 * @param expr - 花括号内原始表达式
 * @returns 折叠后的 AST；无法安全折叠时为 null
 */
function tryFoldStaticLogicalJsxForInsert(
  expr: ts.Expression,
): ts.Expression | null {
  const inner = stripExprWrappersForConstantEval(expr);
  if (!ts.isBinaryExpression(inner)) return null;
  const op = inner.operatorToken.kind;
  const L = inner.left as ts.Expression;
  const R = inner.right as ts.Expression;

  if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
    if (expressionContainsJsx(L) || !expressionContainsJsx(R)) return null;
    if (isDefinitelyFalsyAtCompileTime(L)) return L;
    if (isDefinitelyTruthyAtCompileTime(L)) {
      const next = R;
      return tryFoldStaticLogicalJsxForInsert(next) ?? next;
    }
    return null;
  }
  if (op === ts.SyntaxKind.BarBarToken) {
    if (expressionContainsJsx(L) || !expressionContainsJsx(R)) return null;
    if (isDefinitelyTruthyAtCompileTime(L)) return L;
    if (isDefinitelyFalsyAtCompileTime(L)) {
      const next = R;
      return tryFoldStaticLogicalJsxForInsert(next) ?? next;
    }
    return null;
  }
  if (op === ts.SyntaxKind.QuestionQuestionToken) {
    if (isDefinitelyNullishAtCompileTime(L)) {
      if (!expressionContainsJsx(R)) return null;
      const next = R;
      return tryFoldStaticLogicalJsxForInsert(next) ?? next;
    }
    /**
     * 左操作数编译期必非 nullish 时结果为左值，右侧 JSX 为死代码；剔除后可避免多余 `insertReactive` / 结构抖动。
     */
    if (
      !expressionContainsJsx(L) && isDefinitelyNonNullishForDoubleEqNull(L)
    ) {
      return L;
    }
    return null;
  }
  return null;
}

/**
 * 编译期常量三元：条件不含 JSX 且可证真/假时，折叠为单分支（死分支剔除）。
 *
 * @param expr - 花括号内或内层子表达式
 * @returns 折叠后的 AST；无法安全折叠时为 null
 */
function tryFoldStaticConditionalJsxForInsert(
  expr: ts.Expression,
): ts.Expression | null {
  const inner = stripExprWrappersForConstantEval(expr);
  if (!ts.isConditionalExpression(inner)) return null;
  if (expressionContainsJsx(inner.condition)) return null;
  if (isDefinitelyTruthyAtCompileTime(inner.condition)) {
    return inner.whenTrue;
  }
  if (isDefinitelyFalsyAtCompileTime(inner.condition)) {
    return inner.whenFalse;
  }
  return null;
}

/**
 * 将表达式拆成逗号链上的各操作数（`a, b, c` 左结合、`CommaListExpression` 均摊平）。
 * 用于仅对**最后一项**做 JSX 常量折叠，保留左侧副作用顺序。
 *
 * @param expr - 任意表达式
 * @returns 非空操作数列表
 */
function flattenCommaOperandsRoot(expr: ts.Expression): ts.Expression[] {
  const out: ts.Expression[] = [];
  const walk = (e: ts.Expression): void => {
    const inner = stripExprWrappersForConstantEval(e);
    if (
      ts.isBinaryExpression(inner) &&
      inner.operatorToken.kind === ts.SyntaxKind.CommaToken
    ) {
      walk(inner.left as ts.Expression);
      walk(inner.right as ts.Expression);
    } else if (ts.isCommaListExpression(inner)) {
      for (const el of inner.elements) {
        walk(el as ts.Expression);
      }
    } else {
      out.push(inner);
    }
  };
  walk(expr);
  return out;
}

/**
 * 由操作数列表构造左结合逗号表达式 `((a, b), c)`，与 TS/JS 解析一致。
 *
 * @param operands - 至少一项
 */
function buildCommaChainLeftAssoc(
  operands: readonly ts.Expression[],
): ts.Expression {
  if (operands.length === 0) {
    throw new Error("buildCommaChainLeftAssoc: empty operands");
  }
  let acc = operands[0]!;
  for (let i = 1; i < operands.length; i++) {
    acc = factory.createBinaryExpression(
      acc,
      factory.createToken(ts.SyntaxKind.CommaToken),
      operands[i]!,
    );
  }
  return acc;
}

/**
 * 对**单段**表达式交替应用三元与逻辑短路折叠直至不动点（不含顶层逗号拆分）。
 *
 * @param expr - 原始表达式
 * @returns 折叠并剥包装后的表达式
 */
function deepFoldStaticJsxExpressionForInsertScalar(
  expr: ts.Expression,
): ts.Expression {
  let cur = stripExprWrappersForConstantEval(expr);
  for (let i = 0; i < 24; i++) {
    const c = tryFoldStaticConditionalJsxForInsert(cur);
    if (c !== null) {
      cur = stripExprWrappersForConstantEval(c);
      continue;
    }
    const l = tryFoldStaticLogicalJsxForInsert(cur);
    if (l !== null) {
      cur = stripExprWrappersForConstantEval(l);
      continue;
    }
    break;
  }
  return cur;
}

/**
 * 交替应用三元与逻辑短路折叠直至不动点，供静态判定与产物 `insert` 共用。
 * 逗号表达式仅折叠**最后一项**，以免改变左侧副作用顺序。
 *
 * @param expr - 原始表达式
 * @returns 折叠并剥包装后的表达式
 */
function deepFoldStaticJsxExpressionForInsert(
  expr: ts.Expression,
): ts.Expression {
  const ops = flattenCommaOperandsRoot(expr);
  if (ops.length === 1) {
    return deepFoldStaticJsxExpressionForInsertScalar(ops[0]!);
  }
  const foldedLast = deepFoldStaticJsxExpressionForInsertScalar(
    ops[ops.length - 1]!,
  );
  const newOps = ops.slice(0, -1).concat([foldedLast]);
  return buildCommaChainLeftAssoc(newOps);
}

/**
 * 步骤 4（MVP）：源码表达式是否可编译为 `insert(parent, expr)` 而非 `insertReactive`，避免无 signal 子树挂 effect。
 * 保守策略：含调用/数组字面量/new/对象字面量/模板插值等一律 false；**逗号**表达式在**各段均静态**时为 true；
 * **含 JSX 的 `&&`/`||`/`??`/常量三元** 经 {@link deepFoldStaticJsxExpressionForInsert} 后为静态子树时为 true。
 *
 * @param expr - `{ expr }` 内原始表达式（变换前）
 */
function sourceExpressionIsStaticForOneShotInsert(
  expr: ts.Expression,
): boolean {
  return sourceExpressionIsStaticForOneShotInsertImpl(
    deepFoldStaticJsxExpressionForInsert(expr),
  );
}

/**
 * {@link sourceExpressionIsStaticForOneShotInsert} 在深度折叠后的判定实现；子递归仍走对外入口以再次折叠嵌套子式。
 *
 * @param expr - 已深度折叠且剥包装的表达式
 */
function sourceExpressionIsStaticForOneShotInsertImpl(
  expr: ts.Expression,
): boolean {
  if (ts.isParenthesizedExpression(expr)) {
    return sourceExpressionIsStaticForOneShotInsert(expr.expression);
  }
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return sourceExpressionIsStaticForOneShotInsert(expr.expression);
  }
  if (ts.isTypeAssertionExpression(expr)) {
    return sourceExpressionIsStaticForOneShotInsert(
      (expr as ts.TypeAssertion).expression,
    );
  }
  if (ts.isNonNullExpression(expr)) {
    return sourceExpressionIsStaticForOneShotInsert(expr.expression);
  }
  if (
    ts.isStringLiteral(expr) ||
    ts.isNumericLiteral(expr) ||
    ts.isBigIntLiteral(expr)
  ) {
    return true;
  }
  if (
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return true;
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(expr)) {
    return expr.text === "undefined";
  }
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return true;
  if (ts.isTemplateExpression(expr)) return false;
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) {
    return jsxElementLikeSourceFullyStatic(expr);
  }
  if (ts.isJsxFragment(expr)) {
    return jsxFragmentSourceFullyStatic(expr);
  }
  if (ts.isConditionalExpression(expr)) {
    return sourceExpressionIsStaticForOneShotInsert(expr.condition) &&
      sourceExpressionIsStaticForOneShotInsert(expr.whenTrue) &&
      sourceExpressionIsStaticForOneShotInsert(expr.whenFalse);
  }
  if (ts.isBinaryExpression(expr)) {
    if (expressionContainsJsx(expr)) {
      const folded = tryFoldStaticLogicalJsxForInsert(expr);
      if (folded === null) return false;
      return sourceExpressionIsStaticForOneShotInsert(folded);
    }
    return sourceExpressionIsStaticForOneShotInsert(
      expr.left as ts.Expression,
    ) &&
      sourceExpressionIsStaticForOneShotInsert(expr.right as ts.Expression);
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    if (expressionContainsJsx(expr.operand)) return false;
    return sourceExpressionIsStaticForOneShotInsert(expr.operand);
  }
  if (ts.isPostfixUnaryExpression(expr)) {
    if (expressionContainsJsx(expr.operand)) return false;
    return sourceExpressionIsStaticForOneShotInsert(expr.operand);
  }
  /**
   * `void sub` 结果为 undefined；operand 须无 JSX（否则语义上也不应 void 掉 UI）。
   * 静态性由 operand 决定（如 `void 0` 可参与折叠后的 insert）。
   */
  if (ts.isVoidExpression(expr)) {
    if (expressionContainsJsx(expr.expression)) return false;
    return sourceExpressionIsStaticForOneShotInsert(expr.expression);
  }
  if (ts.isCommaListExpression(expr)) {
    return expr.elements.every((el) =>
      sourceExpressionIsStaticForOneShotInsert(el as ts.Expression)
    );
  }
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return false;
  if (ts.isCallExpression(expr) || ts.isNewExpression(expr)) return false;
  if (ts.isArrayLiteralExpression(expr)) return false;
  if (ts.isObjectLiteralExpression(expr)) return false;
  return false;
}

/**
 * 为单个 JsxChild 生成「挂到 parent 上」的语句：静态文本用 appendChild(createTextNode)，动态用 insertReactive(parent, () => expr)。
 * v-once 子树内 getter 体包 untrack，避免长期订阅。
 */
function buildChildStatements(
  parentVar: string,
  child: ts.JsxChild,
  ctx: EmitContext,
): ts.Statement[] {
  const insertReactiveId = ctx.insertReactiveId;
  if (ts.isJsxText(child)) {
    let raw: string;
    try {
      raw = child.getText();
    } catch {
      const sf = child.getSourceFile?.();
      raw = sf != null && child.pos >= 0 && child.end <= sf.text.length
        ? sf.text.slice(child.pos, child.end)
        : "";
    }
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return [];
    // 2.2 静态插入不经过 insert，直接 appendChild(createTextNode)
    return [
      factory.createExpressionStatement(
        factory.createCallExpression(
          factory.createPropertyAccessExpression(
            factory.createIdentifier(parentVar),
            "appendChild",
          ),
          undefined,
          [
            factory.createCallExpression(
              factory.createPropertyAccessExpression(
                ctx.docId,
                "createTextNode",
              ),
              undefined,
              [factory.createStringLiteral(text)],
            ),
          ],
        ),
      ),
    ];
  }
  if (ts.isJsxExpression(child)) {
    const expr = child.expression;
    if (!expr) return [];
    // 合成节点（如嵌套 return 被替换后的 .map 表达式）可能无 sourceFile，避免 getText() 抛错
    const node = expr as ts.Node;
    const srcFile = node.getSourceFile?.();
    // 箭头/函数字面量体可能无可靠 pos，safeNodeText 为空但仍须参与 insertReactive
    const isFnExpr = ts.isArrowFunction(expr) || ts.isFunctionExpression(expr);
    if (srcFile && !isFnExpr && safeNodeText(node).trim() === "") return [];
    /**
     * 表达式级多插入点：`{ a(), <div/> }` 等与块内 `a(); return <div/>` 同序；逗号左侧各项无 JSX 时拆成前段语句 + 末段仍按 JSX 子编译（v-once 子树保持整段原子语义，不拆）。
     */
    if (!ctx.inOnceSubtree && !isFnExpr) {
      const commaParts = flattenCommaOperandsRoot(expr as ts.Expression);
      if (commaParts.length > 1) {
        let prefixesOk = true;
        for (let i = 0; i < commaParts.length - 1; i++) {
          if (expressionContainsJsx(commaParts[i]!)) {
            prefixesOk = false;
            break;
          }
        }
        if (prefixesOk) {
          const lastPart = commaParts[commaParts.length - 1]!;
          const prefixStmts: ts.Statement[] = [];
          for (let i = 0; i < commaParts.length - 1; i++) {
            const p = commaParts[i]!;
            const foldedP = deepFoldStaticJsxExpressionForInsert(p);
            prefixStmts.push(
              factory.createExpressionStatement(
                transformExpressionJsxToCalls(foldedP),
              ),
            );
          }
          const lastChild = factory.updateJsxExpression(child, lastPart);
          return [
            ...prefixStmts,
            ...buildChildStatements(parentVar, lastChild, ctx),
          ];
        }
      }
    }
    /**
     * `{ <> 静态段 + 动态段 </> }`：缩小 insertReactive 粒度，静态段走 insert，动态段按子级分别编译。
     */
    if (!ctx.inOnceSubtree && !isFnExpr) {
      const fragForSplit = peelToFragmentRoot(expr as ts.Expression);
      if (fragForSplit != null) {
        const splitFrag = trySplitFragJsxKids(
          parentVar,
          fragForSplit,
          ctx,
        );
        if (splitFrag != null) return splitFrag;
      }
    }
    /**
     * `{ <div …>静…动…</div> }`：opening 静态且无指令时，元素一次创建，子级静/动分段挂载。
     */
    if (!ctx.inOnceSubtree && !isFnExpr) {
      const intrinsicForSplit = peelToIntrinsicElementRoot(
        expr as ts.Expression,
      );
      if (intrinsicForSplit != null) {
        const splitEl = trySplitIntrinsicJsxKids(
          parentVar,
          intrinsicForSplit,
          ctx,
        );
        if (splitEl != null) return splitEl;
      }
    }
    /**
     * `{ a && … }` / `{ a || … }` / `{ a ?? … }`（右侧为 Fragment/本征且子级静动混合）：**短路 + 内层分段**；`&&` 与 v-if 同向空挂载；`||` / `??` 单次求值左侧后择支，落 JSX 支时内层再 `insert` / `insertReactive` 分段。
     */
    if (!ctx.inOnceSubtree && !isFnExpr) {
      const andShortCircuitSplit = trySplitJsxAnd(
        parentVar,
        expr as ts.Expression,
        ctx,
      );
      if (andShortCircuitSplit != null) return andShortCircuitSplit;
      const orShortCircuitSplit = trySplitJsxOr(
        parentVar,
        expr as ts.Expression,
        ctx,
      );
      if (orShortCircuitSplit != null) return orShortCircuitSplit;
      const nullishShortCircuitSplit = trySplitJsxNullish(
        parentVar,
        expr as ts.Expression,
        ctx,
      );
      if (nullishShortCircuitSplit != null) return nullishShortCircuitSplit;
    }
    /**
     * 步骤 4：常量三元 + 逻辑短路深度折叠后再做 JSX→调用变换，使 `insert(parent, markMountFn(...))` 不经零参 getter。
     */
    const foldedForInsert = deepFoldStaticJsxExpressionForInsert(
      expr as ts.Expression,
    );
    const transformedExpr = transformExpressionJsxToCalls(foldedForInsert);
    /**
     * 步骤 4：纯静态 `{ … }`（字面量、纯本征 JSX、可折叠的 `true ? <a/> : <b/>` / `true&&<div/>` / `false||<div/>` / `null??<div/>` 等）走 `insert(parent, …)`，
     * 由运行时直接挂载 markMountFn/字面量，避免多余 insertReactive effect；v-once 子树仍走原路径。
     */
    const canHoistToInsert = !ctx.inOnceSubtree &&
      jsxExpressionMayHoistToInsertWithDeps(
        expr as ts.Expression,
        sourceExpressionIsStaticForOneShotInsert,
        ctx.reactiveBindings,
      );
    if (canHoistToInsert) {
      return [
        factory.createExpressionStatement(
          factory.createCallExpression(ctx.insertId, undefined, [
            factory.createIdentifier(parentVar),
            transformedExpr,
          ]),
        ),
      ];
    }
    // 无参箭头/函数表达式（如 { () => vModelText() || "(空)" }）须在 insertReactive 的 getter 内调用再返回，否则 getter() 返回函数，toNode(函数) 得空文本，页上不显示
    const exprForGetterInner = (ts.isArrowFunction(transformedExpr) ||
        ts.isFunctionExpression(transformedExpr)) &&
        transformedExpr.parameters.length === 0
      ? factory.createCallExpression(transformedExpr, undefined, [])
      : transformedExpr;
    /** 裸 `count` / `props.x` 包 unwrap；子树内 `?.map` / `?.flatMap` / `?.filter` / `?.['map']`、`&&`、**表达式体 / 块与分支 return / 块内 const f=()=>** `.map` 回调包 coalesce（见 {@link wrapGetterOptMap}） */
    const textInsertExpr = wrapGetterOptMap(
      wrapBareRefForTextInsert(exprForGetterInner),
    );
    const getterBody = wrapExprInUntrackIfOnce(textInsertExpr, ctx);
    // v-once：首次渲染一次，依赖变化时再更新一次然后冻结（createEffect 内第一次创建节点，第二次更新后 dispose）
    if (ctx.inOnceSubtree) {
      const nodeVar = nextVar();
      const disposeVar = nextVar();
      const valVar = nextVar();
      const createEffectId = ctx.createEffectId;
      return [
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [factory.createVariableDeclaration(
              nodeVar,
              undefined,
              undefined,
              factory.createNull(),
            )],
            ts.NodeFlags.Let,
          ),
        ),
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                disposeVar,
                undefined,
                undefined,
                factory.createCallExpression(createEffectId, undefined, [
                  factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    factory.createBlock(
                      [
                        factory.createVariableStatement(
                          undefined,
                          factory.createVariableDeclarationList(
                            [
                              factory.createVariableDeclaration(
                                valVar,
                                undefined,
                                undefined,
                                textInsertExpr,
                              ),
                            ],
                            ts.NodeFlags.Const,
                          ),
                        ),
                        factory.createIfStatement(
                          factory.createBinaryExpression(
                            factory.createIdentifier(nodeVar),
                            factory.createToken(
                              ts.SyntaxKind.EqualsEqualsEqualsToken,
                            ),
                            factory.createNull(),
                          ),
                          factory.createBlock(
                            [
                              factory.createExpressionStatement(
                                factory.createBinaryExpression(
                                  factory.createIdentifier(nodeVar),
                                  factory.createToken(
                                    ts.SyntaxKind.EqualsToken,
                                  ),
                                  factory.createCallExpression(
                                    factory.createPropertyAccessExpression(
                                      ctx.docId,
                                      "createTextNode",
                                    ),
                                    undefined,
                                    [
                                      factory.createCallExpression(
                                        factory.createIdentifier("String"),
                                        undefined,
                                        [factory.createIdentifier(valVar)],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              factory.createExpressionStatement(
                                factory.createCallExpression(
                                  factory.createPropertyAccessExpression(
                                    factory.createIdentifier(parentVar),
                                    "appendChild",
                                  ),
                                  undefined,
                                  [factory.createIdentifier(nodeVar)],
                                ),
                              ),
                            ],
                            true,
                          ),
                          factory.createBlock(
                            [
                              factory.createExpressionStatement(
                                factory.createBinaryExpression(
                                  factory.createPropertyAccessExpression(
                                    factory.createIdentifier(nodeVar),
                                    "textContent",
                                  ),
                                  factory.createToken(
                                    ts.SyntaxKind.EqualsToken,
                                  ),
                                  factory.createCallExpression(
                                    factory.createIdentifier("String"),
                                    undefined,
                                    [factory.createIdentifier(valVar)],
                                  ),
                                ),
                              ),
                              factory.createExpressionStatement(
                                factory.createCallExpression(
                                  factory.createIdentifier(disposeVar),
                                  undefined,
                                  [],
                                ),
                              ),
                            ],
                            true,
                          ),
                        ),
                      ],
                      true,
                    ),
                  ),
                ]),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      ];
    }
    // 2.3 动态插入点用 insertReactive，getter 可能返回 MountFn，由 runtime insertReactive 识别并调用
    return [
      factory.createExpressionStatement(
        factory.createCallExpression(insertReactiveId, undefined, [
          factory.createIdentifier(parentVar),
          factory.createArrowFunction(
            undefined,
            undefined,
            [],
            undefined,
            factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            getterBody,
          ),
        ]),
      ),
    ];
  }
  if (
    ts.isJsxElement(child) ||
    ts.isJsxFragment(child) ||
    ts.isJsxSelfClosingElement(child)
  ) {
    return buildElementStatements(parentVar, child, ctx, {});
  }
  return [];
}

/** 组件标签名（字符串）：用于识别 ErrorBoundary 等需将 children 作为 mount 函数传入的组件 */
function getComponentTagName(tag: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(tag)) return (tag as ts.Identifier).text;
  return safeNodeText(tag as ts.Node);
}

/** 对象字面量属性名：含连字符等非标识符字符时用字符串字面量，否则用标识符 */
function propNameToExpression(name: string): ts.PropertyName {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return factory.createIdentifier(name);
  }
  return factory.createStringLiteral(name);
}

/**
 * 将多段 props 合并为表达式：单段为对象字面量，多段为 mergeProps(a, b, …)（后者覆盖前者）。
 */
function mergePropsChain(segments: ts.Expression[]): ts.Expression {
  if (segments.length === 0) {
    return factory.createObjectLiteralExpression([], false);
  }
  if (segments.length === 1) return segments[0]!;
  return factory.createCallExpression(
    factory.createIdentifier("mergeProps"),
    undefined,
    segments,
  );
}

/**
 * 组件 props 合并时须跳过的编译器指令属性（勿传给用户组件函数）。
 *
 * @param name - JSX 属性名（camelCase 或 kebab-case）
 * @returns 是否为 v-if 等编译器保留指令名
 */
function isCompilerDirectivePropName(name: string): boolean {
  return (
    name === "vIf" || name === "v-if" ||
    name === "vElse" || name === "v-else" ||
    name === "vElseIf" || name === "v-else-if" ||
    name === "vOnce" || name === "v-once" ||
    name === "vCloak" || name === "v-cloak" ||
    name === "vSlotGetter" || name === "v-slot-getter" ||
    name === "key"
  );
}

/**
 * 是否为自定义指令（vFocus、vCopy 等）：需交给 applyDirectives 处理，不写 setAttribute。
 * 不含 ref（ref 仍由 buildAttributeStatements 内 ref 分支处理）。
 */
function isCustomDirectivePropName(name: string): boolean {
  if (
    name.startsWith("v") &&
    name.length > 1 &&
    name[1] === name[1].toUpperCase() &&
    !isCompilerDirectivePropName(name)
  ) {
    return true;
  }
  if (name.startsWith("v-") && !isCompilerDirectivePropName(name)) return true;
  return false;
}

/**
 * 从 JSX 属性中收集「自定义指令」键值，生成供 applyDirectives(el, props, ...) 用的对象字面量；无则返回 null。
 */
function buildDirectivePropsObject(
  attrs: ts.JsxAttributes,
): ts.ObjectLiteralExpression | null {
  const entries: ts.ObjectLiteralElementLike[] = [];
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (!isCustomDirectivePropName(name)) continue;
    let value: ts.Expression;
    if (prop.initializer) {
      if (ts.isStringLiteral(prop.initializer)) {
        value = prop.initializer;
      } else if (ts.isJsxExpression(prop.initializer)) {
        const expr = prop.initializer.expression;
        value = expr && safeNodeText(expr as ts.Node).trim() !== ""
          ? (expr as ts.Expression)
          : factory.createTrue();
      } else {
        value = factory.createTrue();
      }
    } else {
      value = factory.createTrue();
    }
    entries.push(
      factory.createPropertyAssignment(
        factory.createIdentifier(name),
        value,
      ),
    );
  }
  if (entries.length === 0) return null;
  return factory.createObjectLiteralExpression(entries, false);
}

/**
 * 按源码顺序把 JsxAttributes 拆成 mergeProps 参数：spread 为原表达式，单属性为单键对象字面量。
 * 组件 props 用：指令属性（v-if 等）不进入 merge，由兄弟链/内置分支单独处理。
 */
function buildJsxAttributesMergeSegments(
  attributes: ts.JsxAttributes,
): ts.Expression[] {
  const segments: ts.Expression[] = [];
  for (const prop of attributes.properties) {
    if (ts.isJsxSpreadAttribute(prop)) {
      segments.push(prop.expression);
      continue;
    }
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (isCompilerDirectivePropName(name)) continue;
    let value: ts.Expression;
    if (prop.initializer) {
      if (ts.isStringLiteral(prop.initializer)) {
        value = prop.initializer;
      } else if (ts.isJsxExpression(prop.initializer)) {
        const expr = prop.initializer.expression;
        const isFn = expr &&
          (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr));
        /**
         * compileSource 会先 visit 子树改写对象内的「箭头 + JSX」等节点，对象字面量经 update 后常无有效 pos，
         * safeNodeText 得到空串；若据此判空会把 `expandable={{ expandedRowRender: () => <p/> }}` 整段打成 undefined，
         * 运行时节流掉展开列等业务 props。
         */
        const isCompoundLiteralPreserved = !!expr &&
          (ts.isObjectLiteralExpression(expr) ||
            ts.isArrayLiteralExpression(expr));
        const isEmpty = !expr ||
          (!isFn && !isCompoundLiteralPreserved &&
            safeNodeText(expr as ts.Node).trim() === "");
        value = !isEmpty
          ? (expr as ts.Expression)
          : factory.createIdentifier("undefined");
      } else {
        value = factory.createIdentifier("undefined");
      }
    } else {
      value = factory.createTrue();
    }
    segments.push(
      factory.createObjectLiteralExpression([
        factory.createPropertyAssignment(propNameToExpression(name), value),
      ], false),
    );
  }
  return segments;
}

/**
 * 判断表达式是否为**无参**箭头函数或 `function` 字面量（unwrap 括号后）。
 *
 * @param expr - 已展开 JSX 后的表达式
 */
function expressionIsZeroArgFunction(expr: ts.Expression): boolean {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
    return e.parameters.length === 0;
  }
  return false;
}

/** `For` / `Index` 的 `each` 须包成无参 accessor */
const EACH_ACC_KEYS = new Set<string>(["each"]);

/** `Show` 的 `when` 须包成无参 accessor */
const WHEN_ACC_KEYS = new Set<string>(["when"]);

/** `Dynamic` 的 `component` 须包成无参 accessor */
const DYNC_ACC_KEYS = new Set<string>([
  "component",
]);

/**
 * 与 {@link buildJsxAttributesMergeSegments} 相同，但对 **集合内属性名** 做 `transformExpressionJsxToCalls`，
 * 且表达式非无参函数字面量时包一层 `() => expr`，便于在 memo 内订阅 signal（`each` / `when` 等 accessor 属性）。
 *
 * @param attributes - 组件 opening attributes
 * @param accessorPropNames - 需包装的属性名，如 `each`、`when`
 */
function buildJsxAccSegs(
  attributes: ts.JsxAttributes,
  accessorPropNames: ReadonlySet<string>,
): ts.Expression[] {
  const segments: ts.Expression[] = [];
  for (const prop of attributes.properties) {
    if (ts.isJsxSpreadAttribute(prop)) {
      segments.push(prop.expression);
      continue;
    }
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (isCompilerDirectivePropName(name)) continue;
    let value: ts.Expression;
    if (prop.initializer) {
      if (ts.isStringLiteral(prop.initializer)) {
        value = prop.initializer;
      } else if (ts.isJsxExpression(prop.initializer)) {
        const expr = prop.initializer.expression;
        const isFn = expr &&
          (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr));
        const isCompoundLiteralPreserved = !!expr &&
          (ts.isObjectLiteralExpression(expr) ||
            ts.isArrayLiteralExpression(expr));
        const isEmpty = !expr ||
          (!isFn && !isCompoundLiteralPreserved &&
            safeNodeText(expr as ts.Node).trim() === "");
        value = !isEmpty
          ? (expr as ts.Expression)
          : factory.createIdentifier("undefined");
      } else {
        value = factory.createIdentifier("undefined");
      }
    } else {
      value = factory.createTrue();
    }
    if (accessorPropNames.has(name)) {
      let acc = transformExpressionJsxToCalls(value);
      if (!expressionIsZeroArgFunction(acc)) {
        acc = factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          acc,
        );
      }
      value = acc;
    }
    segments.push(
      factory.createObjectLiteralExpression([
        factory.createPropertyAssignment(propNameToExpression(name), value),
      ], false),
    );
  }
  return segments;
}

/**
 * {@link For} / {@link Index}：`each` 走 {@link buildJsxAccSegs}。
 *
 * @param attributes - 组件 opening attributes
 */
function buildJsxEachSegs(
  attributes: ts.JsxAttributes,
): ts.Expression[] {
  return buildJsxAccSegs(
    attributes,
    EACH_ACC_KEYS,
  );
}

/**
 * 将表达式中的 JSX 递归展开为与模板一致的运行时语句形态：任意标签/Fragment 均走 `jsxToRuntimeFunction`（嵌套时 `resetVarCounter: false`）。
 * 覆盖：三元、**任意**二元运算（含 `,`、`=`、`===` 等，以便左侧/右侧子树内出现 `&&`/JSX 时仍能展开）、逗号列表、一元、`await`、
 * satisfies、括号、类型断言、JsxElement/JsxSelfClosingElement/JsxFragment。
 */
function transformExpressionJsxToCalls(
  expr: ts.Expression,
): ts.Expression {
  if (ts.isParenthesizedExpression(expr)) {
    return factory.createParenthesizedExpression(
      transformExpressionJsxToCalls(expr.expression),
    );
  }
  if (ts.isConditionalExpression(expr)) {
    return factory.createConditionalExpression(
      transformExpressionJsxToCalls(expr.condition),
      expr.questionToken,
      transformExpressionJsxToCalls(expr.whenTrue),
      expr.colonToken,
      transformExpressionJsxToCalls(expr.whenFalse),
    );
  }
  // 所有 BinaryExpression 均向下递归：仅处理 &&||?? 时，`(0, <span/>)`、`!(a && <div/>)` 等内层 JSX 会漏转。
  if (ts.isBinaryExpression(expr)) {
    return factory.createBinaryExpression(
      transformExpressionJsxToCalls(expr.left as ts.Expression),
      expr.operatorToken,
      transformExpressionJsxToCalls(expr.right as ts.Expression),
    );
  }
  if (ts.isCommaListExpression(expr)) {
    return factory.createCommaListExpression(
      expr.elements.map((e) =>
        transformExpressionJsxToCalls(e as ts.Expression)
      ),
    );
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    return factory.createPrefixUnaryExpression(
      expr.operator,
      transformExpressionJsxToCalls(expr.operand),
    );
  }
  if (ts.isPostfixUnaryExpression(expr)) {
    return factory.createPostfixUnaryExpression(
      transformExpressionJsxToCalls(expr.operand),
      expr.operator,
    );
  }
  if (ts.isAwaitExpression(expr)) {
    return factory.createAwaitExpression(
      transformExpressionJsxToCalls(expr.expression),
    );
  }
  if (ts.isSatisfiesExpression(expr)) {
    return factory.createSatisfiesExpression(
      transformExpressionJsxToCalls(expr.expression),
      expr.type,
    );
  }
  if (ts.isTypeAssertionExpression(expr)) {
    const node = expr as ts.TypeAssertion;
    return factory.updateTypeAssertion(
      node,
      node.type,
      transformExpressionJsxToCalls(node.expression),
    );
  }
  if (ts.isAsExpression(expr)) {
    return factory.createAsExpression(
      transformExpressionJsxToCalls(expr.expression),
      expr.type,
    );
  }
  if (ts.isNonNullExpression(expr)) {
    return factory.createNonNullExpression(
      transformExpressionJsxToCalls(expr.expression),
    );
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return factory.updatePropertyAccessExpression(
      expr,
      transformExpressionJsxToCalls(expr.expression),
      expr.name,
    );
  }
  if (ts.isElementAccessExpression(expr)) {
    return factory.updateElementAccessExpression(
      expr,
      transformExpressionJsxToCalls(expr.expression),
      transformExpressionJsxToCalls(expr.argumentExpression),
    );
  }
  if (ts.isCallExpression(expr)) {
    const transformedArgs = expr.arguments.map((arg) => {
      if (ts.isSpreadElement(arg)) {
        return factory.createSpreadElement(
          transformExpressionJsxToCalls(arg.expression),
        );
      }
      const argExpr = arg as ts.Expression;
      if (ts.isArrowFunction(argExpr) || ts.isFunctionExpression(argExpr)) {
        return transformArrowOrFunctionWithBlockBody(argExpr);
      }
      return transformExpressionJsxToCalls(argExpr);
    });
    return factory.updateCallExpression(
      expr,
      transformExpressionJsxToCalls(expr.expression),
      expr.typeArguments,
      transformedArgs,
    );
  }
  if (ts.isNewExpression(expr)) {
    const newArgs = expr.arguments?.map((arg) =>
      ts.isSpreadElement(arg)
        ? factory.createSpreadElement(
          transformExpressionJsxToCalls(arg.expression),
        )
        : transformExpressionJsxToCalls(arg as ts.Expression)
    );
    return factory.updateNewExpression(
      expr,
      transformExpressionJsxToCalls(expr.expression),
      expr.typeArguments,
      newArgs,
    );
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return factory.updateArrayLiteralExpression(
      expr,
      expr.elements.map((el) =>
        ts.isSpreadElement(el)
          ? factory.createSpreadElement(
            transformExpressionJsxToCalls(el.expression),
          )
          : transformExpressionJsxToCalls(el as ts.Expression)
      ),
    );
  }
  if (ts.isArrowFunction(expr)) {
    return transformArrowOrFunctionWithBlockBody(expr);
  }
  if (ts.isFunctionExpression(expr)) {
    return transformArrowOrFunctionWithBlockBody(expr);
  }
  if (
    ts.isJsxSelfClosingElement(expr) ||
    ts.isJsxElement(expr) ||
    ts.isJsxFragment(expr)
  ) {
    return jsxToRuntimeFunction(expr, { resetVarCounter: false });
  }
  if (ts.isVoidExpression(expr)) {
    return factory.createVoidExpression(
      transformExpressionJsxToCalls(expr.expression),
    );
  }
  return expr;
}

/**
 * 扫描块内语句是否含 JSX（与 `expressionContainsJsx` 配合，用于箭头/函数字面量块体）。
 *
 * @param block - 语句块
 * @returns 是否包含任意 JSX 节点
 */
function blockContainsJsx(block: ts.Block): boolean {
  return block.statements.some(statementContainsJsx);
}

/**
 * 扫描单条语句子树是否含 JSX（回调块、`if` 内 `rows.push(<tr/>)` 等）。
 *
 * @param stmt - TypeScript 语句节点
 * @returns 是否包含任意 JSX 节点
 */
function statementContainsJsx(stmt: ts.Statement): boolean {
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.some((d) =>
      d.initializer ? expressionContainsJsx(d.initializer) : false
    );
  }
  if (ts.isReturnStatement(stmt)) {
    return expressionContainsJsx(stmt.expression);
  }
  if (ts.isExpressionStatement(stmt)) {
    return expressionContainsJsx(stmt.expression);
  }
  if (ts.isIfStatement(stmt)) {
    return expressionContainsJsx(stmt.expression) ||
      statementContainsJsx(stmt.thenStatement) ||
      (stmt.elseStatement ? statementContainsJsx(stmt.elseStatement) : false);
  }
  if (ts.isBlock(stmt)) {
    return blockContainsJsx(stmt);
  }
  if (ts.isForStatement(stmt)) {
    if (stmt.initializer) {
      if (ts.isVariableDeclarationList(stmt.initializer)) {
        if (
          stmt.initializer.declarations.some((d) =>
            d.initializer && expressionContainsJsx(d.initializer)
          )
        ) {
          return true;
        }
      } else if (expressionContainsJsx(stmt.initializer)) {
        return true;
      }
    }
    if (stmt.condition && expressionContainsJsx(stmt.condition)) {
      return true;
    }
    if (stmt.incrementor && expressionContainsJsx(stmt.incrementor)) {
      return true;
    }
    return statementContainsJsx(stmt.statement);
  }
  if (ts.isForOfStatement(stmt) || ts.isForInStatement(stmt)) {
    return expressionContainsJsx(stmt.expression) ||
      statementContainsJsx(stmt.statement);
  }
  if (ts.isWhileStatement(stmt)) {
    return expressionContainsJsx(stmt.expression) ||
      statementContainsJsx(stmt.statement);
  }
  if (ts.isDoStatement(stmt)) {
    return expressionContainsJsx(stmt.expression) ||
      statementContainsJsx(stmt.statement);
  }
  if (ts.isSwitchStatement(stmt)) {
    if (expressionContainsJsx(stmt.expression)) return true;
    return stmt.caseBlock.clauses.some((clause) => {
      if (ts.isCaseClause(clause)) {
        return expressionContainsJsx(clause.expression) ||
          clause.statements.some(statementContainsJsx);
      }
      return clause.statements.some(statementContainsJsx);
    });
  }
  if (ts.isTryStatement(stmt)) {
    return blockContainsJsx(stmt.tryBlock) ||
      (stmt.catchClause ? blockContainsJsx(stmt.catchClause.block) : false) ||
      (stmt.finallyBlock ? blockContainsJsx(stmt.finallyBlock) : false);
  }
  if (ts.isThrowStatement(stmt)) {
    return expressionContainsJsx(stmt.expression);
  }
  if (ts.isLabeledStatement(stmt)) {
    return statementContainsJsx(stmt.statement);
  }
  if (ts.isWithStatement(stmt)) {
    return expressionContainsJsx(stmt.expression) ||
      statementContainsJsx(stmt.statement);
  }
  return false;
}

/**
 * 将块内每条语句里的表达式递归做 JSX→运行时调用（用于 `flatMap(() => { const rows = [<tr/>]; … })`）。
 *
 * @param block - 原始块
 * @returns 转换后的块
 */
function transformBlockStatementsContainingJsx(block: ts.Block): ts.Block {
  return factory.updateBlock(
    block,
    block.statements.map(transformStatementContainingJsx),
  );
}

/**
 * 将单条语句中的表达式递归做 JSX→运行时调用。
 *
 * @param stmt - 原始语句
 * @returns 转换后的语句；不支持的语句类型原样返回
 */
function transformStatementContainingJsx(stmt: ts.Statement): ts.Statement {
  if (ts.isVariableStatement(stmt)) {
    return factory.updateVariableStatement(
      stmt,
      stmt.modifiers,
      factory.updateVariableDeclarationList(
        stmt.declarationList,
        stmt.declarationList.declarations.map((d) =>
          factory.updateVariableDeclaration(
            d,
            d.name,
            d.exclamationToken,
            d.type,
            d.initializer
              ? transformExpressionJsxToCalls(d.initializer)
              : undefined,
          )
        ),
      ),
    );
  }
  if (ts.isReturnStatement(stmt)) {
    return factory.updateReturnStatement(
      stmt,
      stmt.expression
        ? transformExpressionJsxToCalls(stmt.expression)
        : undefined,
    );
  }
  if (ts.isExpressionStatement(stmt)) {
    return factory.updateExpressionStatement(
      stmt,
      transformExpressionJsxToCalls(stmt.expression),
    );
  }
  if (ts.isIfStatement(stmt)) {
    return factory.updateIfStatement(
      stmt,
      transformExpressionJsxToCalls(stmt.expression),
      transformStatementContainingJsxAsMaybeBlock(stmt.thenStatement),
      stmt.elseStatement
        ? transformStatementContainingJsxAsMaybeBlock(stmt.elseStatement)
        : undefined,
    );
  }
  if (ts.isBlock(stmt)) {
    return transformBlockStatementsContainingJsx(stmt);
  }
  if (ts.isForStatement(stmt)) {
    let initializer: ts.ForInitializer | undefined = stmt.initializer;
    if (initializer !== undefined) {
      if (ts.isVariableDeclarationList(initializer)) {
        initializer = factory.updateVariableDeclarationList(
          initializer,
          initializer.declarations.map((d) =>
            factory.updateVariableDeclaration(
              d,
              d.name,
              d.exclamationToken,
              d.type,
              d.initializer
                ? transformExpressionJsxToCalls(d.initializer)
                : undefined,
            )
          ),
        );
      } else {
        initializer = transformExpressionJsxToCalls(initializer);
      }
    }
    return factory.updateForStatement(
      stmt,
      initializer,
      stmt.condition
        ? transformExpressionJsxToCalls(stmt.condition)
        : undefined,
      stmt.incrementor
        ? transformExpressionJsxToCalls(stmt.incrementor)
        : undefined,
      transformStatementContainingJsxAsMaybeBlock(stmt.statement),
    );
  }
  if (ts.isForOfStatement(stmt)) {
    return factory.updateForOfStatement(
      stmt,
      stmt.awaitModifier,
      stmt.initializer,
      transformExpressionJsxToCalls(stmt.expression),
      transformStatementContainingJsxAsMaybeBlock(stmt.statement),
    );
  }
  if (ts.isForInStatement(stmt)) {
    return factory.updateForInStatement(
      stmt,
      stmt.initializer,
      transformExpressionJsxToCalls(stmt.expression),
      transformStatementContainingJsxAsMaybeBlock(stmt.statement),
    );
  }
  if (ts.isWhileStatement(stmt)) {
    return factory.updateWhileStatement(
      stmt,
      transformExpressionJsxToCalls(stmt.expression),
      transformStatementContainingJsxAsMaybeBlock(stmt.statement),
    );
  }
  if (ts.isDoStatement(stmt)) {
    return factory.updateDoStatement(
      stmt,
      transformStatementContainingJsxAsMaybeBlock(stmt.statement),
      transformExpressionJsxToCalls(stmt.expression),
    );
  }
  if (ts.isSwitchStatement(stmt)) {
    return factory.updateSwitchStatement(
      stmt,
      transformExpressionJsxToCalls(stmt.expression),
      factory.updateCaseBlock(
        stmt.caseBlock,
        stmt.caseBlock.clauses.map((clause) => {
          if (ts.isCaseClause(clause)) {
            return factory.updateCaseClause(
              clause,
              transformExpressionJsxToCalls(clause.expression),
              clause.statements.map(transformStatementContainingJsx),
            );
          }
          return factory.updateDefaultClause(
            clause,
            clause.statements.map(transformStatementContainingJsx),
          );
        }),
      ),
    );
  }
  if (ts.isTryStatement(stmt)) {
    return factory.updateTryStatement(
      stmt,
      transformBlockStatementsContainingJsx(stmt.tryBlock),
      stmt.catchClause
        ? factory.updateCatchClause(
          stmt.catchClause,
          stmt.catchClause.variableDeclaration,
          transformBlockStatementsContainingJsx(stmt.catchClause.block),
        )
        : undefined,
      stmt.finallyBlock
        ? transformBlockStatementsContainingJsx(stmt.finallyBlock)
        : undefined,
    );
  }
  if (ts.isThrowStatement(stmt)) {
    return factory.updateThrowStatement(
      stmt,
      transformExpressionJsxToCalls(stmt.expression),
    );
  }
  if (ts.isLabeledStatement(stmt)) {
    return factory.updateLabeledStatement(
      stmt,
      stmt.label,
      transformStatementContainingJsx(stmt.statement),
    );
  }
  if (ts.isWithStatement(stmt)) {
    return factory.updateWithStatement(
      stmt,
      transformExpressionJsxToCalls(stmt.expression),
      transformStatementContainingJsxAsMaybeBlock(stmt.statement),
    );
  }
  return stmt;
}

/**
 * `if` 的 then/else 可能是单条语句或块，统一做 JSX 展开。
 *
 * @param stmt - then 或 else 分支
 * @returns 转换后的语句
 */
function transformStatementContainingJsxAsMaybeBlock(
  stmt: ts.Statement,
): ts.Statement {
  if (ts.isBlock(stmt)) {
    return transformBlockStatementsContainingJsx(stmt);
  }
  return transformStatementContainingJsx(stmt);
}

/**
 * 将箭头函数或函数字面量体（表达式体或块体）内的 JSX 递归展开为运行时调用形态。
 *
 * @param fn - 箭头函数或 `function` 表达式
 * @returns 转换后的函数节点
 */
function transformArrowOrFunctionWithBlockBody(
  fn: ts.ArrowFunction | ts.FunctionExpression,
): ts.ArrowFunction | ts.FunctionExpression {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
    return factory.updateArrowFunction(
      fn,
      fn.modifiers,
      fn.typeParameters,
      fn.parameters,
      fn.type,
      fn.equalsGreaterThanToken,
      transformExpressionJsxToCalls(fn.body as ts.Expression) as ts.ConciseBody,
    );
  }
  if (!ts.isBlock(fn.body)) {
    return fn;
  }
  const newBlock = transformBlockStatementsContainingJsx(fn.body);
  if (ts.isArrowFunction(fn)) {
    return factory.updateArrowFunction(
      fn,
      fn.modifiers,
      fn.typeParameters,
      fn.parameters,
      fn.type,
      fn.equalsGreaterThanToken,
      newBlock,
    );
  }
  return factory.updateFunctionExpression(
    fn,
    fn.modifiers,
    fn.asteriskToken,
    fn.name,
    fn.typeParameters,
    fn.parameters,
    fn.type,
    newBlock,
  );
}

/**
 * 判断表达式树中是否出现任意 JSX（用于 `return a ? <div/> : <span/>` 等非「单根 JSX」的 compileSource 分支）。
 *
 * @param node - 待扫描的表达式
 * @returns 是否包含 JsxElement / JsxFragment / JsxSelfClosingElement
 */
function expressionContainsJsx(node: ts.Expression | undefined): boolean {
  if (!node) return false;
  if (
    ts.isJsxElement(node) ||
    ts.isJsxFragment(node) ||
    ts.isJsxSelfClosingElement(node)
  ) {
    return true;
  }
  if (ts.isParenthesizedExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return expressionContainsJsx(node.condition) ||
      expressionContainsJsx(node.whenTrue) ||
      expressionContainsJsx(node.whenFalse);
  }
  if (ts.isBinaryExpression(node)) {
    return expressionContainsJsx(node.left as ts.Expression) ||
      expressionContainsJsx(node.right as ts.Expression);
  }
  if (ts.isCallExpression(node)) {
    if (expressionContainsJsx(node.expression)) return true;
    return node.arguments.some((a) => {
      if (ts.isSpreadElement(a)) {
        return expressionContainsJsx(a.expression);
      }
      return expressionContainsJsx(a as ts.Expression);
    });
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((el) => {
      if (ts.isSpreadElement(el)) {
        return expressionContainsJsx(el.expression);
      }
      return expressionContainsJsx(el as ts.Expression);
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some((p) => {
      if (ts.isPropertyAssignment(p)) {
        return expressionContainsJsx(p.initializer as ts.Expression);
      }
      if (ts.isSpreadAssignment(p)) {
        return expressionContainsJsx(p.expression);
      }
      return false;
    });
  }
  if (ts.isTypeAssertionExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isAsExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isSpreadElement(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isElementAccessExpression(node)) {
    return expressionContainsJsx(node.expression) ||
      expressionContainsJsx(node.argumentExpression);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isNewExpression(node)) {
    if (expressionContainsJsx(node.expression)) return true;
    const args = node.arguments ?? [];
    return args.some((a) => {
      if (ts.isSpreadElement(a)) {
        return expressionContainsJsx(a.expression);
      }
      return expressionContainsJsx(a as ts.Expression);
    });
  }
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return expressionContainsJsx(node.operand);
  }
  if (ts.isCommaListExpression(node)) {
    return node.elements.some((e) =>
      ts.isExpression(e) && expressionContainsJsx(e)
    );
  }
  if (ts.isAwaitExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isSatisfiesExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isNonNullExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isVoidExpression(node)) {
    return expressionContainsJsx(node.expression);
  }
  if (ts.isArrowFunction(node)) {
    if (ts.isBlock(node.body)) {
      return blockContainsJsx(node.body);
    }
    return expressionContainsJsx(node.body as ts.Expression);
  }
  if (ts.isFunctionExpression(node)) {
    if (ts.isBlock(node.body)) {
      return blockContainsJsx(node.body);
    }
    return expressionContainsJsx(node.body as ts.Expression);
  }
  return false;
}

/**
 * 根级 `return` / 箭头表达式体含 JSX 但非单棵 JSX 时，包成 `(parent) => { insertReactive(parent, () => …); }`。
 *
 * @param expr - 原始 return 体或箭头表达式体
 * @returns 与 `jsxToRuntimeFunction` 同形的根挂载箭头
 */
/**
 * 是否为顶层的 `new Promise(...)`（外层可有一层括号）。
 * `return new Promise((resolve) => { ... resolve(<Jsx/>) })` 若整段被 {@link wrapExpressionContainingJsxAsRootMountFn} 包成单参挂载函数，
 * 则 `asyncPromise.value` 等会得到非 thenable，Suspense 永远停在 fallback（examples boundary）。
 * 此类 return 仅递归 {@link transformExpressionJsxToCalls}，变换内层 JSX 即可。
 *
 * @param expr - `return` 的 expression
 */
function isTopLevelNewPromiseExpression(expr: ts.Expression): boolean {
  const inner = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
  return (
    ts.isNewExpression(inner) &&
    ts.isIdentifier(inner.expression) &&
    inner.expression.text === "Promise"
  );
}

/**
 * 本征 opening 上属性是否均可证静态（无指令、无 spread、值可走 {@link sourceExpressionIsStaticForOneShotInsert}）。
 */
function jsxIntrinsicOpeningAttributesFullyStatic(
  attrs: ts.JsxAttributes,
): boolean {
  if (getVIfCondition(attrs) !== null) return false;
  if (hasVOnceAttribute(attrs)) return false;
  if (hasVCloakAttribute(attrs)) return false;
  for (const prop of attrs.properties) {
    if (ts.isJsxSpreadAttribute(prop)) return false;
    if (!ts.isJsxAttribute(prop)) continue;
    const name = (prop.name as ts.Identifier).text;
    if (isCompilerDirectivePropName(name)) return false;
    if (!prop.initializer) continue;
    if (ts.isStringLiteral(prop.initializer)) continue;
    if (ts.isJsxExpression(prop.initializer)) {
      const ex = prop.initializer.expression;
      if (
        !ex ||
        !sourceExpressionIsStaticForOneShotInsert(ex as ts.Expression)
      ) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Fragment 子节点是否整段可证静态，可提到 **`insert(parent, …)`** 而不与动态段同包一层 `insertReactive`。
 */
function jsxChildIsFullyStaticForFragmentHoist(child: ts.JsxChild): boolean {
  if (isWhitespaceOnlyJsxText(child)) return true;
  if (ts.isJsxText(child)) return true;
  if (ts.isJsxExpression(child)) {
    const ex = child.expression;
    if (!ex) return true;
    return jsxExpressionMayHoistToInsertWithDeps(
      ex as ts.Expression,
      sourceExpressionIsStaticForOneShotInsert,
      getCurrentReactiveBindingsForCompile(),
    );
  }
  if (ts.isJsxFragment(child)) {
    return child.children.every((c) =>
      jsxChildIsFullyStaticForFragmentHoist(c)
    );
  }
  if (ts.isJsxSelfClosingElement(child)) {
    return jsxIntrinsicOpeningAttributesFullyStatic(child.attributes);
  }
  if (ts.isJsxElement(child)) {
    if (
      !jsxIntrinsicOpeningAttributesFullyStatic(child.openingElement.attributes)
    ) {
      return false;
    }
    return child.children.every((c) =>
      jsxChildIsFullyStaticForFragmentHoist(c)
    );
  }
  return false;
}

/**
 * 子节点列表上的 **静态 / 动态** 交替段（与根级 Fragment 分段、本征元素子级分段共用）。
 */
type StaticDynamicChildSeg = {
  kind: "static" | "dynamic";
  children: ts.JsxChild[];
};

/**
 * 若 `meaningful` 子节点中同时存在可 hoist 静态段与动态段，则合并相邻同类为段列表；否则返回 `null`。
 *
 * @param meaningful - 已滤空白文本的子节点
 */
function collectMixedStaticDynamicSegments(
  meaningful: readonly ts.JsxChild[],
): StaticDynamicChildSeg[] | null {
  if (meaningful.length === 0) return null;
  let hasStatic = false;
  let hasDynamic = false;
  for (const c of meaningful) {
    if (jsxChildIsFullyStaticForFragmentHoist(c)) hasStatic = true;
    else hasDynamic = true;
  }
  if (!hasStatic || !hasDynamic) return null;
  const segments: StaticDynamicChildSeg[] = [];
  for (const c of meaningful) {
    const st = jsxChildIsFullyStaticForFragmentHoist(c);
    const kind: StaticDynamicChildSeg["kind"] = st ? "static" : "dynamic";
    const last = segments.at(-1);
    if (last && last.kind === kind) last.children.push(c);
    else segments.push({ kind, children: [c] });
  }
  return segments;
}

/**
 * 将静/动段编译为挂到 **`mountParentVar`** 上的 `insert` / `buildChildStatements` 语句。
 *
 * @param mountParentVar - 子内容挂载到的 DOM 变量
 * @param segments - {@link collectMixedStaticDynamicSegments} 产物
 * @param ctx - 发射上下文
 * @returns 语句列表
 */
function emitStaticDynamicChildSegmentStatements(
  mountParentVar: string,
  segments: readonly StaticDynamicChildSeg[],
  ctx: EmitContext,
): ts.Statement[] {
  const stmts: ts.Statement[] = [];
  let firstMount = true;
  for (const seg of segments) {
    if (seg.kind === "static") {
      const m = seg.children.filter((c) => !isWhitespaceOnlyJsxText(c));
      if (m.length === 0) continue;
      let jsxRoot: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement;
      if (
        m.length === 1 &&
        (ts.isJsxElement(m[0]!) || ts.isJsxSelfClosingElement(m[0]!))
      ) {
        jsxRoot = m[0] as ts.JsxElement | ts.JsxSelfClosingElement;
      } else {
        jsxRoot = factory.createJsxFragment(
          factory.createJsxOpeningFragment(),
          seg.children,
          factory.createJsxJsxClosingFragment(),
        );
      }
      const mountExpr = jsxToRuntimeFunction(jsxRoot, {
        resetVarCounter: firstMount,
        inOnceSubtree: ctx.inOnceSubtree,
      });
      firstMount = false;
      stmts.push(
        factory.createExpressionStatement(
          factory.createCallExpression(ctx.insertId, undefined, [
            factory.createIdentifier(mountParentVar),
            mountExpr,
          ]),
        ),
      );
    } else {
      for (const d of seg.children) {
        if (isWhitespaceOnlyJsxText(d)) continue;
        stmts.push(...buildChildStatements(mountParentVar, d, ctx));
        firstMount = false;
      }
    }
  }
  return stmts;
}

/**
 * 从逗号表达式等剥出 **根 `JsxFragment`**，供 {@link trySplitFragReactive} 使用。
 * `+` 链仅当 **左侧可证静态** 时才向右剥，避免 `n + <>` 误把 Fragment 当根。
 */
function peelToFragmentRoot(expr: ts.Expression): ts.JsxFragment | null {
  let e: ts.Expression = stripExprWrappersForConstantEval(expr);
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isCommaListExpression(e) && e.elements.length > 0) {
    return peelToFragmentRoot(
      e.elements[e.elements.length - 1] as ts.Expression,
    );
  }
  /** `"" + (<>…</>)` 等：左侧须静态，再取最右侧 JSX 操作数 */
  if (
    ts.isBinaryExpression(e) &&
    e.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    if (!sourceExpressionIsStaticForOneShotInsert(e.left as ts.Expression)) {
      return null;
    }
    const r = peelToFragmentRoot(e.right as ts.Expression);
    if (r != null) return r;
  }
  if (ts.isJsxFragment(e)) return e;
  return null;
}

/**
 * 剥出 **本征 `JsxElement` 根**（单标识符标签）；`+` 链要求左侧可证静态。供花括号内子级细粒度拆分。
 *
 * @param expr - `{ … }` 内表达式
 */
function peelToIntrinsicElementRoot(expr: ts.Expression): ts.JsxElement | null {
  let e: ts.Expression = stripExprWrappersForConstantEval(expr);
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isCommaListExpression(e) && e.elements.length > 0) {
    return peelToIntrinsicElementRoot(
      e.elements[e.elements.length - 1] as ts.Expression,
    );
  }
  if (
    ts.isBinaryExpression(e) &&
    e.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    if (!sourceExpressionIsStaticForOneShotInsert(e.left as ts.Expression)) {
      return null;
    }
    return peelToIntrinsicElementRoot(e.right as ts.Expression);
  }
  if (ts.isJsxElement(e)) {
    const tag = jsxIntrinsicIdentifierTagName(e.openingElement.tagName);
    if (tag != null && isIntrinsicElement(tag)) return e;
  }
  return null;
}

/**
 * 本征元素 opening 是否可证静态且无指令（与子级静/动分段前提一致）。
 *
 * @param el - 本征 JSX 元素
 */
function intrinsicElementQualifiesForSplitMount(el: ts.JsxElement): boolean {
  const open = el.openingElement;
  const attrs = open.attributes;
  if (!ts.isJsxAttributes(attrs)) return false;
  if (getVIfCondition(attrs) != null) return false;
  if (hasVElseIfAttribute(attrs) || hasVElseAttribute(attrs)) return false;
  if (hasVOnceAttribute(attrs) || hasVCloakAttribute(attrs)) return false;
  if (hasVSlotGetterAttribute(attrs)) return false;
  if (buildDirectivePropsObject(attrs) != null) return false;
  if (!jsxIntrinsicOpeningAttributesFullyStatic(attrs)) return false;
  const tagName = typeof (open.tagName as ts.Identifier).text === "string"
    ? (open.tagName as ts.Identifier).text
    : safeNodeText(open.tagName as ts.Node) || "div";
  if (!isIntrinsicElement(tagName)) return false;
  if (jsxIntrinsicIdentifierTagName(open.tagName) == null) return false;
  return true;
}

/**
 * 创建本征元素、挂静态属性、append 到 `appendTargetVar`，并对 **静动混合** 子级分段挂载。
 *
 * @param appendTargetVar - `appendChild` 目标父节点变量
 * @param el - 本征元素 AST
 * @param ctx - 发射上下文
 */
function buildSplitIntrinsicElementMountStmts(
  appendTargetVar: string,
  el: ts.JsxElement,
  ctx: EmitContext,
): ts.Statement[] | null {
  if (!intrinsicElementQualifiesForSplitMount(el)) return null;
  const open = el.openingElement;
  const attrs = open.attributes as ts.JsxAttributes;
  const tagName = typeof (open.tagName as ts.Identifier).text === "string"
    ? (open.tagName as ts.Identifier).text
    : safeNodeText(open.tagName as ts.Node) || "div";

  const meaningful = el.children.filter((c) => !isWhitespaceOnlyJsxText(c));
  const segments = collectMixedStaticDynamicSegments(meaningful);
  if (segments == null) return null;

  const elVar = nextVar();
  const childCtx: EmitContext = { ...ctx, inOnceSubtree: ctx.inOnceSubtree };

  const createElExpr = isSvgTag(tagName)
    ? factory.createConditionalExpression(
      factory.createBinaryExpression(
        factory.createTypeOfExpression(
          factory.createPropertyAccessExpression(ctx.docId, "createElementNS"),
        ),
        factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
        factory.createStringLiteral("function"),
      ),
      factory.createToken(ts.SyntaxKind.QuestionToken),
      factory.createCallExpression(
        factory.createPropertyAccessExpression(ctx.docId, "createElementNS"),
        undefined,
        [
          factory.createStringLiteral(SVG_NS_COMPILER),
          factory.createStringLiteral(tagName.toLowerCase()),
        ],
      ),
      factory.createToken(ts.SyntaxKind.ColonToken),
      factory.createCallExpression(
        factory.createPropertyAccessExpression(ctx.docId, "createElement"),
        undefined,
        [factory.createStringLiteral(tagName.toLowerCase())],
      ),
    )
    : factory.createCallExpression(
      factory.createPropertyAccessExpression(ctx.docId, "createElement"),
      undefined,
      [factory.createStringLiteral(tagName)],
    );

  const innerStmts: ts.Statement[] = [
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            elVar,
            undefined,
            undefined,
            createElExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
    ...buildAttributeStatements(elVar, attrs, childCtx),
    factory.createExpressionStatement(
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createIdentifier(appendTargetVar),
          "appendChild",
        ),
        undefined,
        [factory.createIdentifier(elVar)],
      ),
    ),
    ...buildRefStatementsAfterAppend(elVar, attrs, childCtx),
    ...emitStaticDynamicChildSegmentStatements(elVar, segments, ctx),
  ];
  return innerStmts;
}

/**
 * **`{ <div …>静…动…</div> }`**：opening 可证静态、无 v-if/v-once/自定义指令时，创建元素后对 **子级** 做静/动分段，缩小 `insertReactive` 粒度。
 *
 * @param parentVar - 外层挂载父 DOM
 * @param el - 本征元素 AST
 * @param ctx - 发射上下文
 */
function trySplitIntrinsicJsxKids(
  parentVar: string,
  el: ts.JsxElement,
  ctx: EmitContext,
): ts.Statement[] | null {
  if (ctx.inOnceSubtree) return null;
  return buildSplitIntrinsicElementMountStmts(parentVar, el, ctx);
}

/**
 * 逻辑短路优化（`&&` / `||` / `??`）右侧：Fragment 或本征元素，且子级 **静动混合** 可分段。
 *
 * @param right - 逻辑运算符右操作数
 */
type ShortCircuitSplittableJsxRhs =
  | { kind: "fragment"; segments: StaticDynamicChildSeg[] }
  | { kind: "intrinsic"; el: ts.JsxElement; segments: StaticDynamicChildSeg[] };

function tryGetShortCircuitSplittableJsxRhs(
  right: ts.Expression,
): ShortCircuitSplittableJsxRhs | null {
  const frag = peelToFragmentRoot(right);
  if (frag != null) {
    const meaningful = frag.children.filter((c) => !isWhitespaceOnlyJsxText(c));
    const segs = collectMixedStaticDynamicSegments(meaningful);
    if (segs != null) return { kind: "fragment", segments: segs };
  }
  const el = peelToIntrinsicElementRoot(right);
  if (el != null) {
    if (!intrinsicElementQualifiesForSplitMount(el)) return null;
    const meaningful = el.children.filter((c) => !isWhitespaceOnlyJsxText(c));
    const segs = collectMixedStaticDynamicSegments(meaningful);
    if (segs != null) return { kind: "intrinsic", el, segments: segs };
  }
  return null;
}

/**
 * 由 {@link tryGetShortCircuitSplittableJsxRhs} 结果生成 **`(__viewMountParent) => { … }`** 内层挂载箭头（尚未 {@link wrapCompiledDomMountArrow}）。
 *
 * @param rhsSplit - 可分段右侧描述
 * @param ctx - 发射上下文
 */
function buildShortRhsMountArrow(
  rhsSplit: ShortCircuitSplittableJsxRhs,
  ctx: EmitContext,
): ts.ArrowFunction | null {
  const innerParam = JSX_MOUNT_FN_PARENT_PARAM;
  let innerBlockStmts: ts.Statement[];
  if (rhsSplit.kind === "fragment") {
    innerBlockStmts = emitStaticDynamicChildSegmentStatements(
      innerParam,
      rhsSplit.segments,
      ctx,
    );
  } else {
    const built = buildSplitIntrinsicElementMountStmts(
      innerParam,
      rhsSplit.el,
      ctx,
    );
    if (built == null) return null;
    innerBlockStmts = built;
  }
  return factory.createArrowFunction(
    undefined,
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        innerParam,
        undefined,
        factory.createTypeReferenceNode("Element", undefined),
        undefined,
      ),
    ],
    undefined,
    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    factory.createBlock(innerBlockStmts, true),
  );
}

/**
 * 包一层 **`insertReactive(parent, () => block)`**。
 *
 * @param parentVar - 父 DOM 变量名
 * @param getterBlock - getter 函数体（块）
 * @param ctx - 发射上下文
 */
function emitInsertReactiveWithGetterBlock(
  parentVar: string,
  getterBlock: ts.Block,
  ctx: EmitContext,
): ts.Statement[] {
  return [
    factory.createExpressionStatement(
      factory.createCallExpression(ctx.insertReactiveId, undefined, [
        factory.createIdentifier(parentVar),
        factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          getterBlock,
        ),
      ]),
    ),
  ];
}

/**
 * **`{ cond && (<>…</> 或 <div …>…</div>) }`**：左侧 **无 JSX**、条件非编译期常量、右侧可静/动分段时：
 * **外层** `insertReactive` 仅订阅 `cond`；为真时返回 `markMountFn`，内层再分段，使子级动态部分不连带重算静态段。
 *
 * @param parentVar - 挂载父 DOM 变量
 * @param expr - 花括号内表达式（已剥 `as`/`satisfies`/括号）
 * @param ctx - 发射上下文
 */
function trySplitJsxAnd(
  parentVar: string,
  expr: ts.Expression,
  ctx: EmitContext,
): ts.Statement[] | null {
  if (ctx.inOnceSubtree) return null;
  const inner = stripExprWrappersForConstantEval(expr);
  if (!ts.isBinaryExpression(inner)) return null;
  if (inner.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
    return null;
  }
  const left = inner.left as ts.Expression;
  const right = inner.right as ts.Expression;
  if (expressionContainsJsx(left)) return null;
  if (!expressionContainsJsx(right)) return null;
  if (
    isDefinitelyTruthyAtCompileTime(left) ||
    isDefinitelyFalsyAtCompileTime(left)
  ) {
    return null;
  }
  const rhsSplit = tryGetShortCircuitSplittableJsxRhs(right);
  if (rhsSplit == null) return null;

  const innerMountArrow = buildShortRhsMountArrow(
    rhsSplit,
    ctx,
  );
  if (innerMountArrow == null) return null;

  const condExpr = conditionToBooleanExpression(
    transformExpressionJsxToCalls(
      deepFoldStaticJsxExpressionForInsert(left),
    ),
  );

  const getterBlock = factory.createBlock([
    factory.createIfStatement(
      factory.createPrefixUnaryExpression(
        ts.SyntaxKind.ExclamationToken,
        factory.createParenthesizedExpression(condExpr),
      ),
      factory.createReturnStatement(buildNoOpIfFalseMountArrow()),
      factory.createReturnStatement(
        wrapCompiledDomMountArrow(innerMountArrow),
      ),
    ),
  ], true);

  return emitInsertReactiveWithGetterBlock(parentVar, getterBlock, ctx);
}

/**
 * **`{ left || (<>…</> 或 <div …>…</div>) }`**：左侧无 JSX、左侧非常量真/假、右侧静动可分时：
 * **单次求值** `left` 后，若 JS 真值则按普通子表达式返回左侧展示值；否则内层 `markMountFn` 再分段（与 `a || b` 运行时语义一致）。
 *
 * @param parentVar - 挂载父 DOM 变量
 * @param expr - 花括号内表达式
 * @param ctx - 发射上下文
 */
function trySplitJsxOr(
  parentVar: string,
  expr: ts.Expression,
  ctx: EmitContext,
): ts.Statement[] | null {
  if (ctx.inOnceSubtree) return null;
  const inner = stripExprWrappersForConstantEval(expr);
  if (!ts.isBinaryExpression(inner)) return null;
  if (inner.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
    return null;
  }
  const left = inner.left as ts.Expression;
  const right = inner.right as ts.Expression;
  if (expressionContainsJsx(left)) return null;
  if (!expressionContainsJsx(right)) return null;
  if (
    isDefinitelyTruthyAtCompileTime(left) ||
    isDefinitelyFalsyAtCompileTime(left)
  ) {
    return null;
  }
  const rhsSplit = tryGetShortCircuitSplittableJsxRhs(right);
  if (rhsSplit == null) return null;

  const innerMountArrow = buildShortRhsMountArrow(
    rhsSplit,
    ctx,
  );
  if (innerMountArrow == null) return null;

  const leftReadOnce = conditionToBooleanExpression(
    transformExpressionJsxToCalls(
      deepFoldStaticJsxExpressionForInsert(left),
    ),
  );
  const tmpVar = nextVar();
  const leftAsInsertResult = wrapGetterOptMap(
    wrapBareRefForTextInsert(factory.createIdentifier(tmpVar)),
  );

  const getterBlock = factory.createBlock([
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            tmpVar,
            undefined,
            undefined,
            leftReadOnce,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
    factory.createIfStatement(
      factory.createIdentifier(tmpVar),
      factory.createReturnStatement(leftAsInsertResult),
      factory.createReturnStatement(
        wrapCompiledDomMountArrow(innerMountArrow),
      ),
    ),
  ], true);

  return emitInsertReactiveWithGetterBlock(parentVar, getterBlock, ctx);
}

/**
 * **`{ left ?? (<>…</> 或 <div …>…</div>) }`**：左侧无 JSX、左侧非编译期必 nullish/必非 nullish、右侧静动可分时：
 * 单次求值 `left` 后，若 `!= null`（同时排除 `undefined`）则返回左侧展示值，否则内层分段挂载 JSX（与 `??` 一致）。
 *
 * @param parentVar - 挂载父 DOM 变量
 * @param expr - 花括号内表达式
 * @param ctx - 发射上下文
 */
function trySplitJsxNullish(
  parentVar: string,
  expr: ts.Expression,
  ctx: EmitContext,
): ts.Statement[] | null {
  if (ctx.inOnceSubtree) return null;
  const inner = stripExprWrappersForConstantEval(expr);
  if (!ts.isBinaryExpression(inner)) return null;
  if (inner.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken) {
    return null;
  }
  const left = inner.left as ts.Expression;
  const right = inner.right as ts.Expression;
  if (expressionContainsJsx(left)) return null;
  if (!expressionContainsJsx(right)) return null;
  if (isDefinitelyNullishAtCompileTime(left)) return null;
  if (isDefinitelyNonNullishForDoubleEqNull(left)) return null;

  const rhsSplit = tryGetShortCircuitSplittableJsxRhs(right);
  if (rhsSplit == null) return null;

  const innerMountArrow = buildShortRhsMountArrow(
    rhsSplit,
    ctx,
  );
  if (innerMountArrow == null) return null;

  const leftReadOnce = conditionToBooleanExpression(
    transformExpressionJsxToCalls(
      deepFoldStaticJsxExpressionForInsert(left),
    ),
  );
  const tmpVar = nextVar();
  const leftAsInsertResult = wrapGetterOptMap(
    wrapBareRefForTextInsert(factory.createIdentifier(tmpVar)),
  );

  /** `x != null` 与 `x !== null && x !== undefined` 等价的 nullish 判定 */
  const notNullishCond = factory.createBinaryExpression(
    factory.createIdentifier(tmpVar),
    factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
    factory.createNull(),
  );

  const getterBlock = factory.createBlock([
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            tmpVar,
            undefined,
            undefined,
            leftReadOnce,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
    factory.createIfStatement(
      notNullishCond,
      factory.createReturnStatement(leftAsInsertResult),
      factory.createReturnStatement(
        wrapCompiledDomMountArrow(innerMountArrow),
      ),
    ),
  ], true);

  return emitInsertReactiveWithGetterBlock(parentVar, getterBlock, ctx);
}

/**
 * 本征父节点下 **`{ <>…</> }`**：子级同时含「可 insert 提升的静态段」与动态段时，拆成多条 **`insert(parent, markMountFn…)`** 与逐个子级的 **`buildChildStatements`**，
 * 避免整段包进单一 **`insertReactive`**（与根级 {@link trySplitFragReactive} 同向；**v-once** 子树不拆）。
 *
 * @param parentVar - 挂载目标 DOM 变量
 * @param frag - 已剥壳得到的 Fragment
 * @param ctx - 发射上下文
 * @returns 语句列表；无需拆分时返回 `null`
 */
function trySplitFragJsxKids(
  parentVar: string,
  frag: ts.JsxFragment,
  ctx: EmitContext,
): ts.Statement[] | null {
  if (ctx.inOnceSubtree) return null;
  const meaningful = frag.children.filter((c) => !isWhitespaceOnlyJsxText(c));
  const segments = collectMixedStaticDynamicSegments(meaningful);
  if (segments == null) return null;
  const stmts = emitStaticDynamicChildSegmentStatements(
    parentVar,
    segments,
    ctx,
  );
  return stmts.length > 0 ? stmts : null;
}

/**
 * 本征 JSX 标签名：仅 **单标识符**（如 `div`）；`Foo.Bar` 等返回 `null`。
 *
 * @param tag - opening/self-closing 的 tagName
 */
function jsxIntrinsicIdentifierTagName(
  tag: ts.JsxTagNameExpression,
): string | null {
  return ts.isIdentifier(tag) ? tag.text : null;
}

/**
 * 剥除逗号最右段、括号、**左侧可证静态**的 `+` 链后，若得到 **本征** 元素且 opening 属性可证静态，返回该根；否则 `null`。
 * 用于 {@link tryIntrinsicRootInserts}：根级 `"" + <div>…</div>` 等走 `insert(parent, jsxToRuntimeFunction(div))`，子节点在元素内分段挂载。
 *
 * @param expr - `wrapExpressionContainingJsxAsRootMountFn` 收到的表达式
 */
function tryUnwrapStaticJsxRoot(
  expr: ts.Expression,
): ts.JsxElement | ts.JsxSelfClosingElement | null {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isCommaListExpression(e) && e.elements.length > 0) {
    return tryUnwrapStaticJsxRoot(
      e.elements[e.elements.length - 1] as ts.Expression,
    );
  }
  if (
    ts.isBinaryExpression(e) &&
    e.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    if (!sourceExpressionIsStaticForOneShotInsert(e.left as ts.Expression)) {
      return null;
    }
    return tryUnwrapStaticJsxRoot(e.right as ts.Expression);
  }
  if (ts.isJsxSelfClosingElement(e)) {
    const tag = jsxIntrinsicIdentifierTagName(e.tagName);
    if (tag == null || !isIntrinsicElement(tag)) return null;
    if (!jsxIntrinsicOpeningAttributesFullyStatic(e.attributes)) return null;
    return e;
  }
  if (ts.isJsxElement(e)) {
    const tag = jsxIntrinsicIdentifierTagName(e.openingElement.tagName);
    if (tag == null || !isIntrinsicElement(tag)) return null;
    if (
      !jsxIntrinsicOpeningAttributesFullyStatic(e.openingElement.attributes)
    ) {
      return null;
    }
    return e;
  }
  return null;
}

/**
 * 根表达式在剥壳后为本征元素时，整段编译为 **`insert(parent, markMountFn(…))`**（内含 `el` 上子节点的 insert / insertReactive 分段），
 * 避免包一层无意义的根级 `insertReactive`。
 *
 * @param expr - 与 {@link trySplitFragReactive} 相同来源
 */
function tryIntrinsicRootInserts(
  expr: ts.Expression,
): ts.Statement[] | null {
  const root = tryUnwrapStaticJsxRoot(expr);
  if (root == null) return null;
  return [
    factory.createExpressionStatement(
      factory.createCallExpression(
        factory.createIdentifier("insert"),
        undefined,
        [
          factory.createIdentifier("parent"),
          jsxToRuntimeFunction(root, { resetVarCounter: true }),
        ],
      ),
    ),
  ];
}

/**
 * 将 **根 Fragment** 拆为交替的静态段 / 动态段：`insert(parent, markMountFn…)` + `insertReactive(parent, ()=>…)`，
 * 避免整段包在单一 `insertReactive` 内重复执行静态子树（细粒度静态外壳提升）。
 *
 * @param expr - `wrapExpressionContainingJsxAsRootMountFn` 收到的原表达式
 * @returns 语句块；不可拆或不应拆时返回 `null`
 */
function trySplitFragReactive(
  expr: ts.Expression,
): ts.Statement[] | null {
  const frag = peelToFragmentRoot(expr);
  if (frag == null) return null;
  const meaningful = frag.children.filter((c) => !isWhitespaceOnlyJsxText(c));
  if (meaningful.length === 0) return null;
  let hasStatic = false;
  let hasDynamic = false;
  for (const c of meaningful) {
    if (jsxChildIsFullyStaticForFragmentHoist(c)) hasStatic = true;
    else hasDynamic = true;
  }
  if (!hasStatic || !hasDynamic) return null;

  type Seg = { kind: "static" | "dynamic"; children: ts.JsxChild[] };
  const segments: Seg[] = [];
  for (const c of meaningful) {
    const st = jsxChildIsFullyStaticForFragmentHoist(c);
    const kind: Seg["kind"] = st ? "static" : "dynamic";
    const last = segments.at(-1);
    if (last && last.kind === kind) last.children.push(c);
    else segments.push({ kind, children: [c] });
  }

  const stmts: ts.Statement[] = [];
  let firstMount = true;
  for (const seg of segments) {
    if (seg.kind === "static") {
      const m = seg.children.filter((c) => !isWhitespaceOnlyJsxText(c));
      if (m.length === 0) continue;
      let jsxRoot: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement;
      if (
        m.length === 1 &&
        (ts.isJsxElement(m[0]!) || ts.isJsxSelfClosingElement(m[0]!))
      ) {
        jsxRoot = m[0] as ts.JsxElement | ts.JsxSelfClosingElement;
      } else {
        jsxRoot = factory.createJsxFragment(
          factory.createJsxOpeningFragment(),
          seg.children,
          factory.createJsxJsxClosingFragment(),
        );
      }
      const mountExpr = jsxToRuntimeFunction(jsxRoot, {
        resetVarCounter: firstMount,
      });
      firstMount = false;
      stmts.push(
        factory.createExpressionStatement(
          factory.createCallExpression(
            factory.createIdentifier("insert"),
            undefined,
            [
              factory.createIdentifier("parent"),
              mountExpr,
            ],
          ),
        ),
      );
    } else {
      for (const d of seg.children) {
        if (isWhitespaceOnlyJsxText(d)) continue;
        let innerExpr: ts.Expression;
        if (ts.isJsxExpression(d) && d.expression) {
          innerExpr = transformExpressionJsxToCalls(d.expression);
        } else if (
          ts.isJsxElement(d) ||
          ts.isJsxSelfClosingElement(d) ||
          ts.isJsxFragment(d)
        ) {
          innerExpr = transformExpressionJsxToCalls(
            d as unknown as ts.Expression,
          );
        } else {
          return null;
        }
        stmts.push(
          factory.createExpressionStatement(
            factory.createCallExpression(
              factory.createIdentifier("insertReactive"),
              undefined,
              [
                factory.createIdentifier("parent"),
                factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  innerExpr,
                ),
              ],
            ),
          ),
        );
      }
      firstMount = false;
    }
  }
  return stmts.length > 0 ? stmts : null;
}

function wrapExpressionContainingJsxAsRootMountFn(
  expr: ts.Expression,
): ts.ArrowFunction {
  const splitStmts = trySplitFragReactive(expr);
  const intrinsicStmts = tryIntrinsicRootInserts(expr);
  const blockBody = splitStmts ??
    intrinsicStmts ??
    [
      factory.createExpressionStatement(
        factory.createCallExpression(
          factory.createIdentifier("insertReactive"),
          undefined,
          [
            factory.createIdentifier("parent"),
            factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              transformExpressionJsxToCalls(expr),
            ),
          ],
        ),
      ),
    ];
  return factory.createArrowFunction(
    undefined,
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        "parent",
        undefined,
        factory.createTypeReferenceNode("Element", undefined),
        undefined,
      ),
    ],
    undefined,
    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    factory.createBlock(blockBody, true),
  );
}

/**
 * 判断 JSX 子节点是否仅为空白文本（Suspense slot 内可忽略）。
 */
function isWhitespaceOnlyJsxText(child: ts.JsxChild): boolean {
  if (!ts.isJsxText(child)) return false;
  let raw: string;
  try {
    raw = child.getText();
  } catch {
    const sf = child.getSourceFile?.();
    raw = sf != null && child.pos >= 0 && child.end <= sf.text.length
      ? sf.text.slice(child.pos, child.end)
      : "";
  }
  return raw.replace(/\s+/g, "").length === 0;
}

/**
 * Suspense slot 内是否有实际内容（非空白、非空 JSX 表达式）。
 *
 * 注意：compileSource 的 visitor 会先改写 slot 内「箭头 + JSX 体」（如 `.then(() => <span/>)`），
 * 合成子树可能无有效 pos，`safeNodeText` 会得到空串。若仅凭空串判定「无意义」，
 * 会把 `{ fakeApi().then(...).catch(...) }` 整段丢掉，编译成 `children: () => undefined`，
 * Suspense 将永远停在 fallback。
 */
function isMeaningfulSuspenseSlotChild(child: ts.JsxChild): boolean {
  if (isWhitespaceOnlyJsxText(child)) return false;
  if (ts.isJsxExpression(child)) {
    const ex = child.expression;
    if (!ex) return false;
    // 列表 map 子节点常为 `(item, i) => (...)`，节点可能无可靠 pos，safeNodeText 为空但仍须保留
    if (ts.isArrowFunction(ex) || ts.isFunctionExpression(ex)) return true;
    const text = safeNodeText(ex as ts.Node).trim();
    if (text !== "") return true;
    // 无源码切片：多为 visitor 替换后的合成节点；显式 `undefined` 仍视为空，其余保留（Promise 链等）
    if (ts.isIdentifier(ex) && ex.text === "undefined") return false;
    return true;
  }
  return true;
}

/**
 * 将 Suspense 的一个 slot 子节点转为表达式（供 `() => expr` 使用）；内联 JSX 经 transformExpressionJsxToCalls。
 */
function suspenseChildToExpression(child: ts.JsxChild): ts.Expression {
  if (ts.isJsxText(child)) {
    let raw: string;
    try {
      raw = child.getText();
    } catch {
      const sf = child.getSourceFile?.();
      raw = sf != null && child.pos >= 0 && child.end <= sf.text.length
        ? sf.text.slice(child.pos, child.end)
        : "";
    }
    return factory.createStringLiteral(raw.replace(/\s+/g, " ").trim());
  }
  if (ts.isJsxExpression(child) && child.expression) {
    return transformExpressionJsxToCalls(child.expression);
  }
  if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
    return transformExpressionJsxToCalls(child as unknown as ts.Expression);
  }
  if (ts.isJsxFragment(child)) {
    return transformExpressionJsxToCalls(child as unknown as ts.Expression);
  }
  return factory.createIdentifier("undefined");
}

/**
 * 构建 Suspense 的 slot 表达式：`undefined` | 单子项表达式 | 多子项数组字面量（运行时包成 Fragment）。
 */
function buildSuspenseSlotExpression(
  meaningfulChildren: ts.JsxChild[],
): ts.Expression {
  if (meaningfulChildren.length === 0) {
    return factory.createIdentifier("undefined");
  }
  if (meaningfulChildren.length === 1) {
    return suspenseChildToExpression(meaningfulChildren[0]!);
  }
  return factory.createArrayLiteralExpression(
    meaningfulChildren.map((c) => suspenseChildToExpression(c)),
    false,
  );
}

/**
 * 从 `<For>` / `<Index>` 子节点中取出首个 render prop（箭头或 `function` 字面量）。
 *
 * @param children - JSX children
 */
function extractListRenderCb(
  children: readonly ts.JsxChild[],
): ts.Expression | undefined {
  const meaningful = [...children].filter(isMeaningfulSuspenseSlotChild);
  for (const c of meaningful) {
    if (!ts.isJsxExpression(c) || !c.expression) continue;
    let ex: ts.Expression = c.expression;
    while (ts.isParenthesizedExpression(ex)) ex = ex.expression;
    if (ts.isArrowFunction(ex) || ts.isFunctionExpression(ex)) {
      return ex;
    }
  }
  return undefined;
}

/**
 * 从 `<Show>` 子节点取出**唯一**一个函数字面量（任意形参个数），作为 `children`；
 * 多子或非函数则返回 `undefined`，改走 `markMountFn` 包整块。
 *
 * @param children - JSX children
 */
function extractShowChildFn(
  children: readonly ts.JsxChild[],
): ts.Expression | undefined {
  const meaningful = [...children].filter(isMeaningfulSuspenseSlotChild);
  if (meaningful.length !== 1) return undefined;
  const c = meaningful[0]!;
  if (!ts.isJsxExpression(c) || !c.expression) return undefined;
  let ex: ts.Expression = c.expression;
  while (ts.isParenthesizedExpression(ex)) ex = ex.expression;
  if (ts.isArrowFunction(ex) || ts.isFunctionExpression(ex)) {
    return ex;
  }
  return undefined;
}

/**
 * 将组件调用结果 `resultVar` 按 2.1 规则挂到 `parentVar`（与 {@link buildComponentStatements} 尾部一致）。
 *
 * @param allStmts - 累积语句数组
 * @param parentVar - 父 DOM 变量名
 * @param resultVar - `Comp(props)` 结果变量名
 * @param ctx - 发射上下文
 */
function appendCompiledComponentResultToParent(
  allStmts: ts.Statement[],
  parentVar: string,
  resultVar: string,
  ctx: EmitContext,
): void {
  const insertReactiveId = ctx.insertReactiveId;
  const resultIsFunction = factory.createBinaryExpression(
    factory.createTypeOfExpression(factory.createIdentifier(resultVar)),
    factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
    factory.createStringLiteral("function"),
  );
  const resultIsMarkedMountFn = factory.createCallExpression(
    factory.createIdentifier("isMountFn"),
    undefined,
    [factory.createIdentifier(resultVar)],
  );
  const resultLengthEquals1 = factory.createBinaryExpression(
    factory.createPropertyAccessExpression(
      factory.createIdentifier(resultVar),
      "length",
    ),
    factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
    factory.createNumericLiteral(1),
  );
  const resultIsNotSignalGetter = factory.createPrefixUnaryExpression(
    ts.SyntaxKind.ExclamationToken,
    factory.createCallExpression(
      factory.createIdentifier("isSignalGetter"),
      undefined,
      [factory.createIdentifier(resultVar)],
    ),
  );
  const resultIsUnmarkedSingleArgDomMount = factory
    .createParenthesizedExpression(
      factory.createBinaryExpression(
        factory.createBinaryExpression(
          resultIsFunction,
          factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
          resultLengthEquals1,
        ),
        factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
        resultIsNotSignalGetter,
      ),
    );
  const resultShouldCallAsDomMount = factory.createParenthesizedExpression(
    factory.createBinaryExpression(
      resultIsMarkedMountFn,
      factory.createToken(ts.SyntaxKind.BarBarToken),
      resultIsUnmarkedSingleArgDomMount,
    ),
  );
  const callResultAsMount = factory.createExpressionStatement(
    factory.createCallExpression(
      factory.createIdentifier(resultVar),
      undefined,
      [factory.createIdentifier(parentVar)],
    ),
  );
  const insertReactiveCallGetterResult = factory.createExpressionStatement(
    factory.createCallExpression(insertReactiveId, undefined, [
      factory.createIdentifier(parentVar),
      factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        wrapExprInUntrackIfOnce(
          factory.createCallExpression(
            factory.createIdentifier(resultVar),
            undefined,
            [],
          ),
          ctx,
        ),
      ),
    ]),
  );
  const insertReactiveWrapResult = factory.createExpressionStatement(
    factory.createCallExpression(insertReactiveId, undefined, [
      factory.createIdentifier(parentVar),
      factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        wrapExprInUntrackIfOnce(
          factory.createIdentifier(resultVar),
          ctx,
        ),
      ),
    ]),
  );
  allStmts.push(
    factory.createIfStatement(
      resultShouldCallAsDomMount,
      callResultAsMount,
      factory.createIfStatement(
        resultIsFunction,
        insertReactiveCallGetterResult,
        insertReactiveWrapResult,
      ),
    ),
  );
}

/**
 * `<For>` / `<Index>`：`each` 走 {@link buildJsxEachSegs}，子节点为 `(item) => …` render prop（不经 `markMountFn` 包一整段 parent）。
 */
function buildListRenderStmts(
  parentVar: string,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  ctx: EmitContext,
): ts.Statement[] {
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const compExpr = tagNameToExpression(open.tagName);
  const propsVar = nextVar();
  const resultVar = nextVar();
  const allStmts: ts.Statement[] = [];
  const renderFnAst = extractListRenderCb(children);
  const childrenExpr = renderFnAst
    ? transformExpressionJsxToCalls(renderFnAst)
    : factory.createIdentifier("undefined");
  const attrSegs = buildJsxEachSegs(
    open.attributes,
  );
  const tailSegs = [
    factory.createObjectLiteralExpression([
      factory.createPropertyAssignment("children", childrenExpr),
    ], false),
  ];
  const propsInitExpr = mergePropsChain([...attrSegs, ...tailSegs]);
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            propsVar,
            undefined,
            undefined,
            propsInitExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            resultVar,
            undefined,
            undefined,
            factory.createCallExpression(compExpr, undefined, [
              factory.createIdentifier(propsVar),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  appendCompiledComponentResultToParent(allStmts, parentVar, resultVar, ctx);
  return allStmts;
}

/**
 * `<Show>`：`when` 走 {@link buildJsxAccSegs}；
 * 单子为函数字面量则作 `children`（含 `(v)=>` / `()=>`），否则与常规组件相同用 `markMountFn` 包子树。
 */
function buildShowStmts(
  parentVar: string,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  ctx: EmitContext,
): ts.Statement[] {
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const compExpr = tagNameToExpression(open.tagName);
  const propsVar = nextVar();
  const resultVar = nextVar();
  const allStmts: ts.Statement[] = [];

  const singleFn = extractShowChildFn(children);
  let childrenExpr: ts.Expression | undefined;
  if (singleFn) {
    childrenExpr = transformExpressionJsxToCalls(singleFn);
  } else {
    const meaningful = [...children].filter(isMeaningfulSuspenseSlotChild);
    if (meaningful.length > 0) {
      const childMountVar = nextVar();
      const innerParentVar = nextVar();
      const childStmts = buildChildrenStatementsSequential(
        innerParentVar,
        children,
        ctx,
      );
      allStmts.push(
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                childMountVar,
                undefined,
                undefined,
                factory.createCallExpression(
                  factory.createIdentifier("markMountFn"),
                  undefined,
                  [
                    factory.createArrowFunction(
                      undefined,
                      undefined,
                      [
                        factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          innerParentVar,
                          undefined,
                          undefined,
                          undefined,
                        ),
                      ],
                      undefined,
                      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                      factory.createBlock(childStmts, true),
                    ),
                  ],
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      );
      childrenExpr = factory.createIdentifier(childMountVar);
    }
  }

  const attrSegs = buildJsxAccSegs(
    open.attributes,
    WHEN_ACC_KEYS,
  );
  const tailSegs: ts.Expression[] = [];
  if (childrenExpr !== undefined) {
    tailSegs.push(
      factory.createObjectLiteralExpression([
        factory.createPropertyAssignment("children", childrenExpr),
      ], false),
    );
  }
  const propsInitExpr = mergePropsChain([...attrSegs, ...tailSegs]);

  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            propsVar,
            undefined,
            undefined,
            propsInitExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            resultVar,
            undefined,
            undefined,
            factory.createCallExpression(compExpr, undefined, [
              factory.createIdentifier(propsVar),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  appendCompiledComponentResultToParent(allStmts, parentVar, resultVar, ctx);
  return allStmts;
}

/**
 * `<Dynamic>`：`component={expr}` 走 {@link DYNC_ACC_KEYS}；`children` 语义同 {@link buildShowStmts}。
 */
function buildDynamicStmts(
  parentVar: string,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  ctx: EmitContext,
): ts.Statement[] {
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const compExpr = tagNameToExpression(open.tagName);
  const propsVar = nextVar();
  const resultVar = nextVar();
  const allStmts: ts.Statement[] = [];

  const singleFn = extractShowChildFn(children);
  let childrenExpr: ts.Expression | undefined;
  if (singleFn) {
    childrenExpr = transformExpressionJsxToCalls(singleFn);
  } else {
    const meaningful = [...children].filter(isMeaningfulSuspenseSlotChild);
    if (meaningful.length > 0) {
      const childMountVar = nextVar();
      const innerParentVar = nextVar();
      const childStmts = buildChildrenStatementsSequential(
        innerParentVar,
        children,
        ctx,
      );
      allStmts.push(
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                childMountVar,
                undefined,
                undefined,
                factory.createCallExpression(
                  factory.createIdentifier("markMountFn"),
                  undefined,
                  [
                    factory.createArrowFunction(
                      undefined,
                      undefined,
                      [
                        factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          innerParentVar,
                          undefined,
                          undefined,
                          undefined,
                        ),
                      ],
                      undefined,
                      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                      factory.createBlock(childStmts, true),
                    ),
                  ],
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      );
      childrenExpr = factory.createIdentifier(childMountVar);
    }
  }

  const attrSegs = buildJsxAccSegs(
    open.attributes,
    DYNC_ACC_KEYS,
  );
  const tailSegs: ts.Expression[] = [];
  if (childrenExpr !== undefined) {
    tailSegs.push(
      factory.createObjectLiteralExpression([
        factory.createPropertyAssignment("children", childrenExpr),
      ], false),
    );
  }
  const propsInitExpr = mergePropsChain([...attrSegs, ...tailSegs]);

  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            propsVar,
            undefined,
            undefined,
            propsInitExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            resultVar,
            undefined,
            undefined,
            factory.createCallExpression(compExpr, undefined, [
              factory.createIdentifier(propsVar),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  appendCompiledComponentResultToParent(allStmts, parentVar, resultVar, ctx);
  return allStmts;
}

/**
 * 从 `<Switch>` 子节点收集 **`<Match>`**（元素或自闭合）；忽略空白文本；**不**展开 `{expr && <Match>}`（须直接写 `<Match>` 子节点）。
 */
function gatherSwitchFrags(
  children: readonly ts.JsxChild[],
): {
  open: ts.JsxOpeningElement | ts.JsxSelfClosingElement;
  innerChildren: ts.JsxChild[];
}[] {
  const out: {
    open: ts.JsxOpeningElement | ts.JsxSelfClosingElement;
    innerChildren: ts.JsxChild[];
  }[] = [];
  for (const c of children) {
    if (isWhitespaceOnlyJsxText(c)) continue;
    if (ts.isJsxText(c)) continue;
    if (ts.isJsxExpression(c)) continue;
    if (ts.isJsxFragment(c)) continue;
    if (ts.isJsxSelfClosingElement(c)) {
      if (getComponentTagName(c.tagName) === "Match") {
        out.push({ open: c, innerChildren: [] });
      }
      continue;
    }
    if (ts.isJsxElement(c)) {
      if (getComponentTagName(c.openingElement.tagName) === "Match") {
        out.push({
          open: c.openingElement,
          innerChildren: [...c.children],
        });
      }
    }
  }
  return out;
}

/**
 * `<Switch>`：子级 `<Match>` 编成 `matches: mergeProps(...)[ ]`，各 `when` 同 {@link WHEN_ACC_KEYS} 包 accessor；`children` 语义同 {@link buildShowStmts}。
 */
function buildSwitchStmts(
  parentVar: string,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  ctx: EmitContext,
): ts.Statement[] {
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const compExpr = tagNameToExpression(open.tagName);
  const propsVar = nextVar();
  const resultVar = nextVar();
  const allStmts: ts.Statement[] = [];

  const frags = gatherSwitchFrags(children);
  const matchExprs: ts.Expression[] = [];

  for (const frag of frags) {
    const attrs = frag.open.attributes;
    const singleFn = extractShowChildFn(frag.innerChildren);
    let childrenExpr: ts.Expression | undefined;
    if (singleFn) {
      childrenExpr = transformExpressionJsxToCalls(singleFn);
    } else {
      const meaningful = [...frag.innerChildren].filter(
        isMeaningfulSuspenseSlotChild,
      );
      if (meaningful.length > 0) {
        const childMountVar = nextVar();
        const innerParentVar = nextVar();
        const childStmts = buildChildrenStatementsSequential(
          innerParentVar,
          frag.innerChildren,
          ctx,
        );
        allStmts.push(
          factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList(
              [
                factory.createVariableDeclaration(
                  childMountVar,
                  undefined,
                  undefined,
                  factory.createCallExpression(
                    factory.createIdentifier("markMountFn"),
                    undefined,
                    [
                      factory.createArrowFunction(
                        undefined,
                        undefined,
                        [
                          factory.createParameterDeclaration(
                            undefined,
                            undefined,
                            innerParentVar,
                            undefined,
                            undefined,
                            undefined,
                          ),
                        ],
                        undefined,
                        factory.createToken(
                          ts.SyntaxKind.EqualsGreaterThanToken,
                        ),
                        factory.createBlock(childStmts, true),
                      ),
                    ],
                  ),
                ),
              ],
              ts.NodeFlags.Const,
            ),
          ),
        );
        childrenExpr = factory.createIdentifier(childMountVar);
      }
    }

    const attrSegs = buildJsxAccSegs(
      attrs,
      WHEN_ACC_KEYS,
    );
    const tailSegs: ts.Expression[] = [];
    if (childrenExpr !== undefined) {
      tailSegs.push(
        factory.createObjectLiteralExpression([
          factory.createPropertyAssignment("children", childrenExpr),
        ], false),
      );
    }
    matchExprs.push(mergePropsChain([...attrSegs, ...tailSegs]));
  }

  const matchesArray = factory.createArrayLiteralExpression(matchExprs, false);
  const switchAttrSegs = buildJsxAttributesMergeSegments(open.attributes);
  const propsInitExpr = mergePropsChain([
    ...switchAttrSegs,
    factory.createObjectLiteralExpression([
      factory.createPropertyAssignment("matches", matchesArray),
    ], false),
  ]);

  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            propsVar,
            undefined,
            undefined,
            propsInitExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            resultVar,
            undefined,
            undefined,
            factory.createCallExpression(compExpr, undefined, [
              factory.createIdentifier(propsVar),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  appendCompiledComponentResultToParent(allStmts, parentVar, resultVar, ctx);
  return allStmts;
}

/**
 * 为组件 <Comp ... /> 或 <Comp></Comp> 生成：构建 props、运行一次 Comp(props)，挂载函数直接调用否则 insertReactive(parent, () => result)。
 * **无参 getter children**（`() => slot`）：`vSlotGetter` 任意组件、从 `@dreamer/view/boundary` 按名导入的 Suspense/ErrorBoundary（及同表列出的框架导出）、或非 compileSource 下标签名 Suspense/ErrorBoundary。
 * ErrorBoundary 类须如此才能使 slot 内同步抛错落在其 `insertReactive` try/catch 内。
 * 其余自定义组件：children 为 `(parent)=>void`，避免 DocumentFragment 被 append 后变空、insertReactive 二次执行无法复挂子树。
 */
function buildComponentStatements(
  parentVar: string,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  ctx: EmitContext,
): ts.Statement[] {
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const compExpr = tagNameToExpression(open.tagName);
  const tagNameStr = getComponentTagName(open.tagName);
  if (tagNameStr === "For" || tagNameStr === "Index") {
    return buildListRenderStmts(parentVar, node, ctx);
  }
  if (tagNameStr === "Show") {
    return buildShowStmts(parentVar, node, ctx);
  }
  if (tagNameStr === "Dynamic") {
    return buildDynamicStmts(parentVar, node, ctx);
  }
  if (tagNameStr === "Switch") {
    return buildSwitchStmts(parentVar, node, ctx);
  }
  const propsVar = nextVar();
  const resultVar = nextVar();
  /** 仅 children 等需在属性 merge 之后追加的单键对象（与 buildJsxAttributesMergeSegments 分离） */
  const propsEntries: ts.ObjectLiteralElementLike[] = [];
  const allStmts: ts.Statement[] = [];
  if (children.length > 0) {
    /**
     * `() => slot` 分支：与 boundary 运行时约定一致；用户自写同类组件请写 `vSlotGetter`，勿依赖标签名字符串。
     */
    if (
      shouldCompileComponentChildrenAsSlotGetter(
        open.attributes,
        tagNameStr,
        ctx,
      )
    ) {
      const meaningful = children.filter(isMeaningfulSuspenseSlotChild);
      const slotExpr = buildSuspenseSlotExpression(meaningful);
      const childGetterVar = nextVar();
      allStmts.push(
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                childGetterVar,
                undefined,
                undefined,
                factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  slotExpr,
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      );
      propsEntries.push(
        factory.createPropertyAssignment(
          "children",
          factory.createIdentifier(childGetterVar),
        ),
      );
    } else {
      const childMountVar = nextVar();
      const innerParentVar = nextVar();
      const childStmts = buildChildrenStatementsSequential(
        innerParentVar,
        children,
        ctx,
      );
      allStmts.push(
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                childMountVar,
                undefined,
                undefined,
                factory.createCallExpression(
                  factory.createIdentifier("markMountFn"),
                  undefined,
                  [
                    factory.createArrowFunction(
                      undefined,
                      undefined,
                      [
                        factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          innerParentVar,
                          undefined,
                          undefined,
                          undefined,
                        ),
                      ],
                      undefined,
                      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                      factory.createBlock(childStmts, true),
                    ),
                  ],
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      );
      propsEntries.push(
        factory.createPropertyAssignment(
          "children",
          factory.createIdentifier(childMountVar),
        ),
      );
    }
  }
  const attrSegs = buildJsxAttributesMergeSegments(open.attributes);
  const tailSegs = propsEntries.map((e) =>
    factory.createObjectLiteralExpression([e], false)
  );
  const propsInitExpr = mergePropsChain([...attrSegs, ...tailSegs]);
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            propsVar,
            undefined,
            undefined,
            propsInitExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  allStmts.push(
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            resultVar,
            undefined,
            undefined,
            factory.createCallExpression(compExpr, undefined, [
              factory.createIdentifier(propsVar),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  );
  /**
   * 2.1 组件返回值在编译期展开：
   * - **DOM 挂载**：`isMountFn(result)` **或**（`typeof result === "function" && result.length === 1 && !isSignalGetter(result)`）→ `result(parent)`。
   *   后者覆盖 `RoutePage` 等返回未打标 `(parent)=>void` 的组件，避免误走 `insertReactive(() => result())` 无参调用。
   * - **零参或 2+ 参函数**：`insertReactive(parent, () => result())`（如 `() => VNode` 的 Form、零参 getter 子树）。
   * - **非函数**：`insertReactive(parent, () => result)`（VNode 等）。
   */
  appendCompiledComponentResultToParent(allStmts, parentVar, resultVar, ctx);
  return allStmts;
}

/** buildElementStatements 可选：兄弟链内单支已外包 if，避免重复包 vIf */
type ElementBuildOpts = {
  omitVIfWrap?: boolean;
};

/**
 * 为 v-if 链的某一支生成挂载箭头 `(parent) => { ... }`，供 insertReactive(getter) 的 getter 返回。
 * 这样 getter 在 effect 中每次求值都会读 cond 里的 signal，点击切换时能重新挂载对应分支。
 */
function buildIfChainBranchMountArrow(
  branch: IfChainBranch,
  ctx: EmitContext,
): ts.CallExpression {
  const stmts = buildElementStatements(
    JSX_MOUNT_FN_PARENT_PARAM,
    branch.node,
    ctx,
    {
      omitVIfWrap: true,
    },
  );
  return wrapCompiledDomMountArrow(
    factory.createArrowFunction(
      undefined,
      undefined,
      [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          JSX_MOUNT_FN_PARENT_PARAM,
          undefined,
          factory.createTypeReferenceNode("Element", undefined),
          undefined,
        ),
      ],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      factory.createBlock(stmts, true),
    ),
  );
}

/**
 * 单分支 v-if 在条件为 false 时返回的挂载函数：空函数体，不向 parent 插入任何节点。
 * 与手写 `vElse` 空支语义一致，保证 `insertReactive` **始终**走 MountFn 分支，从而可靠 detach 上一帧子树；
 * 若仅 `if (cond) return mount` 而 false 时隐式 `undefined`，在部分 CSR/嵌套挂载路径下曾出现 DOM 残留。
 */
function buildNoOpIfFalseMountArrow(): ts.CallExpression {
  return wrapCompiledDomMountArrow(
    factory.createArrowFunction(
      undefined,
      undefined,
      [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          JSX_MOUNT_FN_PARENT_PARAM,
          undefined,
          factory.createTypeReferenceNode("Element", undefined),
          undefined,
        ),
      ],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      factory.createBlock([], true),
    ),
  );
}

/**
 * 用 insertReactive(parentVar, getter) 包住 v-if 链：getter 内按条件 return 各支的挂载函数，
 * 使 tab()/show() 等变化时 effect 重新执行，切换显示对应分支。
 */
/**
 * v-if / v-else-if 条件可能是 getter（箭头函数），须在 getter 内调用才得到布尔值并订阅 signal。
 * 若直接 if (cond) 而 cond 为 () => tab() === "a"，则 cond 恒为 truthy，且不会读 tab()。
 */
function conditionToBooleanExpression(cond: ts.Expression): ts.Expression {
  if (ts.isArrowFunction(cond) || ts.isFunctionExpression(cond)) {
    return factory.createCallExpression(cond, undefined, []);
  }
  return cond;
}

function buildIfChainAsInsertReactive(
  parentVar: string,
  branches: IfChainBranch[],
  ctx: EmitContext,
): ts.Statement[] {
  if (branches.length === 0) return [];
  const insertReactiveId = ctx.insertReactiveId;
  const lastBr = branches[branches.length - 1]!;
  /**
   * 多个兄弟各自写 `vIf`（而非 vElseIf 链）时，tryParseIfChain 在「下一个兄弟也是 vIf」处截断，
   * 每条只含 **一个** 分支。此时若仍生成 `return mountLast`，会 **丢掉条件**、无条件挂载，导致
   * 并列的多个 vIf 全部显示。单分支且为 if/elseIf 时，必须把条件包在 return 外。
   */
  let tail: ts.Statement;
  if (
    branches.length === 1 &&
    (lastBr.kind === "if" || lastBr.kind === "elseIf")
  ) {
    const rawCond = lastBr.cond ?? factory.createTrue();
    const cond = conditionToBooleanExpression(rawCond);
    tail = factory.createIfStatement(
      cond,
      factory.createReturnStatement(
        buildIfChainBranchMountArrow(lastBr, ctx),
      ),
      factory.createReturnStatement(buildNoOpIfFalseMountArrow()),
    );
  } else {
    tail = factory.createReturnStatement(
      buildIfChainBranchMountArrow(lastBr, ctx),
    );
    for (let b = branches.length - 2; b >= 0; b--) {
      const br = branches[b]!;
      if (br.kind === "else") continue;
      const rawCond = br.cond ?? factory.createTrue();
      const cond = conditionToBooleanExpression(rawCond);
      tail = factory.createIfStatement(
        cond,
        factory.createReturnStatement(buildIfChainBranchMountArrow(br, ctx)),
        tail,
      );
    }
  }
  const getter = factory.createArrowFunction(
    undefined,
    undefined,
    [],
    undefined,
    factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
    factory.createBlock([tail], true),
  );
  return [
    factory.createExpressionStatement(
      factory.createCallExpression(insertReactiveId, undefined, [
        factory.createIdentifier(parentVar),
        getter,
      ]),
    ),
  ];
}

/**
 * 顺序处理子节点：遇 v-if 起头的兄弟链则编译为 insertReactive(getter)，否则单个子节点走 buildChildStatements。
 */
function buildChildrenStatementsSequential(
  parentVar: string,
  children: readonly ts.JsxChild[],
  ctx: EmitContext,
): ts.Statement[] {
  const out: ts.Statement[] = [];
  let i = 0;
  while (i < children.length) {
    if (isWhitespaceOnlyJsxText(children[i]!)) {
      i++;
      continue;
    }
    const chain = tryParseIfChain(children, i);
    if (chain) {
      out.push(...buildIfChainAsInsertReactive(parentVar, chain.branches, ctx));
      i = chain.endExclusive;
      continue;
    }
    out.push(...buildChildStatements(parentVar, children[i]!, ctx));
    i++;
  }
  return out;
}

/**
 * 为一个 JSX 元素、Fragment 或自闭合标签生成：创建节点/组件、属性、子节点；
 * 3.3 v-if；3.5 v-else 链、v-once、v-cloak。
 */
function buildElementStatements(
  parentVar: string,
  node: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement,
  ctx: EmitContext,
  opts?: ElementBuildOpts,
): ts.Statement[] {
  const stmts: ts.Statement[] = [];
  if (ts.isJsxFragment(node)) {
    stmts.push(
      ...buildChildrenStatementsSequential(parentVar, node.children, ctx),
    );
    return stmts;
  }
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const tagName = typeof (open.tagName as ts.Identifier).text === "string"
    ? (open.tagName as ts.Identifier).text
    : safeNodeText(open.tagName as ts.Node) || "div";
  if (!isIntrinsicElement(tagName)) {
    return buildComponentStatements(
      parentVar,
      node as ts.JsxElement | ts.JsxSelfClosingElement,
      ctx,
    );
  }
  const elVar = nextVar();
  const elementChildren = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const attrs = open.attributes;
  const vIfCond = opts?.omitVIfWrap ? null : getVIfCondition(attrs);
  /**
   * 元素自身带 vIf 时**不可**在 mount 里写单次 `if (cond) { ... }`：整棵组件 mount 箭头只执行一次，
   * cond 里 signal 后续变化不会重新求值，表现为「已是 false 仍看见 DOM」。Fragment 子节点走
   * tryParseIfChain → insertReactive 故正常；根节点 `<div vIf>` 曾踩此坑。
   * 与兄弟 v-if 链一致，统一走 {@link buildIfChainAsInsertReactive}（omitVIfWrap 的内层递归不再进入此分支）。
   */
  if (vIfCond !== null && !opts?.omitVIfWrap) {
    return buildIfChainAsInsertReactive(parentVar, [
      { kind: "if", cond: vIfCond, node },
    ], ctx);
  }
  const childOnce = ctx.inOnceSubtree || hasVOnceAttribute(attrs);
  const childCtx: EmitContext = { ...ctx, inOnceSubtree: childOnce };

  /** SVG 系标签须用 createElementNS 才能在浏览器中正确渲染；SSR 伪 document 无 createElementNS 时回退 createElement */
  const createElExpr = isSvgTag(tagName)
    ? factory.createConditionalExpression(
      factory.createBinaryExpression(
        factory.createTypeOfExpression(
          factory.createPropertyAccessExpression(ctx.docId, "createElementNS"),
        ),
        factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
        factory.createStringLiteral("function"),
      ),
      factory.createToken(ts.SyntaxKind.QuestionToken),
      factory.createCallExpression(
        factory.createPropertyAccessExpression(ctx.docId, "createElementNS"),
        undefined,
        [
          factory.createStringLiteral(SVG_NS_COMPILER),
          factory.createStringLiteral(tagName.toLowerCase()),
        ],
      ),
      factory.createToken(ts.SyntaxKind.ColonToken),
      factory.createCallExpression(
        factory.createPropertyAccessExpression(ctx.docId, "createElement"),
        undefined,
        [factory.createStringLiteral(tagName.toLowerCase())],
      ),
    )
    : factory.createCallExpression(
      factory.createPropertyAccessExpression(ctx.docId, "createElement"),
      undefined,
      [factory.createStringLiteral(tagName)],
    );
  const innerStmts: ts.Statement[] = [
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            elVar,
            undefined,
            undefined,
            createElExpr,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ];
  if (hasVCloakAttribute(attrs)) {
    innerStmts.push(
      factory.createExpressionStatement(
        factory.createCallExpression(
          factory.createPropertyAccessExpression(
            factory.createIdentifier(elVar),
            "setAttribute",
          ),
          undefined,
          [
            factory.createStringLiteral("data-view-cloak"),
            factory.createStringLiteral(""),
          ],
        ),
      ),
    );
  }
  innerStmts.push(
    ...buildAttributeStatements(elVar, attrs, childCtx),
    factory.createExpressionStatement(
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createIdentifier(parentVar),
          "appendChild",
        ),
        undefined,
        [factory.createIdentifier(elVar)],
      ),
    ),
  );
  innerStmts.push(...buildRefStatementsAfterAppend(elVar, attrs, childCtx));
  const directivePropsObj = buildDirectivePropsObject(attrs);
  if (directivePropsObj) {
    innerStmts.push(
      factory.createExpressionStatement(
        factory.createCallExpression(ctx.applyDirectivesId, undefined, [
          factory.createIdentifier(elVar),
          directivePropsObj,
          ctx.createEffectId,
          ctx.registerDirectiveUnmountId,
        ]),
      ),
    );
  }
  // 子节点必须挂到当前元素 elVar 上；parentVar 仅为外层容器（appendChild 之后子内容进 el）
  innerStmts.push(
    ...buildChildrenStatementsSequential(
      elVar,
      elementChildren,
      childCtx,
    ),
  );

  const orphanElseIf = !opts?.omitVIfWrap && vIfCond === null &&
    hasVElseIfAttribute(attrs) && !hasVIfAttribute(attrs);
  if (orphanElseIf) {
    stmts.push(
      factory.createIfStatement(
        factory.createFalse(),
        factory.createBlock(innerStmts, true),
        undefined,
      ),
    );
    return stmts;
  }

  stmts.push(...innerStmts);
  return stmts;
}

/**
 * 将 `( __viewMountParent ) => { … }` 包一层 `markMountFn`，避免与 `expandedRowRender(record)` 等单参回调在 `insertReactive` 中混淆。
 *
 * @param arrow - 编译器生成的单参挂载箭头
 * @returns `markMountFn(arrow)` 调用表达式
 */
function wrapCompiledDomMountArrow(
  arrow: ts.ArrowFunction,
): ts.CallExpression {
  return factory.createCallExpression(
    factory.createIdentifier("markMountFn"),
    undefined,
    [arrow],
  );
}

/** jsxToRuntimeFunction 选项：嵌套 JSX 编译时应保持 var 计数连续，避免与外层 `_0` 临时变量冲突 */
export type JsxToRuntimeFunctionOptions = {
  /** 为 false 时不调用 resetVarCounter（默认 true） */
  resetVarCounter?: boolean;
  /** 为 true 时子树内 insertReactive 等用 untrack，实现 v-once 语义 */
  inOnceSubtree?: boolean;
};

/**
 * 将一棵 JSX 根（`JsxElement`、`JsxFragment` 或 `JsxSelfClosingElement`）转为
 * `( __viewMountParent: Element ) => { ... }` 的箭头函数 AST（形参名见 {@link JSX_MOUNT_FN_PARENT_PARAM}）。
 *
 * @param node - 根 JSX 节点
 * @param options - 可选；`resetVarCounter` 控制临时变量计数；`inOnceSubtree` 启用 v-once 子树内的 `untrack` 行为
 * @returns `markMountFn(( __viewMountParent ) => { … })` 调用表达式，供 `compileSource` 或其它 transform 嵌入
 */
export function jsxToRuntimeFunction(
  node: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement,
  options?: JsxToRuntimeFunctionOptions,
): ts.CallExpression {
  if (options?.resetVarCounter !== false) {
    resetVarCounter();
  }
  const insertId = factory.createIdentifier("insert");
  const insertReactiveId = factory.createIdentifier("insertReactive");
  const createEffectId = factory.createIdentifier("createEffect");
  const untrackId = factory.createIdentifier("untrack");
  const applyDirectivesId = factory.createIdentifier("applyDirectives");
  const registerDirectiveUnmountId = factory.createIdentifier(
    "registerDirectiveUnmount",
  );
  const scheduleFunctionRefId = factory.createIdentifier("scheduleFunctionRef");
  const getActiveDocumentId = factory.createIdentifier("getActiveDocument");
  const docId = factory.createIdentifier("_doc");
  const ctx: EmitContext = {
    insertId,
    insertReactiveId,
    createEffectId,
    untrackId,
    getActiveDocumentId,
    docId,
    inOnceSubtree: options?.inOnceSubtree ?? false,
    applyDirectivesId,
    registerDirectiveUnmountId,
    scheduleFunctionRefId,
    slotGetterTagLocals: slotGetterTagLocalsForCurrentCompile,
    reactiveBindings: getCurrentReactiveBindingsForCompile(),
  };
  const stmts = buildElementStatements(
    JSX_MOUNT_FN_PARENT_PARAM,
    node,
    ctx,
    {},
  );
  // 4.2 产物优化：mount 内复用 _doc，减少 getActiveDocument() 调用与产物体积
  const docDecl = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          docId,
          undefined,
          undefined,
          factory.createCallExpression(getActiveDocumentId, undefined, []),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
  return wrapCompiledDomMountArrow(
    factory.createArrowFunction(
      undefined,
      undefined,
      [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          JSX_MOUNT_FN_PARENT_PARAM,
          undefined,
          factory.createTypeReferenceNode("Element", undefined),
          undefined,
        ),
      ],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      factory.createBlock([docDecl, ...stmts], true),
    ),
  );
}

/**
 * `compileSource` 的选项：可指定 `insert` 等运行时的导入路径（例如根组件从主包拉取以支持 `VNode`）。
 */
export type CompileSourceOptions = {
  /** `insert` 等的导入路径，默认 `"@dreamer/view/compiler"`；根文件可传 `"@dreamer/view"` */
  insertImportPath?: string;
};

/**
 * 从 return 的 expression 中解包出 JSX（支持 return ( <JSX /> ) 的括号包裹）。
 * 仅剥一层 ParenthesizedExpression，避免误伤其它表达式。
 */
function getJsxFromReturnExpression(
  expr: ts.Expression,
): ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement | null {
  if (
    ts.isJsxElement(expr) ||
    ts.isJsxFragment(expr) ||
    ts.isJsxSelfClosingElement(expr)
  ) {
    return expr;
  }
  if (ts.isParenthesizedExpression(expr)) {
    return getJsxFromReturnExpression(expr.expression);
  }
  /** `e1, e2, <div/>` 的值为最右段，与块体 `e1; e2; return <div/>` 折叠后一致 */
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.CommaToken
  ) {
    return getJsxFromReturnExpression(expr.right as ts.Expression);
  }
  if (ts.isCommaListExpression(expr)) {
    const els = expr.elements;
    if (els.length === 0) return null;
    return getJsxFromReturnExpression(
      els[els.length - 1]! as ts.Expression,
    );
  }
  return null;
}

/**
 * 是否为 `() => { ... }`（零参、块体）箭头表达式。
 *
 * 用于区分「组件返回渲染 getter」与「return 体是含 JSX 的任意表达式」：
 * 块内可含 `const x = cond ? <label/> : null` 等 JSX，再 `return <div/>`；
 * 若把**整段**箭头交给 {@link wrapExpressionContainingJsxAsRootMountFn}，会编成
 * `(parent) => insertReactive(parent, () => …)`，外层变成未打标的单参函数，
 * `insertReactive` 无法识别为 MountFn，表单项等子树在 SSR/CSR 均为空（与 FormItem 类组件同源）。
 */
function isZeroArgArrowWithBlockBody(expr: ts.Expression): boolean {
  if (!ts.isArrowFunction(expr)) return false;
  if (expr.parameters.length !== 0) return false;
  return ts.isBlock(expr.body);
}

/**
 * 将箭头 **块体** 规范为 **表达式体**，使与 `() => expr` 共用 compileSource 优化路径：
 *
 * 1. **单条** `return expr` → `expr`
 * 2. **若干** `expressionStmt; …; return expr` → `(e1, …, expr)`（逗号左结合）
 *
 * **不**折叠：首条为 **字符串字面量** 的 `ExpressionStatement`（可能是 `"use strict"`
 * 等指令前导，改为逗号体会丧失指令语义）；任一前导语句非 `ExpressionStatement`（如
 * `const`）；末条非带值 `return`。
 *
 * @param arrow - 已 `visitEachChild` 处理过的箭头节点
 * @returns 可折叠则返回 `updateArrowFunction` 后的节点，否则原样返回
 */
function collapseArrowBlockToConciseBodyWhenEligible(
  arrow: ts.ArrowFunction,
): ts.ArrowFunction {
  if (!ts.isBlock(arrow.body)) return arrow;
  const stmts = arrow.body.statements;
  if (stmts.length === 0) return arrow;

  if (stmts.length === 1) {
    const only = stmts[0]!;
    if (!ts.isReturnStatement(only) || only.expression == null) return arrow;
    return factory.updateArrowFunction(
      arrow,
      arrow.modifiers,
      arrow.typeParameters,
      arrow.parameters,
      arrow.type,
      arrow.equalsGreaterThanToken,
      only.expression,
    );
  }

  const last = stmts[stmts.length - 1]!;
  if (!ts.isReturnStatement(last) || last.expression == null) return arrow;

  const first = stmts[0]!;
  if (
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression)
  ) {
    return arrow;
  }

  for (let i = 0; i < stmts.length - 1; i++) {
    if (!ts.isExpressionStatement(stmts[i]!)) return arrow;
  }

  const operands: ts.Expression[] = [];
  for (let i = 0; i < stmts.length - 1; i++) {
    operands.push((stmts[i]! as ts.ExpressionStatement).expression);
  }
  operands.push(last.expression);
  const concise = buildCommaChainLeftAssoc(operands);
  return factory.updateArrowFunction(
    arrow,
    arrow.modifiers,
    arrow.typeParameters,
    arrow.parameters,
    arrow.type,
    arrow.equalsGreaterThanToken,
    concise,
  );
}

/**
 * 合成节点安全打印：对 AST 中 pos<0 的节点不依赖 getStart/getEnd，用递归 emit 生成字符串。
 * 仅处理我们 transform 产生的节点形状（ReturnStatement、ArrowFunction、Block、CallExpression 等），
 * 其余有 pos 的用 source 切片，无 pos 的尝试 getText 或返回占位。
 */
function emitSynthesizedNode(
  node: ts.Node,
  source: string,
  sourceFile: ts.SourceFile,
): string {
  const hasPos = node.pos >= 0 && node.end <= source.length;
  if (hasPos) return source.slice(node.pos, node.end);
  const getTextSafe = (n: ts.Node): string => {
    if (n.pos >= 0 && n.end <= source.length) return source.slice(n.pos, n.end);
    return emitSynthesizedNode(n, source, sourceFile);
  };
  switch (node.kind) {
    case ts.SyntaxKind.ReturnStatement: {
      const rs = node as ts.ReturnStatement;
      return rs.expression
        ? "return " + getTextSafe(rs.expression) + ";"
        : "return;";
    }
    case ts.SyntaxKind.ArrowFunction: {
      const af = node as ts.ArrowFunction;
      const params = af.parameters
        .map((p) => (p.name as ts.Identifier).text)
        .join(", ");
      const body = getTextSafe(af.body);
      return `(${params}) => ${body}`;
    }
    case ts.SyntaxKind.Block: {
      const block = node as ts.Block;
      const stmts = block.statements.map((s) => getTextSafe(s)).join("\n");
      return "{\n" + stmts + "\n}";
    }
    case ts.SyntaxKind.ExpressionStatement: {
      const es = node as ts.ExpressionStatement;
      return getTextSafe(es.expression) + ";";
    }
    case ts.SyntaxKind.CallExpression: {
      const ce = node as ts.CallExpression;
      const left = getTextSafe(ce.expression);
      const args = ce.arguments.map((a) => getTextSafe(a)).join(", ");
      return ce.arguments.length > 0 ? `${left}(${args})` : `${left}()`;
    }
    case ts.SyntaxKind.Identifier:
      return (node as ts.Identifier).text;
    case ts.SyntaxKind.StringLiteral:
      return JSON.stringify((node as ts.StringLiteral).text);
    case ts.SyntaxKind.NumericLiteral:
      return (node as ts.NumericLiteral).text;
    case ts.SyntaxKind.PropertyAccessExpression: {
      const pa = node as ts.PropertyAccessExpression;
      return getTextSafe(pa.expression) + "." + (pa.name as ts.Identifier).text;
    }
    case ts.SyntaxKind.VariableStatement: {
      const vs = node as ts.VariableStatement;
      return getTextSafe(vs.declarationList) + ";";
    }
    case ts.SyntaxKind.VariableDeclarationList: {
      const vdl = node as ts.VariableDeclarationList;
      const flags = vdl.flags & ts.NodeFlags.Const ? "const" : "let";
      const decls = vdl.declarations.map((d) => getTextSafe(d)).join(", ");
      return flags + " " + decls;
    }
    case ts.SyntaxKind.VariableDeclaration: {
      const vd = node as ts.VariableDeclaration;
      const name = getTextSafe(vd.name);
      const init = vd.initializer ? " = " + getTextSafe(vd.initializer) : "";
      return name + init;
    }
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const ol = node as ts.ObjectLiteralExpression;
      const props = ol.properties.map((p) => getTextSafe(p)).join(", ");
      return "{" + props + "}";
    }
    case ts.SyntaxKind.PropertyAssignment: {
      const prop = node as ts.PropertyAssignment;
      const name = prop.name.kind === ts.SyntaxKind.Identifier
        ? (prop.name as ts.Identifier).text
        : getTextSafe(prop.name);
      return name + ": " + getTextSafe(prop.initializer);
    }
    case ts.SyntaxKind.IfStatement: {
      const iff = node as ts.IfStatement;
      const cond = getTextSafe(iff.expression);
      const then = getTextSafe(iff.thenStatement);
      const el = iff.elseStatement
        ? " else " + getTextSafe(iff.elseStatement)
        : "";
      return "if (" + cond + ") " + then + el;
    }
    case ts.SyntaxKind.TrueKeyword:
      return "true";
    case ts.SyntaxKind.FalseKeyword:
      return "false";
    case ts.SyntaxKind.ParenthesizedExpression: {
      const pe = node as ts.ParenthesizedExpression;
      return "(" + getTextSafe(pe.expression) + ")";
    }
    case ts.SyntaxKind.BinaryExpression: {
      const be = node as ts.BinaryExpression;
      const op = ts.tokenToString(be.operatorToken.kind) ?? "";
      return getTextSafe(be.left) + " " + op + " " + getTextSafe(be.right);
    }
    case ts.SyntaxKind.ConditionalExpression: {
      const ce = node as ts.ConditionalExpression;
      return (
        getTextSafe(ce.condition) +
        " ? " +
        getTextSafe(ce.whenTrue) +
        " : " +
        getTextSafe(ce.whenFalse)
      );
    }
    case ts.SyntaxKind.CommaListExpression: {
      const cle = node as ts.CommaListExpression;
      return cle.elements.map((e) => getTextSafe(e)).join(", ");
    }
    case ts.SyntaxKind.ArrayLiteralExpression: {
      const al = node as ts.ArrayLiteralExpression;
      const elts = al.elements.map((e) => getTextSafe(e)).join(", ");
      return "[" + elts + "]";
    }
    case ts.SyntaxKind.SpreadElement: {
      const sp = node as ts.SpreadElement;
      return "..." + getTextSafe(sp.expression);
    }
    case ts.SyntaxKind.FunctionExpression: {
      const fe = node as ts.FunctionExpression;
      const params = fe.parameters.map((p) => getTextSafe(p)).join(", ");
      const body = getTextSafe(fe.body);
      return "function(" + params + ") " + body;
    }
    case ts.SyntaxKind.Parameter: {
      const p = node as ts.ParameterDeclaration;
      return (p.name as ts.Identifier).text;
    }
    case ts.SyntaxKind.NewExpression: {
      const ne = node as ts.NewExpression;
      const target = getTextSafe(ne.expression);
      const args = ne.arguments && ne.arguments.length > 0
        ? ne.arguments.map((a) => getTextSafe(a)).join(", ")
        : "";
      return "new " + target + "(" + args + ")";
    }
    case ts.SyntaxKind.ElementAccessExpression: {
      const ea = node as ts.ElementAccessExpression;
      return getTextSafe(ea.expression) + "[" +
        getTextSafe(ea.argumentExpression) + "]";
    }
    case ts.SyntaxKind.AsExpression: {
      const ae = node as ts.AsExpression;
      return getTextSafe(ae.expression) + " as " + getTextSafe(ae.type);
    }
    case ts.SyntaxKind.TypeReference:
      return (node as ts.TypeReferenceNode).typeName
        ? getTextSafe((node as ts.TypeReferenceNode).typeName)
        : "any";
    case ts.SyntaxKind.VoidExpression: {
      const ve = node as ts.VoidExpression;
      return "void " + getTextSafe(ve.expression);
    }
    case ts.SyntaxKind.NonNullExpression: {
      const nn = node as ts.NonNullExpression;
      return getTextSafe(nn.expression) + "!";
    }
    case ts.SyntaxKind.TemplateExpression: {
      const te = node as ts.TemplateExpression;
      let out = "`" + (te.head.text ?? "");
      for (let i = 0; i < te.templateSpans.length; i++) {
        const span = te.templateSpans[i];
        out += "${" + getTextSafe(span.expression) + "}" +
          (span.literal.text ?? "");
      }
      return out + "`";
    }
    case ts.SyntaxKind.PrefixUnaryExpression: {
      const pu = node as ts.PrefixUnaryExpression;
      const op = ts.tokenToString(pu.operator) ?? "";
      return op + getTextSafe(pu.operand);
    }
    default:
      // 安全打印阶段严禁再调用 getText()/getStart()，避免触发
      // "Node must have a real position for this operation"。
      return "";
  }
}

/**
 * 当 printer.printFile 因合成节点位置断言失败时，按语句拼接：有 pos 的用原文切片，无 pos 的用自定义 emit。
 */
function printFileSafe(transformed: ts.SourceFile, source: string): string {
  try {
    const parts: string[] = [];
    for (const stmt of transformed.statements) {
      if (stmt.pos >= 0 && stmt.end <= source.length) {
        parts.push(source.slice(stmt.pos, stmt.end));
      } else {
        parts.push(emitSynthesizedNode(stmt, source, transformed));
      }
    }
    return parts.join("\n");
  } catch {
    return source;
  }
}

/**
 * 在已有 `import { … } from path` 中追加命名导出（供 compileSource 注入 unwrapSignalGetterValue 等）。
 *
 * @param source - 已打印的 TS 源码
 * @param path - 与 import 路径字面量一致（如 `@dreamer/view/compiler`）
 * @param name - 要追加的标识符名
 * @returns 替换后的源码；若无匹配 import 则返回原字符串
 */
function injectNamedImportFromPath(
  source: string,
  path: string,
  name: string,
): string {
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(import\\s*\\{)([^}]*)(\\}\\s*from\\s*["']${esc}["']\\s*;?)`,
    "m",
  );
  return source.replace(re, (_full, open, mid, close) => {
    if (new RegExp(`\\b${name}\\b`).test(mid)) {
      return open + mid + close;
    }
    // 多行 import 常在最后一项后保留尾随逗号，若再拼 `, name` 会得到 `,,` 语法错误
    const t = mid.trim().replace(/,\s*$/, "");
    const inner = t.length > 0 ? `${t}, ${name}` : ` ${name} `;
    return `${open}${inner}${close}`;
  });
}

/**
 * 变量声明前导注释是否含 **`@view-memo`**：将下一行单条 `const x = expr` 编译为 `const x = createMemo(() => expr)`，并在同作用域内把值位置的 `x` 改为 `x()`（对象简写 `{ x }` 改为 `{ x: x() }`）。多声明同条、解构绑定不适用；已写 `createMemo(...)` 时仅做登记与引用改写，不双重包裹。
 *
 * @param sf - 源文件
 * @param stmt - `const` / `let` 变量语句
 */
function variableStatementHasViewMemoPragma(
  sf: ts.SourceFile,
  stmt: ts.VariableStatement,
): boolean {
  const ranges = ts.getLeadingCommentRanges(sf.text, stmt.getFullStart());
  if (!ranges) return false;
  for (const r of ranges) {
    const t = sf.text.slice(r.pos, r.end);
    if (/@view-memo\b/.test(t)) return true;
  }
  return false;
}

/**
 * 初值是否已为 **`createMemo(...)`** 调用（含 `ns.createMemo`）。
 *
 * @param expr - 变量初值
 */
function isCreateMemoInitializerCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const c = expr.expression;
  if (ts.isIdentifier(c) && c.text === "createMemo") return true;
  if (ts.isPropertyAccessExpression(c) && c.name.text === "createMemo") {
    return true;
  }
  return false;
}

/**
 * `@view-memo` 改写下，标识符是否应保持为绑定名而非 `x()` 调用（声明位、类型位、标签、JSX 标签名等）。
 *
 * @param parent - 直接父节点
 * @param id - 标识符
 */
function shouldSkipViewMemoIdentifierRewrite(
  parent: ts.Node | undefined,
  id: ts.Identifier,
): boolean {
  if (parent === undefined) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === id) return true;
  if (ts.isBindingElement(parent) && parent.name === id) return true;
  if (ts.isParameter(parent) && parent.name === id) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === id) return true;
  if (ts.isFunctionExpression(parent) && parent.name === id) return true;
  if (ts.isClassDeclaration(parent) && parent.name === id) return true;
  if (ts.isClassExpression(parent) && parent.name === id) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === id) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === id) return true;
  if (ts.isPropertySignature(parent) && parent.name === id) return true;
  if (ts.isMethodSignature(parent) && parent.name === id) return true;
  if (ts.isEnumDeclaration(parent) && parent.name === id) return true;
  if (ts.isEnumMember(parent) && parent.name === id) return true;
  if (ts.isModuleDeclaration(parent) && parent.name === id) return true;
  if (ts.isTypeParameterDeclaration(parent) && parent.name === id) return true;
  if (ts.isImportClause(parent) && parent.name === id) return true;
  if (
    ts.isImportSpecifier(parent) &&
    (parent.name === id || parent.propertyName === id)
  ) {
    return true;
  }
  if (
    ts.isExportSpecifier(parent) &&
    (parent.name === id || parent.propertyName === id)
  ) {
    return true;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) {
    return true;
  }
  if (ts.isQualifiedName(parent) && parent.right === id) return true;
  if (ts.isMetaProperty(parent) && parent.name === id) return true;
  if (ts.isLabeledStatement(parent) && parent.label === id) return true;
  if (ts.isBreakStatement(parent) && parent.label === id) return true;
  if (ts.isContinueStatement(parent) && parent.label === id) return true;
  if (ts.isTypeReferenceNode(parent) && parent.typeName === id) return true;
  if (ts.isDecorator(parent) && parent.expression === id) return true;
  if (ts.isJsxOpeningElement(parent) && parent.tagName === id) return true;
  if (ts.isJsxSelfClosingElement(parent) && parent.tagName === id) return true;
  if (ts.isJsxClosingElement(parent) && parent.tagName === id) return true;
  const isPartOfType = (ts as typeof ts & {
    isPartOfTypeNode?(n: ts.Node): boolean;
  }).isPartOfTypeNode;
  if (typeof isPartOfType === "function" && isPartOfType(id)) return true;
  return false;
}

/**
 * 对含 `@view-memo` 的源码做 **半自动 createMemo**：包初值、改写引用；供 {@link compileSource} 在 JSX 变换之前运行。
 *
 * @param sourceFile - 已解析的源文件
 * @returns 变换后的源文件与是否发生了实质改写
 */
function applyViewMemoPragmaTransform(
  sourceFile: ts.SourceFile,
): { file: ts.SourceFile; applied: boolean } {
  let applied = false;
  const result = ts.transform(sourceFile, [
    (context) => {
      const fac = context.factory;
      const scopeStack: Map<string, "memo" | "plain">[] = [];
      const pushScope = (): void => {
        scopeStack.push(new Map());
      };
      const popScope = (): void => {
        scopeStack.pop();
      };
      const register = (name: string, kind: "memo" | "plain"): void => {
        scopeStack[scopeStack.length - 1]!.set(name, kind);
      };
      /**
       * 将形参/解构绑定名登记为 plain，避免与外层 `@view-memo` 同名误改。
       *
       * @param name - 绑定名节点
       */
      const registerBindingNamePlain = (name: ts.BindingName): void => {
        if (ts.isIdentifier(name)) register(name.text, "plain");
        else if (ts.isObjectBindingPattern(name)) {
          for (const el of name.elements) {
            if (!ts.isBindingElement(el) || el.dotDotDotToken) continue;
            registerBindingNamePlain(el.name);
          }
        } else if (ts.isArrayBindingPattern(name)) {
          for (const el of name.elements) {
            if (ts.isOmittedExpression(el)) continue;
            if (!ts.isBindingElement(el) || el.dotDotDotToken) continue;
            registerBindingNamePlain(el.name);
          }
        }
      };
      const lookup = (name: string): "memo" | "plain" | undefined => {
        for (let i = scopeStack.length - 1; i >= 0; i--) {
          const k = scopeStack[i]!.get(name);
          if (k !== undefined) return k;
        }
        return undefined;
      };

      /**
       * 进入带形参的函数体作用域：登记参数后递归子节点。
       *
       * @param node - 函数类节点
       * @param parameters - 形参列表
       */
      const visitFunctionLikeWithParams = (
        node: ts.Node,
        parameters: readonly ts.ParameterDeclaration[],
      ): ts.Node => {
        pushScope();
        try {
          for (const p of parameters) {
            registerBindingNamePlain(p.name);
          }
          return ts.visitEachChild(node, (c) => visit(c, node), context);
        } finally {
          popScope();
        }
      };

      const visit = (node: ts.Node, parent: ts.Node | undefined): ts.Node => {
        if (ts.isSourceFile(node)) {
          pushScope();
          try {
            return ts.visitEachChild(node, (c) => visit(c, node), context);
          } finally {
            popScope();
          }
        }
        if (ts.isBlock(node)) {
          pushScope();
          try {
            return ts.visitEachChild(node, (c) => visit(c, node), context);
          } finally {
            popScope();
          }
        }
        if (ts.isArrowFunction(node)) {
          return visitFunctionLikeWithParams(node, node.parameters);
        }
        if (ts.isFunctionExpression(node)) {
          return visitFunctionLikeWithParams(node, node.parameters);
        }
        if (ts.isFunctionDeclaration(node)) {
          if (!node.body) {
            return ts.visitEachChild(node, (c) => visit(c, node), context);
          }
          return visitFunctionLikeWithParams(node, node.parameters);
        }
        if (ts.isMethodDeclaration(node) && node.body) {
          return visitFunctionLikeWithParams(node, node.parameters);
        }
        if (ts.isConstructorDeclaration(node)) {
          return visitFunctionLikeWithParams(node, node.parameters);
        }
        if (
          (ts.isGetAccessorDeclaration(node) ||
            ts.isSetAccessorDeclaration(node)) &&
          node.body
        ) {
          return visitFunctionLikeWithParams(node, node.parameters);
        }
        if (ts.isShorthandPropertyAssignment(node)) {
          const nm = node.name.text;
          if (lookup(nm) === "memo") {
            applied = true;
            return fac.createPropertyAssignment(
              node.name,
              fac.createCallExpression(node.name, undefined, []),
            );
          }
          return ts.visitEachChild(node, (c) => visit(c, node), context);
        }
        if (ts.isVariableStatement(node)) {
          const hasPragma = variableStatementHasViewMemoPragma(
            sourceFile,
            node,
          );
          const decls = node.declarationList.declarations;
          const singlePragma = hasPragma && decls.length === 1;
          const newDecls: ts.VariableDeclaration[] = [];
          for (const decl of decls) {
            if (!ts.isIdentifier(decl.name) || !decl.initializer) {
              newDecls.push(
                ts.visitEachChild(
                  decl,
                  (c) => visit(c, decl),
                  context,
                ) as ts.VariableDeclaration,
              );
              continue;
            }
            const nm = decl.name.text;
            const visitedInit = ts.visitNode(
              decl.initializer,
              (c) => visit(c, decl),
            ) as ts.Expression;
            if (singlePragma) {
              if (isCreateMemoInitializerCall(decl.initializer)) {
                register(nm, "memo");
                newDecls.push(
                  fac.updateVariableDeclaration(
                    decl,
                    decl.name,
                    decl.exclamationToken,
                    decl.type,
                    visitedInit,
                  ),
                );
                continue;
              }
              applied = true;
              register(nm, "memo");
              const wrapped = fac.createCallExpression(
                fac.createIdentifier("createMemo"),
                undefined,
                [
                  fac.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    fac.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                    visitedInit,
                  ),
                ],
              );
              newDecls.push(
                fac.updateVariableDeclaration(
                  decl,
                  decl.name,
                  decl.exclamationToken,
                  decl.type,
                  wrapped,
                ),
              );
              continue;
            }
            register(nm, "plain");
            newDecls.push(
              fac.updateVariableDeclaration(
                decl,
                decl.name,
                decl.exclamationToken,
                decl.type,
                visitedInit,
              ),
            );
          }
          return fac.updateVariableStatement(
            node,
            node.modifiers,
            fac.updateVariableDeclarationList(
              node.declarationList,
              newDecls,
            ),
          );
        }
        if (ts.isIdentifier(node)) {
          if (!shouldSkipViewMemoIdentifierRewrite(parent, node)) {
            if (lookup(node.text) === "memo") {
              applied = true;
              return fac.createCallExpression(node, undefined, []);
            }
          }
          return node;
        }
        return ts.visitEachChild(node, (c) => visit(c, node), context);
      };

      return (sf: ts.SourceFile) => visit(sf, undefined) as ts.SourceFile;
    },
  ]);
  const file = result.transformed[0] as ts.SourceFile;
  result.dispose();
  return { file, applied };
}

/**
 * 快速判断源码是否可能包含「return <jsx>」或「() => ( <jsx> )」形态，避免对纯配置/路由等文件做 AST 解析与 transform，防止触发 TypeScript 对合成节点的位置断言（如 routers.tsx 仅含动态 import 时）。
 * 要求同时满足：1) 有 return < 或 => ( <；2) 有 JSX 标签形态（</ 或 <字母），避免仅因字符串/注释中的 "return <" 误入解析。
 */
function sourceMayContainCompilableJsx(source: string): boolean {
  // 含 `return a ? <div` 等：return 与 `<` 之间可有任意非分号片段
  const hasReturnOrArrowJsx = /return[^;{]{0,400}</.test(source) ||
    /=>\s*\(\s*[^)]*</.test(source) ||
    /=>\s*</.test(source);
  if (!hasReturnOrArrowJsx) return false;
  // 含组件/内置标签，或 Fragment 简写 `</>` / `<>`（否则含 `<>` 的 return 会被跳过）
  const hasJsxTagLike = /<>|<\/>|<\/?[a-zA-Z][a-zA-Z0-9]*/.test(source);
  return hasJsxTagLike;
}

/**
 * 编译 TS/TSX 源码：将符合形态的 `return <JSX>`、箭头函数表达式体 JSX 等替换为挂载函数，并自动注入缺失的 `insert` / `insertReactive` 等 import。
 *
 * 若启发式判断源码不含可编译 JSX，则**原样返回**源码，避免对纯配置文件的无效解析。
 *
 * @param source - 源码字符串
 * @param fileName - 文件名，用于 `createSourceFile` 与诊断，默认 `"input.tsx"`
 * @param options - 可选；`insertImportPath` 指定运行时导入路径（默认 `"@dreamer/view/compiler"`）
 * @returns 转换后的源码字符串；无 JSX 可编译时与输入相同（或仅经无害处理）
 */
/**
 * 是否应在 visit 进入时压入 **函数级响应式绑定栈**（具函数体的方法/构造器含在内）。
 *
 * @param node - 当前 AST 节点
 */
function tryGetCompileScopeFunctionBody(
  node: ts.Node,
): ts.ConciseBody | undefined {
  if (ts.isArrowFunction(node)) return node.body;
  if (ts.isFunctionExpression(node)) return node.body;
  if (ts.isFunctionDeclaration(node) && node.body) return node.body;
  if (ts.isMethodDeclaration(node) && node.body) return node.body;
  if (ts.isConstructorDeclaration(node) && node.body) return node.body;
  return undefined;
}

export function compileSource(
  source: string,
  fileName = "input.tsx",
  options?: CompileSourceOptions,
): string {
  const mayHaveViewMemo = /@view-memo\b/.test(source);
  if (!sourceMayContainCompilableJsx(source) && !mayHaveViewMemo) {
    return source;
  }
  const insertImportPath = options?.insertImportPath ??
    "@dreamer/view/compiler";
  try {
    let sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let viewMemoApplied = false;
    if (mayHaveViewMemo) {
      const memoOut = applyViewMemoPragmaTransform(sourceFile);
      sourceFile = memoOut.file;
      viewMemoApplied = memoOut.applied;
    }
    resetVarCounter();
    const slotLocals = collectSlotGetterTagLocalsFromImports(sourceFile);
    slotGetterTagLocalsForCurrentCompile = slotLocals.size > 0
      ? slotLocals
      : undefined;
    reactiveBindingsStackForCompile = [];
    let found = false;
    let result: ts.TransformationResult<ts.SourceFile>;
    try {
      result = ts.transform(sourceFile, [
        (context) => {
          /**
           * return / 表达式体箭头上的 JSX 编译；依赖外层 `found`。
           *
           * @param eff - 已 visit 子节点后的节点
           */
          const applyCompileSourceJsxToReturnOrConciseArrow = (
            eff: ts.Node,
          ): ts.Node => {
            if (ts.isReturnStatement(eff) && eff.expression) {
              const retExpr = eff.expression;
              /**
               * 根 return：常量三元 / 逻辑短路折叠后若为单根 JSX，直接 `jsxToRuntimeFunction`（markMountFn），
               * 避免整段包 `insertReactive(parent, ()=>…)`（根级少挂一层 effect）。
               */
              const foldedRoot = deepFoldStaticJsxExpressionForInsert(retExpr);
              const jsxFromFolded = getJsxFromReturnExpression(foldedRoot);
              if (jsxFromFolded) {
                found = true;
                return factory.createReturnStatement(
                  jsxToRuntimeFunction(jsxFromFolded),
                );
              }
              const jsx = getJsxFromReturnExpression(retExpr);
              if (jsx) {
                found = true;
                // 不要用 updateReturnStatement：合成 expression 与带真实 pos 的旧节点合并时，
                // TS 内部可能触发 “Node must have a real position”（如 boundary 等大 JSX 树）。
                return factory.createReturnStatement(jsxToRuntimeFunction(jsx));
              }
              if (
                expressionContainsJsx(retExpr) &&
                !isZeroArgArrowWithBlockBody(retExpr)
              ) {
                found = true;
                if (isTopLevelNewPromiseExpression(retExpr)) {
                  return factory.createReturnStatement(
                    transformExpressionJsxToCalls(retExpr),
                  );
                }
                return factory.createReturnStatement(
                  wrapExpressionContainingJsxAsRootMountFn(retExpr),
                );
              }
            }
            if (ts.isArrowFunction(eff) && !ts.isBlock(eff.body)) {
              const bodyExpr = eff.body as ts.Expression;
              const foldedBody = deepFoldStaticJsxExpressionForInsert(bodyExpr);
              const jsxFromFoldedBody = getJsxFromReturnExpression(foldedBody);
              if (jsxFromFoldedBody) {
                found = true;
                const mountFn = jsxToRuntimeFunction(jsxFromFoldedBody);
                return factory.createArrowFunction(
                  undefined,
                  undefined,
                  eff.parameters,
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  mountFn,
                );
              }
              const jsx = getJsxFromReturnExpression(bodyExpr);
              if (jsx) {
                found = true;
                const mountFn = jsxToRuntimeFunction(jsx);
                return factory.createArrowFunction(
                  undefined,
                  undefined,
                  eff.parameters,
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  mountFn,
                );
              }
              if (expressionContainsJsx(bodyExpr)) {
                found = true;
                /**
                 * 仅零参箭头（如组件 `return () => cond ? <a/> : <b/>`）才包
                 * {@link wrapExpressionContainingJsxAsRootMountFn}。
                 * `.map((item) => cond ? <select/> : <button/>)` 等**带参**回调若同样外包
                 * `(parent)=>insertReactive(parent, ()=>…)`，则 map 返回的是未打标单参函数，
                 * `insertReactive` 数组分支只认 `isMountFn`，子项整段跳过（富文本工具栏等空白）。
                 */
                const bodyForArrow = eff.parameters.length === 0
                  ? wrapExpressionContainingJsxAsRootMountFn(bodyExpr)
                  : transformExpressionJsxToCalls(bodyExpr);
                return factory.createArrowFunction(
                  undefined,
                  undefined,
                  eff.parameters,
                  undefined,
                  factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  bodyForArrow,
                );
              }
            }
            return eff;
          };

          const visit: ts.Visitor = (node) => {
            const scopeBody = tryGetCompileScopeFunctionBody(node);
            if (scopeBody !== undefined) {
              const parentEff = reactiveBindingsStackForCompile.length > 0
                ? reactiveBindingsStackForCompile[
                  reactiveBindingsStackForCompile.length - 1
                ]!
                : new Set<string>();
              const parentCopy = new Set<string>(parentEff);
              const effective = collectScopedSignalsAndShadows(
                scopeBody,
                parentCopy,
              );
              reactiveBindingsStackForCompile.push(effective);
              try {
                const visited = ts.visitEachChild(node, visit, context);
                const eff = ts.isArrowFunction(visited)
                  ? collapseArrowBlockToConciseBodyWhenEligible(
                    visited as ts.ArrowFunction,
                  )
                  : visited;
                return applyCompileSourceJsxToReturnOrConciseArrow(eff);
              } finally {
                reactiveBindingsStackForCompile.pop();
              }
            }
            const visited = ts.visitEachChild(node, visit, context);
            const eff = ts.isArrowFunction(visited)
              ? collapseArrowBlockToConciseBodyWhenEligible(
                visited as ts.ArrowFunction,
              )
              : visited;
            return applyCompileSourceJsxToReturnOrConciseArrow(eff);
          };
          return (sf) => ts.visitNode(sf, visit) as ts.SourceFile;
        },
      ]);
    } finally {
      slotGetterTagLocalsForCurrentCompile = undefined;
      reactiveBindingsStackForCompile = [];
    }
    const transformed = result.transformed[0] as ts.SourceFile;
    result.dispose();
    if (!found && !viewMemoApplied) return source;
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    let out: string;
    try {
      out = printer.printFile(transformed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Node must have a real position|Debug Failure/i.test(msg)) {
        out = printFileSafe(transformed, source);
      } else {
        throw err;
      }
    }
    const escapedPath = insertImportPath.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const hasInsertImport = new RegExp(
      `import\\s*\\{[^}]*\\binsert\\b[^}]*\\}\\s*from\\s*["']${escapedPath}["']`,
    ).test(out);
    /** 主入口路径不导出 getActiveDocument，须从 compiler 子路径单独导入 */
    const isMainViewPath = insertImportPath === "@dreamer/view" ||
      insertImportPath.endsWith("mod.ts");
    const RUNTIME_NAMES_TO_INJECT_INTO_EXISTING_IMPORT: readonly string[] = [
      "unwrapSignalGetterValue",
      "coalesceIrList",
      "insertReactive",
      "getActiveDocument",
      "createEffect",
      "createMemo",
      "untrack",
      "mergeProps",
      "spreadIntrinsicProps",
      "setIntrinsicDomAttribute",
      "markMountFn",
      "isMountFn",
      "isSignalGetter",
      "Dynamic",
    ];
    const needScheduleFunctionRefImport =
      out.includes("scheduleFunctionRef(") &&
      !/import\s*\{[^}]*\bscheduleFunctionRef\b/.test(out);
    const scheduleFunctionRefImportLine = needScheduleFunctionRefImport
      ? `import { scheduleFunctionRef } from "${insertImportPath}";\n`
      : "";

    if (!hasInsertImport) {
      let spec = "insert, insertReactive";
      if (out.includes("getActiveDocument(")) {
        if (!isMainViewPath) spec += ", getActiveDocument";
      }
      if (out.includes("scheduleFunctionRef(")) spec += ", scheduleFunctionRef";
      if (out.includes("createEffect(")) spec += ", createEffect";
      if (out.includes("createMemo(")) spec += ", createMemo";
      if (out.includes("untrack(")) spec += ", untrack";
      if (out.includes("mergeProps(")) spec += ", mergeProps";
      if (out.includes("spreadIntrinsicProps(")) {
        spec += ", spreadIntrinsicProps";
      }
      if (out.includes("setIntrinsicDomAttribute(")) {
        spec += ", setIntrinsicDomAttribute";
      }
      if (out.includes("unwrapSignalGetterValue(")) {
        spec += ", unwrapSignalGetterValue";
      }
      if (out.includes("coalesceIrList(")) {
        spec += ", coalesceIrList";
      }
      if (out.includes("markMountFn(")) spec += ", markMountFn";
      if (out.includes("isMountFn(")) spec += ", isMountFn";
      if (out.includes("isSignalGetter(")) spec += ", isSignalGetter";
      const getActiveDocumentLine =
        out.includes("getActiveDocument(") && isMainViewPath
          ? 'import { getActiveDocument } from "@dreamer/view/compiler";\n'
          : "";
      let prepend = getActiveDocumentLine +
        `import { ${spec} } from "${insertImportPath}";\n`;
      if (
        out.includes("applyDirectives(") ||
        out.includes("registerDirectiveUnmount(")
      ) {
        prepend +=
          'import { applyDirectives, registerDirectiveUnmount } from "@dreamer/view/directive";\n';
      }
      return prepend + out;
    }
    let patchedOut = out;
    let getActiveDocumentPrepend = "";
    for (const name of RUNTIME_NAMES_TO_INJECT_INTO_EXISTING_IMPORT) {
      if (
        !patchedOut.includes(`${name}(`) ||
        new RegExp(`import\\s*\\{[^}]*\\b${name}\\b`).test(patchedOut)
      ) {
        continue;
      }
      if (
        name === "getActiveDocument" &&
        isMainViewPath
      ) {
        getActiveDocumentPrepend =
          'import { getActiveDocument } from "@dreamer/view/compiler";\n';
        continue;
      }
      patchedOut = injectNamedImportFromPath(
        patchedOut,
        insertImportPath,
        name,
      );
    }
    patchedOut = getActiveDocumentPrepend + patchedOut;
    if (
      patchedOut.includes("applyDirectives(") ||
      patchedOut.includes("registerDirectiveUnmount(")
    ) {
      return (
        scheduleFunctionRefImportLine +
        'import { applyDirectives, registerDirectiveUnmount } from "@dreamer/view/directive";\n' +
        patchedOut
      );
    }
    return scheduleFunctionRefImportLine + patchedOut;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Node must have a real position|Debug Failure/i.test(msg)) {
      const stack = err instanceof Error ? err.stack : "";
      console.warn(
        "[view/compileSource] position assertion during compile (transform or print); falling back to original source, file:",
        fileName,
        msg,
        stack ? "\n" + stack : "",
      );
      return source;
    }
    throw err;
  }
}
