/**
 * @module compiler/analyzer
 * @description 静态子树分析与提升器 - JSX 静态分析引擎。
 *
 * **支持的功能：**
 * - ✅ 静态子树分析 (完全静态的 JSX 可以优化为模板)
 * - ✅ 动态绑定识别 (DynamicBinding)
 * - ✅ 路径计算 (用于 hydration 的节点定位)
 * - ✅ JSX 节点类型分类 (text, attribute, child, event 等)
 * - ✅ 静态提升优化 (static subtree lifting)
 *
 * **核心机制：**
 * - TypeScript AST 遍历分析
 * - 静态 vs 动态节点判断
 * - 绑定信息收集和路径编码
 * - 编译期优化决策
 *
 * **范围说明：**
 * - 静态规则与指令分析、巨型 AST 性能优化属编译器演进项，见 issue/路线图；本文件聚焦当前分析管线。
 *
 * @usage
 * const analysis = analyzeJSXNode(jsxNode)
 */

import ts from "typescript";

export interface DynamicBinding {
  id: string; // 唯一 ID，用于水合
  path: number[];
  expression: ts.Expression;
  type:
    | "text"
    | "attribute"
    | "child"
    | "event"
    | "ref"
    | "spread"
    | "directive";
  name?: string; // For attributes, events and directives
}

/**
 * 判断 JSX 节点是否为完全静态（不含任何动态表达式及组件）。
 */
export function isFullyStatic(node: ts.Node): boolean {
  if (ts.isJsxExpression(node)) return false;
  if (
    ts.isJsxAttribute(node) && node.initializer &&
    ts.isJsxExpression(node.initializer)
  ) return false;
  if (ts.isJsxSpreadAttribute(node)) return false;

  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tagName = getTagName(opening.tagName);
    if (tagName[0] === tagName[0].toUpperCase() || tagName.includes(".")) {
      return false; // 组件不视为完全静态
    }
  }

  if (ts.isJsxFragment(node)) {
    let allStatic = true;
    node.children.forEach((child) => {
      if (!isFullyStatic(child)) allStatic = false;
    });
    return allStatic;
  }

  let staticStatus = true;
  ts.forEachChild(node, (child) => {
    if (!isFullyStatic(child)) {
      staticStatus = false;
    }
  });

  return staticStatus;
}

function getJsxAttributeName(name: ts.JsxAttributeName): string {
  if (ts.isIdentifier(name)) return name.text;
  return `${name.namespace.text}:${name.name.text}`;
}

/**
 * 获取标签名称字符串（支持 Identifier、PropertyAccessExpression 和 NamespacedName）
 */
