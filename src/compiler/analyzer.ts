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
import { escapeForText } from "../utils/escape.ts";

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
  if (ts.isJsxExpression(node)) {
    // 空 {/* */} 视为静态；可提升的非空静态文本子节点亦然（与 processChild 对齐）
    if (!node.expression) return true;
    return isLiftableStaticTextChild(node.expression);
  }
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
 * 含括号、断言、模板串、三元、一元/二元纯字面量，便于更多属性直接进 HTML 模板、少挂 Effect。
 * 供 transformer 复用，避免重复静态判定逻辑。
 */
export function isStaticExpression(expr: ts.Expression): boolean {
  if (expr == null) return false;
  if (
    ts.isStringLiteral(expr) || ts.isNumericLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr)
  ) return true;
  if (
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword ||
    expr.kind === ts.SyntaxKind.UndefinedKeyword
  ) return true;

  // 类型断言 / 非空：`x as const`、`!foo`（对操作数递归）
  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
    return isStaticExpression(expr.expression);
  }
  if (ts.isNonNullExpression(expr)) {
    return isStaticExpression(expr.expression);
  }

  // 括号包一层：`({"a"})` / `(1 + 2)`
  if (ts.isParenthesizedExpression(expr)) {
    return isStaticExpression(expr.expression);
  }

  // 一元：`+1` / `-2` / `!true`（仅对静态操作数）
  if (ts.isPrefixUnaryExpression(expr)) {
    return isStaticExpression(expr.operand as ts.Expression);
  }

  // `void 0` / `void <static>`（AST 为 VoidExpression，非 PrefixUnary）
  if (ts.isVoidExpression(expr)) {
    return isStaticExpression(expr.expression);
  }

  // `typeof "x"` / `typeof 1`：操作数为静态时结果可序列化
  if (ts.isTypeOfExpression(expr)) {
    return isStaticExpression(expr.expression);
  }

  // 二元：仅两侧皆静态时（字符串拼接、算术等）可折叠进模板
  if (ts.isBinaryExpression(expr)) {
    return isStaticExpression(expr.left) && isStaticExpression(expr.right);
  }

  // 三元：条件与两分支皆静态 → `true ? "a" : "b"`
  if (ts.isConditionalExpression(expr)) {
    return isStaticExpression(expr.condition) &&
      isStaticExpression(expr.whenTrue) &&
      isStaticExpression(expr.whenFalse);
  }

  // 模板字符串：所有插值皆静态 → `` `btn-${"primary"}` ``
  if (ts.isTemplateExpression(expr)) {
    return expr.templateSpans.every((span) =>
      isStaticExpression(span.expression)
    );
  }

  // 优化：识别静态对象字面量 (如 style={{ color: 'red' }})
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.every((prop) =>
      ts.isPropertyAssignment(prop) && isStaticExpression(prop.initializer)
    );
  }

  // 优化：识别静态数组字面量
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.every((el) =>
      !ts.isSpreadElement(el) && isStaticExpression(el)
    );
  }

  // `satisfies` 类型收窄不改变运行时值
  if (
    typeof ts.isSatisfiesExpression === "function" &&
    ts.isSatisfiesExpression(expr)
  ) {
    return isStaticExpression(expr.expression);
  }

  return false;
}


/**
 * 子文本是否可静态提升进 template：字面量／数字／`+` 拼接／模板串／静态三元，
 * 及括号／断言／satisfies 包装。不含 `&&`／`||`／`??`／null／boolean（与 insert 省略语义缠绕，本刀不做）。
 * 结果序列化为空串时不提升，以免与 insert("") 的空 Text 节点／占位注释路径分叉。
 */
export function isStaticTextChildExpression(expr: ts.Expression): boolean {
  if (expr == null) return false;
  if (
    ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) ||
    ts.isNumericLiteral(expr)
  ) return true;

  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
    return isStaticTextChildExpression(expr.expression);
  }
  if (ts.isNonNullExpression(expr) || ts.isParenthesizedExpression(expr)) {
    return isStaticTextChildExpression(expr.expression);
  }
  if (
    typeof ts.isSatisfiesExpression === "function" &&
    ts.isSatisfiesExpression(expr)
  ) {
    return isStaticTextChildExpression(expr.expression);
  }

  if (ts.isTemplateExpression(expr)) {
    return expr.templateSpans.every((span) =>
      isStaticExpression(span.expression)
    );
  }

  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return isStaticTextChildExpression(expr.left) &&
      isStaticTextChildExpression(expr.right);
  }

  if (ts.isConditionalExpression(expr)) {
    return isStaticExpression(expr.condition) &&
      isStaticTextChildExpression(expr.whenTrue) &&
      isStaticTextChildExpression(expr.whenFalse);
  }

  return false;
}

/** 可提升：静态文本子表达式且序列化结果非空。 */
export function isLiftableStaticTextChild(expr: ts.Expression): boolean {
  if (!isStaticTextChildExpression(expr)) return false;
  return serializeStaticValue(expr) !== "";
}

/**
 * 可提升静态子文本的 HTML 转义结果；不可提升返回 undefined。
 * CSR template 与 SSR 字符串拼接共用，保证 escape／语义一致。
 */
export function serializeLiftableStaticTextChild(
  expr: ts.Expression,
): string | undefined {
  if (!isLiftableStaticTextChild(expr)) return undefined;
  return escapeForText(serializeStaticValue(expr));
}



/**
 * 静态可判定为 null / undefined（含括号、断言、void 包装）。
 * 用于 `??` 折叠：不能靠序列化字符串区分 `null` 与 `""`。
 */
