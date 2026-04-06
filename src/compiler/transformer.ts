/**
 * @module compiler/transformer
 * @description JSX 转换器 - 将 JSX 转换为高效的运行时模板代码。
 *
 * **支持的功能：**
 * - ✅ JSX 到运行时代码的转换
 * - ✅ 静态子树优化 (完全静态的部分转换为模板)
 * - ✅ 动态绑定生成 (DynamicBinding)
 * - ✅ SSR 和 DOM 两种生成模式支持
 * - ✅ HMR (热模块替换) 支持
 * - ✅ Hydration (水合) 支持
 *
 * **核心机制：**
 * - TypeScript Transformer API
 * - 静态分析 + 代码生成
 * - 模板克隆优化 (template cloning)
 * - 动态节点绑定系统
 *
 * **范围说明：**
 * - 转换规则随 JSX/TS 语法演进持续迭代；自定义工厂、Source Map、超大文件性能等按需单独立项。
 *
 * @usage
 * const transformer = createTransformer(options)
 * const result = ts.transform(sourceFile, [transformer])
 */

import ts from "typescript";
import { getTagName, serializeToTemplate } from "./analyzer.ts";

export interface TransformOptions {
  hydration?: boolean;
  generate?: "dom" | "ssr";
  hmr?: boolean;
}

/**
 * 判断表达式是否包含函数调用（认为其可能是响应式的）。
 */
function isPotentiallyReactive(node: ts.Node): boolean {
  let reactive = false;
  function walk(n: ts.Node) {
    if (
      ts.isCallExpression(n) || ts.isPropertyAccessExpression(n) ||
      ts.isElementAccessExpression(n)
    ) {
      reactive = true;
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
  return reactive;
}

function isJsxLike(node: ts.Node): boolean {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node);
}

/**
 * 是否为 `export default` 声明（同时含 export 与 default 修饰符）。
 */
function hasExportDefaultModifier(
  modifiers: readonly ts.ModifierLike[] | undefined,
): boolean {
  if (!modifiers?.length) return false;
  let hasExport = false;
  let hasDefault = false;
  for (const m of modifiers) {
    if (m.kind === ts.SyntaxKind.ExportKeyword) hasExport = true;
    if (m.kind === ts.SyntaxKind.DefaultKeyword) hasDefault = true;
  }
  return hasExport && hasDefault;
}

/**
 * SSR 专用转换逻辑：将 JSX 转换为字符串拼接
 */
function rewriteToSSR(
  factory: ts.NodeFactory,
  node: ts.Node,
  visitor: (n: ts.Node) => ts.Node,
): ts.Expression {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tagName = (opening.tagName as ts.Identifier).text;

    // 如果是组件，走组件处理逻辑 (由 visitor 完成)
    if (tagName[0] === tagName[0].toUpperCase() || tagName.includes(".")) {
      return visitor(node) as ts.Expression;
    }

    const parts: (string | ts.Expression)[] = [`<${tagName}`];

    // 处理属性
    opening.attributes.properties.forEach((attr) => {
      if (ts.isJsxAttribute(attr)) {
        const name = ts.isIdentifier(attr.name)
          ? attr.name.text
          : (attr.name as ts.JsxNamespacedName).name.text;
        // SSR 跳过事件
        if (name.startsWith("on")) return;

        parts.push(` ${name === "className" ? "class" : name}="`);
        if (attr.initializer) {
          if (ts.isJsxExpression(attr.initializer)) {
            parts.push(
              ts.visitNode(
                attr.initializer.expression!,
                visitor,
              ) as ts.Expression,
            );
          } else {
            parts.push((attr.initializer as ts.StringLiteral).text);
          }
        }
        parts.push(`"`);
      }
    });

    parts.push(`>`);

    // 处理子节点
    if (ts.isJsxElement(node)) {
      node.children.forEach((child) => {
        if (ts.isJsxText(child)) {
          if (child.text.trim() === "" && child.text.includes("\n")) return;
          const text = child.text.replace(/\s+/g, " ");
          if (text === "") return;
          parts.push(text);
        } else if (ts.isJsxExpression(child)) {
          if (child.expression) {
            parts.push(
              ts.visitNode(child.expression, visitor) as ts.Expression,
            );
          }
        } else {
          // 通过 visitor 递归，以支持组件和片段
          const visited = ts.visitNode(child, visitor);
          if (visited) parts.push(visited as ts.Expression);
        }
      });
      parts.push(`</${tagName}>`);
    }

    // 将 parts 合并，尽可能合并相邻的静态字符串
    const optimizedParts: (string | ts.Expression)[] = [];
    parts.forEach((p) => {
      const last = optimizedParts[optimizedParts.length - 1];
      if (typeof p === "string" && typeof last === "string") {
        optimizedParts[optimizedParts.length - 1] = last + p;
      } else {
        optimizedParts.push(p);
      }
    });

    if (optimizedParts.length === 1 && typeof optimizedParts[0] === "string") {
      return factory.createStringLiteral(optimizedParts[0]);
    }

    let expr: ts.Expression = typeof optimizedParts[0] === "string"
      ? factory.createStringLiteral(optimizedParts[0])
      : (optimizedParts[0] as ts.Expression);

    for (let i = 1; i < optimizedParts.length; i++) {
      const p = optimizedParts[i];
      const nextExpr = typeof p === "string"
        ? factory.createStringLiteral(p)
        : (p as ts.Expression);
      expr = factory.createBinaryExpression(
        expr,
        ts.SyntaxKind.PlusToken,
        nextExpr,
      );
    }

    return expr;
  }

  if (ts.isJsxFragment(node)) {
    let expr: ts.Expression = factory.createStringLiteral("");
    node.children.forEach((child) => {
      const childExpr = ts.isJsxText(child)
        ? factory.createStringLiteral(child.text)
        : ts.visitNode(child, visitor) as ts.Expression;
      expr = factory.createBinaryExpression(
        expr,
        ts.SyntaxKind.PlusToken,
        childExpr,
      );
    });
    return expr;
  }

  return ts.visitNode(node, visitor) as ts.Expression;
}

