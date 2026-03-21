/**
 * JSX 编译器实现：将 TSX 中的 JSX 转为对 `insert` / `document.createElement` / `insertReactive` 等的运行时调用 AST。
 *
 * **规则概要：**
 * - 内置元素 `<div>` → `createElement` + `appendChild`，子节点递归
 * - 组件 `<Comp />` → 执行 `Comp(props)`，再 `insert(parent, getter | () => value)`
 * - `{ expr }` → `insert(parent, () => expr)`
 * - 文本 → `insert(parent, text)`
 *
 * **内置指令：** v-if / v-else-if / v-else（兄弟链）、v-once（`untrack`）、v-cloak（`data-view-cloak`）等；显隐请用 `vIf`。
 * 自定义 `registerDirective` 与运行时指令仍见 `@dreamer/view/directive`。
 *
 * @module @dreamer/view/jsx-compiler/transform
 * @internal 由 `@dreamer/view/jsx-compiler` 聚合导出 `compileSource` / `jsxToRuntimeFunction`，构建请依赖该入口
 */

import ts from "typescript";

const factory = ts.factory;

/**
 * 编译生成的「挂到父 DOM」挂载函数形参名（如 `(here) => { here.appendChild(...) }`）。
 * 若与组件根 `return (parent) => { ... }` 同名 `parent`，在嵌套场景下（Suspense + Promise.then 内 JSX
 * 会再生成内层挂载箭头）部分工具链可能把内层函数体里的 `parent` 误解析为外层形参，导致内层
 * `appendChild` 收到 undefined/null。根挂载与 v-if 分支挂载箭头须与此一致。
 */
const JSX_MOUNT_FN_PARENT_PARAM = "__viewMountParent";

let varCounter = 0;

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
            const attrName = factory.createStringLiteral("class");
            stmts.push(
              factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier(elVar),
                    "setAttribute",
                  ),
                  undefined,
                  [attrName, exprNode],
                ),
              ),
            );
          } else {
            stmts.push(
              factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createPropertyAccessExpression(
                    factory.createIdentifier(elVar),
                    "setAttribute",
                  ),
                  undefined,
                  [
                    factory.createStringLiteral(
                      domAttrNameForSetAttribute(name),
                    ),
                    exprNode,
                  ],
                ),
              ),
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
    // 将表达式内嵌的 JSX（如 isDark ? <SunIcon /> : <MoonIcon />）转为组件调用，避免输出未编译 JSX
    const transformedExpr = transformExpressionJsxToCalls(
      expr as ts.Expression,
    );
    // 无参箭头/函数表达式（如 { () => vModelText() || "(空)" }）须在 insertReactive 的 getter 内调用再返回，否则 getter() 返回函数，toNode(函数) 得空文本，页上不显示
    const exprForGetterInner = (ts.isArrowFunction(transformedExpr) ||
        ts.isFunctionExpression(transformedExpr)) &&
        transformedExpr.parameters.length === 0
      ? factory.createCallExpression(transformedExpr, undefined, [])
      : transformedExpr;
    /** 裸 `count` / `props.x` 包 unwrap，产物内须从 insert 路径导入 unwrapSignalGetterValue */
    const textInsertExpr = wrapBareRefForTextInsert(exprForGetterInner);
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
        const isEmpty = !expr ||
          (!isFn && safeNodeText(expr as ts.Node).trim() === "");
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
  if (
    ts.isJsxSelfClosingElement(expr) ||
    ts.isJsxElement(expr) ||
    ts.isJsxFragment(expr)
  ) {
    return jsxToRuntimeFunction(expr, { resetVarCounter: false });
  }
  return expr;
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
    return node.arguments.some((a) =>
      ts.isExpression(a) && expressionContainsJsx(a)
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((el) =>
      ts.isExpression(el) && expressionContainsJsx(el)
    );
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
    const args = node.arguments ?? [];
    return args.some((a) => ts.isExpression(a) && expressionContainsJsx(a));
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
  return false;
}

/**
 * 根级 `return` / 箭头表达式体含 JSX 但非单棵 JSX 时，包成 `(parent) => { insertReactive(parent, () => …); }`。
 *
 * @param expr - 原始 return 体或箭头表达式体
 * @returns 与 `jsxToRuntimeFunction` 同形的根挂载箭头
 */
function wrapExpressionContainingJsxAsRootMountFn(
  expr: ts.Expression,
): ts.ArrowFunction {
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
    factory.createBlock(
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
      ],
      true,
    ),
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
 * 为组件 <Comp ... /> 或 <Comp></Comp> 生成：构建 props、运行一次 Comp(props)，挂载函数直接调用否则 insertReactive(parent, () => result)。
 * Suspense：children 为无参箭头 `() => slot`。
 * 其余自定义组件（含 ErrorBoundary、Form、ThemeContext.Provider）：children 一律为 `(parent)=>void`，
 * 避免 DocumentFragment 被 append 进父节点后变空、insertReactive 二次执行无法复挂子树。
 */