function isStaticallyNullish(expr: ts.Expression): boolean {
  if (expr == null) return false;
  if (
    expr.kind === ts.SyntaxKind.NullKeyword ||
    expr.kind === ts.SyntaxKind.UndefinedKeyword
  ) return true;
  if (ts.isVoidExpression(expr)) return true;
  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
    return isStaticallyNullish(expr.expression);
  }
  if (ts.isNonNullExpression(expr)) {
    return isStaticallyNullish(expr.expression);
  }
  if (ts.isParenthesizedExpression(expr)) {
    return isStaticallyNullish(expr.expression);
  }
  if (
    typeof ts.isSatisfiesExpression === "function" &&
    ts.isSatisfiesExpression(expr)
  ) {
    return isStaticallyNullish(expr.expression);
  }
  return false;
}

/**
 * 将静态表达式序列化为字符串（用于属性提升）。
 */
function serializeStaticValue(expr: ts.Expression): string {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isNumericLiteral(expr)) return expr.text;
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (expr.kind === ts.SyntaxKind.NullKeyword) return "";
  if (expr.kind === ts.SyntaxKind.UndefinedKeyword) return "";
  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
    return serializeStaticValue(expr.expression);
  }
  if (ts.isNonNullExpression(expr)) {
    return serializeStaticValue(expr.expression);
  }
  if (ts.isParenthesizedExpression(expr)) {
    return serializeStaticValue(expr.expression);
  }
  if (ts.isConditionalExpression(expr)) {
    const cond = serializeStaticValue(expr.condition);
    if (cond === "true" || cond === "1") {
      return serializeStaticValue(expr.whenTrue);
    }
    if (cond === "false" || cond === "0" || cond === "") {
      return serializeStaticValue(expr.whenFalse);
    }
    // 无法求值时拼成占位（不应进入模板路径）
    return serializeStaticValue(expr.whenTrue);
  }
  if (ts.isTemplateExpression(expr)) {
    let out = expr.head.text;
    for (const span of expr.templateSpans) {
      out += serializeStaticValue(span.expression) + span.literal.text;
    }
    return out;
  }
  if (ts.isVoidExpression(expr)) {
    // void 静态 → 空属性值（与 undefined 一致）
    return "";
  }
  if (ts.isPrefixUnaryExpression(expr)) {
    const op = expr.operator === ts.SyntaxKind.MinusToken
      ? "-"
      : expr.operator === ts.SyntaxKind.PlusToken
      ? "+"
      : expr.operator === ts.SyntaxKind.ExclamationToken
      ? "!"
      : "";
    // 布尔取反仅作属性值时少见；保持可解析文本
    if (op === "!") {
      const inner = serializeStaticValue(expr.operand as ts.Expression);
      return inner === "true"
        ? "false"
        : inner === "false"
        ? "true"
        : `!${inner}`;
    }
    return op + serializeStaticValue(expr.operand as ts.Expression);
  }
  if (ts.isTypeOfExpression(expr)) {
    // 对字面量求 typeof，便于 `data-t={typeof "x"}` 进模板
    const inner = expr.expression;
    if (
      ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)
    ) {
      return "string";
    }
    if (ts.isNumericLiteral(inner)) return "number";
    if (
      inner.kind === ts.SyntaxKind.TrueKeyword ||
      inner.kind === ts.SyntaxKind.FalseKeyword
    ) return "boolean";
    if (
      inner.kind === ts.SyntaxKind.NullKeyword ||
      inner.kind === ts.SyntaxKind.UndefinedKeyword
    ) {
      return inner.kind === ts.SyntaxKind.NullKeyword ? "object" : "undefined";
    }
    if (
      ts.isObjectLiteralExpression(inner) || ts.isArrayLiteralExpression(inner)
    ) {
      return "object";
    }
    return "string";
  }
  if (
    typeof ts.isSatisfiesExpression === "function" &&
    ts.isSatisfiesExpression(expr)
  ) {
    return serializeStaticValue(expr.expression);
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    // 字符串拼接：直接连接序列化结果
    if (op === ts.SyntaxKind.PlusToken) {
      const l = serializeStaticValue(expr.left);
      const r = serializeStaticValue(expr.right);
      // 两侧皆为数字文本时做算术（避免 "1"+"2" 在 class 里变 "12" 以外的语义歧义：属性值本就是字符串）
      const ln = Number(l);
      const rn = Number(r);
      if (
        l !== "" && r !== "" && !Number.isNaN(ln) && !Number.isNaN(rn) &&
        String(ln) === l && String(rn) === r
      ) {
        return String(ln + rn);
      }
      return l + r;
    }
    // 静态逻辑与：`"a" && "b"` → 按 JS 真值取右/左（属性进模板）
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const l = serializeStaticValue(expr.left);
      if (l === "" || l === "false" || l === "0" || l === "null") return l;
      return serializeStaticValue(expr.right);
    }
    // 静态逻辑或
    if (op === ts.SyntaxKind.BarBarToken) {
      const l = serializeStaticValue(expr.left);
      if (l !== "" && l !== "false" && l !== "0" && l !== "null") return l;
      return serializeStaticValue(expr.right);
    }
    // 静态空值合并：`null ?? "x"` / `void 0 ?? "x"` → 右侧；`"" ?? "x"` 仍为 ""
    // 必须看 AST（isStaticallyNullish），因 NullKeyword 序列化为 "" 会与空串混淆
    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      if (isStaticallyNullish(expr.left)) {
        return serializeStaticValue(expr.right);
      }
      return serializeStaticValue(expr.left);
    }
  }
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
            // 静态字符串／数字／+ 拼接等：写入模板文本，省 walk+insert（及 Effect）
            const liftedText = serializeLiftableStaticTextChild(
              child.expression,
            );
            if (liftedText !== undefined) {
              html += liftedText;
              childIndex++;
              return;
            }
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