export function transformJSX(
  context: ts.TransformationContext,
  options: TransformOptions = {},
): (sourceFile: ts.SourceFile) => ts.SourceFile {
  const { factory } = context;
  const hoistedTemplates: ts.VariableDeclaration[] = [];
  const bindingMap: [number[], string][] = [];
  let templateCount = 0;

  return (sourceFile: ts.SourceFile) => {
    function visitor(node: ts.Node): ts.Node {
      // 极致优化：三元运算符内联化
      if (
        ts.isConditionalExpression(node) &&
        (isJsxLike(node.whenTrue) || isJsxLike(node.whenFalse))
      ) {
        return factory.createCallExpression(
          factory.createIdentifier("memo"),
          undefined,
          [
            factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              undefined,
              factory.createConditionalExpression(
                ts.visitNode(node.condition, visitor) as ts.Expression,
                node.questionToken,
                ts.visitNode(node.whenTrue, visitor) as ts.Expression,
                node.colonToken,
                ts.visitNode(node.whenFalse, visitor) as ts.Expression,
              ),
            ),
          ],
        );
      }

      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tagName = getTagName(opening.tagName);

        if (tagName[0] === tagName[0].toUpperCase() || tagName.includes(".")) {
          // 组件处理
          const props: ts.ObjectLiteralElementLike[] = [];
          const attributes = ts.isJsxElement(node)
            ? node.openingElement.attributes
            : node.attributes;

          attributes.properties.forEach((attr) => {
            if (ts.isJsxAttribute(attr)) {
              const name = ts.isIdentifier(attr.name)
                ? attr.name.text
                : (attr.name as ts.JsxNamespacedName).name.text;
              const value = attr.initializer;
              let propValue: ts.Expression;

              if (!value) {
                propValue = factory.createTrue();
              } else if (ts.isJsxExpression(value)) {
                // 如果是 SSR，不需要包装箭头函数，直接求值
                if (options.generate === "ssr") {
                  propValue = ts.visitNode(
                    value.expression!,
                    visitor,
                  ) as ts.Expression;
                } else {
                  propValue = factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    undefined,
                    ts.visitNode(value.expression!, visitor) as ts.Expression,
                  );
                }
              } else {
                propValue = ts.visitNode(
                  value as ts.Expression,
                  visitor,
                ) as ts.Expression;
              }

              props.push(factory.createPropertyAssignment(name, propValue));
            } else if (ts.isJsxSpreadAttribute(attr)) {
              props.push(
                factory.createSpreadAssignment(
                  ts.visitNode(attr.expression, visitor) as ts.Expression,
                ),
              );
            }
          });

          if (ts.isJsxElement(node) && node.children.length > 0) {
            const childrenExprs = node.children.map((child) =>
              ts.visitNode(child, visitor) as ts.Expression
            )
              .filter((expr) => expr !== undefined);

            let childrenValue: ts.Expression | undefined;
            if (childrenExprs.length === 1) {
              childrenValue = childrenExprs[0];
            } else if (childrenExprs.length > 1) {
              childrenValue = factory.createArrayLiteralExpression(
                childrenExprs,
              );
            }

            if (childrenValue) {
              // 关键修正：为了保证 Context 等组件的自顶向下懒执行特性，
              // 我们必须将组件的 children 包装为一个 getter 函数！
              const lazyChildren = factory.createArrowFunction(
                undefined,
                undefined,
                [],
                undefined,
                undefined,
                childrenValue,
              );
              props.push(
                factory.createPropertyAssignment("children", lazyChildren),
              );
            }
          }

          let componentExpr: ts.Expression;
          if (
            ts.isIdentifier(opening.tagName) ||
            ts.isPropertyAccessExpression(opening.tagName)
          ) {
            componentExpr = opening.tagName;
          } else {
            componentExpr = factory.createIdentifier(tagName.replace(":", "_"));
          }

          return factory.createCallExpression(
            componentExpr,
            undefined,
            [factory.createObjectLiteralExpression(props, true)],
          );
        }

        if (options.generate === "ssr") {
          return rewriteToSSR(factory, node, visitor);
        }

        return rewriteToTemplateCloning(node);
      }

      if (ts.isJsxFragment(node)) {
        // Fragment 处理：直接返回子节点数组或 DocumentFragment
        const children = node.children.map((child) =>
          ts.visitNode(child, visitor) as ts.Expression
        )
          .filter((c) => c !== undefined);

        return factory.createCallExpression(
          factory.createArrowFunction(
            undefined,
            undefined,
            [],
            undefined,
            undefined,
            factory.createBlock([
              factory.createVariableStatement(
                undefined,
                factory.createVariableDeclarationList([
                  factory.createVariableDeclaration(
                    "_frag",
                    undefined,
                    undefined,
                    factory.createCallExpression(
                      factory.createPropertyAccessExpression(
                        factory.createIdentifier("document"),
                        "createDocumentFragment",
                      ),
                      undefined,
                      [],
                    ),
                  ),
                ], ts.NodeFlags.Const),
              ),
              ...children.map((c) =>
                factory.createExpressionStatement(
                  factory.createCallExpression(
                    factory.createIdentifier("insert"),
                    undefined,
                    [factory.createIdentifier("_frag"), c],
                  ),
                )
              ),
              factory.createReturnStatement(factory.createIdentifier("_frag")),
            ], true),
          ),
          undefined,
          [],
        );
      }

      if (ts.isJsxText(node)) {
        if (node.text.trim() === "" && node.text.includes("\n")) {
          return undefined as unknown as ts.Expression;
        }
        const text = node.text.replace(/\s+/g, " ");
        if (text === "") return undefined as unknown as ts.Expression;
        return factory.createStringLiteral(text);
      }

      if (ts.isJsxExpression(node)) {
        if (!node.expression) return undefined as unknown as ts.Expression;
        return ts.visitNode(node.expression, visitor);
      }

      return ts.visitEachChild(node, visitor, context);
    }

    function rewriteToTemplateCloning(node: ts.Node): ts.Expression {
      const { html, dynamics } = serializeToTemplate(node);
      const tmplName = `_tmpl$${++templateCount}`;

      hoistedTemplates.push(
        factory.createVariableDeclaration(
          factory.createIdentifier(tmplName),
          undefined,
          undefined,
          factory.createCallExpression(
            factory.createIdentifier("template"),
            undefined,
            [factory.createStringLiteral(html)],
          ),
        ),
      );

      const statements: ts.Statement[] = [
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                factory.createIdentifier("_el"),
                undefined,
                undefined,
                factory.createCallExpression(
                  factory.createIdentifier(tmplName),
                  undefined,
                  [],
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      ];

      dynamics.forEach((dyn) => {
        if (options.hydration) {
          bindingMap.push([dyn.path, dyn.id]);
        }

        const walkExpr = dyn.path.length === 0
          ? factory.createIdentifier("_el")
          : factory.createCallExpression(
            factory.createIdentifier("walk"),
            undefined,
            [
              factory.createIdentifier("_el"),
              factory.createArrayLiteralExpression(
                dyn.path.map((p) => factory.createNumericLiteral(p)),
              ),
            ],
          );

        const targetNodeExpr = options.hydration
          ? factory.createBinaryExpression(
            factory.createCallExpression(
              factory.createIdentifier("useHydratedNode"),
              undefined,
              [factory.createStringLiteral(dyn.id)],
            ),
            ts.SyntaxKind.BarBarToken,
            walkExpr,
          )
          : walkExpr;

        if (dyn.type === "child") {
          const transformedExpr = ts.visitNode(
            dyn.expression,
            visitor,
          ) as ts.Expression;
          const isReactive = isPotentiallyReactive(dyn.expression);
          statements.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createIdentifier("insert"),
                undefined,
                [
                  targetNodeExpr,
                  isReactive
                    ? factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      undefined,
                      transformedExpr,
                    )
                    : transformedExpr,
                ],
              ),
            ),
          );
        } else if (dyn.type === "attribute") {
          const transformedExpr = ts.visitNode(
            dyn.expression,
            visitor,
          ) as ts.Expression;
          const isReactive = isPotentiallyReactive(dyn.expression);

          if (isReactive) {
            statements.push(
              factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createIdentifier("setAttribute"),
                  undefined,
                  [
                    targetNodeExpr,
                    factory.createStringLiteral(dyn.name!),
                    factory.createArrowFunction(
                      undefined,
                      undefined,
                      [],
                      undefined,
                      undefined,
                      transformedExpr,
                    ),
                  ],
                ),
              ),
            );
          } else {
            // 优化：非响应式属性直接调用 setProperty，省去 Effect 开销
            statements.push(
              factory.createExpressionStatement(
                factory.createCallExpression(
                  factory.createIdentifier("setProperty"),
                  undefined,
                  [
                    targetNodeExpr,
                    factory.createStringLiteral(dyn.name!),
                    transformedExpr,
                  ],
                ),
              ),
            );
          }
        } else if (dyn.type === "event") {
          // target.addEventListener("name", expr)
          statements.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createPropertyAccessExpression(
                  targetNodeExpr,
                  "addEventListener",
                ),
                undefined,
                [
                  factory.createStringLiteral(dyn.name!),
                  ts.visitNode(dyn.expression, visitor) as ts.Expression,
                ],
              ),
            ),
          );
        } else if (dyn.type === "ref") {
          // expr(target)
          statements.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                ts.visitNode(dyn.expression, visitor) as ts.Expression,
                undefined,
                [targetNodeExpr],
              ),
            ),
          );
        } else if (dyn.type === "spread") {
          // spread(target, expr)
          statements.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createIdentifier("spread"),
                undefined,
                [
                  targetNodeExpr,
                  ts.visitNode(dyn.expression, visitor) as ts.Expression,
                ],
              ),
            ),
          );
        } else if (dyn.type === "directive") {
          // directive(target, () => expr)
          const transformedExpr = ts.visitNode(
            dyn.expression,
            visitor,
          ) as ts.Expression;
          statements.push(
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createIdentifier(dyn.name!),
                undefined,
                [
                  targetNodeExpr,
                  factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    undefined,
                    transformedExpr,
                  ),
                ],
              ),
            ),
          );
        }
      });

      statements.push(
        factory.createReturnStatement(factory.createIdentifier("_el")),
      );

      return factory.createCallExpression(
        factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          factory.createBlock(statements, true),
        ),
        undefined,
        [],
      );
    }

    const transformedSource = ts.visitNode(
      sourceFile,
      visitor,
    ) as ts.SourceFile;
    let finalStatements: ts.Statement[] = [...transformedSource.statements];

    // 极致优化：HMR 组件代理自动注入
    if (options.hmr) {
      const hmrProcessed: ts.Statement[] = [];
      for (const stmt of finalStatements) {
        // 识别 `export default function Home() {}` / 匿名 `export default function() {}`
        // 路由页常用 default export，若不包装则 HMR 动态 import 新 chunk 不会更新已挂载树
        if (
          ts.isFunctionDeclaration(stmt) &&
          stmt.body &&
          hasExportDefaultModifier(stmt.modifiers)
        ) {
          const declaredName = stmt.name?.text;
          const internalName = declaredName ?? "__view_default__";
          const hmrId = `${sourceFile.fileName}:${declaredName ?? "default"}`;
          const innerModifiers = stmt.modifiers?.filter(
            (m) =>
              m.kind !== ts.SyntaxKind.ExportKeyword &&
              m.kind !== ts.SyntaxKind.DefaultKeyword,
          );
          const plainFn = factory.updateFunctionDeclaration(
            stmt,
            innerModifiers?.length ? innerModifiers : undefined,
            stmt.asteriskToken,
            declaredName ? stmt.name! : factory.createIdentifier(internalName),
            stmt.typeParameters,
            stmt.parameters,
            stmt.type,
            stmt.body,
          );
          hmrProcessed.push(plainFn);
          hmrProcessed.push(
            factory.createExportAssignment(
              undefined,
              false,
              factory.createCallExpression(
                factory.createIdentifier("createHMRProxy"),
                undefined,
                [
                  factory.createStringLiteral(hmrId),
                  factory.createIdentifier(internalName),
                ],
              ),
            ),
          );
          continue;
        }

        // 识别 export const MyComp = ...
        if (
          ts.isVariableStatement(stmt) &&
          stmt.modifiers?.some((m) => m?.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          const declarations = stmt.declarationList.declarations.map((decl) => {
            const name = (decl.name as ts.Identifier).text;
            // 约定：大写字母开头为组件
            if (name[0] === name[0].toUpperCase() && decl.initializer) {
              const hmrId = `${sourceFile.fileName}:${name}`;
              return factory.updateVariableDeclaration(
                decl,
                decl.name,
                undefined,
                undefined,
                factory.createCallExpression(
                  factory.createIdentifier("createHMRProxy"),
                  undefined,
                  [
                    factory.createStringLiteral(hmrId),
                    decl.initializer,
                  ],
                ),
              );
            }
            return decl;
          });
          hmrProcessed.push(
            factory.updateVariableStatement(
              stmt,
              stmt.modifiers,
              factory.updateVariableDeclarationList(
                stmt.declarationList,
                declarations,
              ),
            ),
          );
          continue;
        }

        hmrProcessed.push(stmt);
      }
      finalStatements = hmrProcessed;
    }

    if (hoistedTemplates.length > 0) {
      const hoistedStatement = factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          hoistedTemplates,
          ts.NodeFlags.Const,
        ),
      );
      finalStatements.unshift(hoistedStatement);
    }

    if (options.hydration && bindingMap.length > 0) {
      const mapStatement = factory.createVariableStatement(
        [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList([
          factory.createVariableDeclaration(
            factory.createIdentifier("_bindingMap"),
            undefined,
            undefined,
            factory.createArrayLiteralExpression(
              bindingMap.map(([path, id]) =>
                factory.createArrayLiteralExpression([
                  factory.createArrayLiteralExpression(
                    path.map((p) => factory.createNumericLiteral(p)),
                  ),
                  factory.createStringLiteral(id),
                ])
              ),
            ),
          ),
        ], ts.NodeFlags.Const),
      );
      finalStatements.push(mapStatement);
    }

    return factory.updateSourceFile(transformedSource, finalStatements);
  };
}