export function getTagName(node: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isJsxNamespacedName(node)) {
    return `${node.namespace.text}:${node.name.text}`;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${
      getTagName(node.expression as ts.JsxTagNameExpression)
    }.${node.name.text}`;
  }
  return "";
}

/**
 * 判断一个表达式是否为静态（字面量或可序列化的常量）。
 */
function isStaticExpression(expr: ts.Expression): boolean {
  if (expr == null) return false;
  if (
    ts.isStringLiteral(expr) || ts.isNumericLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr)
  ) return true;
  if (
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword
  ) return true;

  // 优化：识别静态对象字面量 (如 style={{ color: 'red' }})
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.every((prop) =>
      ts.isPropertyAssignment(prop) && isStaticExpression(prop.initializer)
    );
  }

  // 优化：识别静态数组字面量
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.every((el) => isStaticExpression(el));
  }

  return false;
}

/**
 * 将静态表达式序列化为字符串（用于属性提升）。
 */
function serializeStaticValue(expr: ts.Expression): string {
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isObjectLiteralExpression(expr)) {
    // 处理 style 对象：{ color: 'red' } -> "color:red;"
    const styles: string[] = [];
    expr.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        styles.push(
          `${directiveNameToKebab(prop.name.text)}:${
            serializeStaticValue(prop.initializer)
          }`,
        );
      }
    });
    return styles.join(";") + (styles.length > 0 ? ";" : "");
  }
  return expr.getText();
}

/**
 * 将驼峰命名转换为短横线命名 (camelCase -> kebab-case)
 */
function directiveNameToKebab(name: string): string {
  return name.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * 提取静态 HTML 字符串，动态部分用占位符替代（用于路径计算）。
 */
export function serializeToTemplate(
  node: ts.Node,
): { html: string; dynamics: DynamicBinding[] } {
  const dynamics: DynamicBinding[] = [];
  let idCounter = 0;

  function walk(node: ts.Node, path: number[]): string {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = getTagName(opening.tagName);

      // 处理属性
      let attrs = "";
      opening.attributes.properties.forEach((attr) => {
        if (ts.isJsxAttribute(attr)) {
          const name = getJsxAttributeName(attr.name);
          const isEvent = name.startsWith("on") && name.length > 2;
          const isRef = name === "ref";
          const isDirective = name.startsWith("use:");

          if (
            attr.initializer && ts.isJsxExpression(attr.initializer) &&
            attr.initializer.expression
          ) {
            const expr = attr.initializer.expression;
            if (
              !isEvent && !isRef && !isDirective && isStaticExpression(expr)
            ) {
              // 极致优化：静态对象/数组直接序列化进模板
              const val = serializeStaticValue(expr);
              if (name === "style") {
                attrs += ` style="${val}"`;
              } else if (name === "className" || name === "class") {
                attrs += ` class="${val}"`;
              } else {
                attrs += ` ${name}="${val}"`;
              }
            } else {
              dynamics.push({
                id: `v-${idCounter++}`,
                path: [...path],
                expression: expr,
                type: isEvent
                  ? "event"
                  : (isRef ? "ref" : (isDirective ? "directive" : "attribute")),
                name: isEvent
                  ? name.slice(2).toLowerCase()
                  : (isDirective ? name.slice(4) : name),
              });
            }
          } else if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
            attrs += ` ${name}="${attr.initializer.text}"`;
          } else if (!attr.initializer) {
            attrs += ` ${name}`;
          }
        } else if (ts.isJsxSpreadAttribute(attr)) {
          dynamics.push({
            id: `v-${idCounter++}`,
            path: [...path],
            expression: attr.expression,
            type: "spread",
          });
        }
      });

      // 处理子节点
      let html = "";
      if (ts.isJsxElement(node)) {
        let childIndex = 0;

        const processChild = (child: ts.Node) => {
          if (ts.isJsxText(child)) {
            if (child.text.trim() === "" && child.text.includes("\n")) return;
            const text = child.text.replace(/\s+/g, " ");
            if (text === "") return;
            html += text;
            childIndex++;
          } else if (ts.isJsxExpression(child)) {
            if (!child.expression) return; // 忽略空表达式（如 {/* comment */}）
            dynamics.push({
              id: `v-${idCounter++}`,
              path: [...path, childIndex + 1], // 指向闭合标签
              expression: child.expression,
              type: "child",
            });
            html += "<!--[--><!--]-->"; // 边界符
            childIndex += 2;
          } else if (
            ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)
          ) {
            const childOpening = ts.isJsxElement(child)
              ? child.openingElement
              : child;
            const childTag = getTagName(childOpening.tagName);

            // 极致优化：如果是全静态子树且非组件，直接合并为字符串
            if (
              childTag[0] !== childTag[0].toUpperCase() &&
              !childTag.includes(".") && isFullyStatic(child)
            ) {
              html += serializeStatic(child);
              childIndex++;
            } else if (
              childTag[0] === childTag[0].toUpperCase() ||
              childTag.includes(".")
            ) {
              dynamics.push({
                id: `v-${idCounter++}`,
                path: [...path, childIndex + 1],
                expression: child as unknown as ts.Expression,
                type: "child",
              });
              html += "<!--[--><!--]-->";
              childIndex += 2;
            } else {
              html += walk(child, [...path, childIndex++]);
            }
          } else if (ts.isJsxFragment(child)) {
            child.children.forEach(processChild);
          }
        };

        node.children.forEach(processChild);
      }

      return ts.isJsxElement(node)
        ? `<${tag}${attrs}>${html}</${tag}>`
        : `<${tag}${attrs}/>`;
    }

    if (ts.isJsxFragment(node)) {
      return node.children.map((child, i) => walk(child, [i])).join("");
    }

    return "";
  }

  return { html: walk(node, []), dynamics };
}

/**
 * 序列化静态 JSX 节点。
 */
export function serializeStatic(node: ts.Node): string {
  const { html } = serializeToTemplate(node);
  return html;
}