function buildComponentStatements(
  parentVar: string,
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  ctx: EmitContext,
): ts.Statement[] {
  const insertReactiveId = ctx.insertReactiveId;
  const open = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
  const children = ts.isJsxSelfClosingElement(node) ? [] : node.children;
  const compExpr = tagNameToExpression(open.tagName);
  const tagNameStr = getComponentTagName(open.tagName);
  const propsVar = nextVar();
  const resultVar = nextVar();
  /** 仅 children 等需在属性 merge 之后追加的单键对象（与 buildJsxAttributesMergeSegments 分离） */
  const propsEntries: ts.ObjectLiteralElementLike[] = [];
  const allStmts: ts.Statement[] = [];
  if (children.length > 0) {
    if (tagNameStr === "Suspense") {
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
   * - `typeof result === "function" && result.length === 1`：视为编译产物 MountFn `(parent)=>void`，直接 `result(parent)`。
   * - `typeof result === "function"` 且非单参：视为 `() => VNode` 等 getter（如 ui-view 风格 Form），`insertReactive(parent, () => result())`，
   *   不可再 `result(parent)`（零参函数会忽略 parent、返回的 VNode 被丢弃，页面空白）。
   * - 否则：`insertReactive(parent, () => result)`（VNode 或非函数值）。
   */
  const resultIsFunction = factory.createBinaryExpression(
    factory.createTypeOfExpression(factory.createIdentifier(resultVar)),
    factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
    factory.createStringLiteral("function"),
  );
  const resultIsMountFn = factory.createBinaryExpression(
    resultIsFunction,
    factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
    factory.createBinaryExpression(
      factory.createPropertyAccessExpression(
        factory.createIdentifier(resultVar),
        "length",
      ),
      factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
      factory.createNumericLiteral(1),
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
      resultIsMountFn,
      callResultAsMount,
      factory.createIfStatement(
        resultIsFunction,
        insertReactiveCallGetterResult,
        insertReactiveWrapResult,
      ),
    ),
  );
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
): ts.ArrowFunction {
  const stmts = buildElementStatements(
    JSX_MOUNT_FN_PARENT_PARAM,
    branch.node,
    ctx,
    {
      omitVIfWrap: true,
    },
  );
  return factory.createArrowFunction(
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
  );
}

/**
 * 单分支 v-if 在条件为 false 时返回的挂载函数：空函数体，不向 parent 插入任何节点。
 * 与手写 `vElse` 空支语义一致，保证 `insertReactive` **始终**走 MountFn 分支，从而可靠 detach 上一帧子树；
 * 若仅 `if (cond) return mount` 而 false 时隐式 `undefined`，在部分 CSR/嵌套挂载路径下曾出现 DOM 残留。
 */
function buildNoOpIfFalseMountArrow(): ts.ArrowFunction {
  return factory.createArrowFunction(
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
 * @returns TypeScript `ArrowFunction` 节点，供 `compileSource` 或其它 transform 嵌入
 */
export function jsxToRuntimeFunction(
  node: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement,
  options?: JsxToRuntimeFunctionOptions,
): ts.ArrowFunction {
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
  return factory.createArrowFunction(
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
  return null;
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
export function compileSource(
  source: string,
  fileName = "input.tsx",
  options?: CompileSourceOptions,
): string {
  if (!sourceMayContainCompilableJsx(source)) return source;
  const insertImportPath = options?.insertImportPath ??
    "@dreamer/view/compiler";
  try {
    const sourceFile = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    resetVarCounter();
    let found = false;
    const result = ts.transform(sourceFile, [
      (context) => {
        const visit: ts.Visitor = (node) => {
          const visited = ts.visitEachChild(node, visit, context);
          if (ts.isReturnStatement(visited) && visited.expression) {
            const jsx = getJsxFromReturnExpression(visited.expression);
            if (jsx) {
              found = true;
              // 不要用 updateReturnStatement：合成 expression 与带真实 pos 的旧节点合并时，
              // TS 内部可能触发 “Node must have a real position”（如 boundary 等大 JSX 树）。
              return factory.createReturnStatement(jsxToRuntimeFunction(jsx));
            }
            if (expressionContainsJsx(visited.expression)) {
              found = true;
              return factory.createReturnStatement(
                wrapExpressionContainingJsxAsRootMountFn(visited.expression),
              );
            }
          }
          if (ts.isArrowFunction(visited) && !ts.isBlock(visited.body)) {
            const bodyExpr = visited.body as ts.Expression;
            const jsx = getJsxFromReturnExpression(bodyExpr);
            if (jsx) {
              found = true;
              const mountFn = jsxToRuntimeFunction(jsx);
              return factory.createArrowFunction(
                undefined,
                undefined,
                visited.parameters,
                undefined,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                mountFn,
              );
            }
            if (expressionContainsJsx(bodyExpr)) {
              found = true;
              return factory.createArrowFunction(
                undefined,
                undefined,
                visited.parameters,
                undefined,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                wrapExpressionContainingJsxAsRootMountFn(bodyExpr),
              );
            }
          }
          return visited;
        };
        return (sf) => ts.visitNode(sf, visit) as ts.SourceFile;
      },
    ]);
    const transformed = result.transformed[0] as ts.SourceFile;
    result.dispose();
    if (!found) return source;
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
      "insertReactive",
      "getActiveDocument",
      "createEffect",
      "untrack",
      "mergeProps",
      "spreadIntrinsicProps",
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
      if (out.includes("untrack(")) spec += ", untrack";
      if (out.includes("mergeProps(")) spec += ", mergeProps";
      if (out.includes("spreadIntrinsicProps(")) {
        spec += ", spreadIntrinsicProps";
      }
      if (out.includes("unwrapSignalGetterValue(")) {
        spec += ", unwrapSignalGetterValue";
      }
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
