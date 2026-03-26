/**
 * JSX 编译期 **函数级响应式依赖** 辅助：根据 `createSignal` 声明与块内遮蔽关系构造「当前作用域内视为响应式」的绑定名集合，
 * 用于在 {@link jsxExpressionMayHoistToInsertWithDeps} 中把 **不含 signal 读写的简单表达式** 从 `insertReactive` 提升到 `insert`。
 *
 * 保守策略：含调用 / 数组字面量 / 对象字面量 / 模板插值 / 元素访问 `a[b]` / JSX 子树 / 函数字面量 等一律不提升。
 *
 * @module @dreamer/view/jsx-compiler/dependency-graph
 */

import ts from "typescript";

/**
 * 判断调用是否为 **`createSignal(...)`**（含 `ns.createSignal` 形态）。
 *
 * @param expr - 变量初始化器等表达式
 */
export function isCreateSignalCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const c = expr.expression;
  if (ts.isIdentifier(c) && c.text === "createSignal") return true;
  if (ts.isPropertyAccessExpression(c) && c.name.text === "createSignal") {
    return true;
  }
  return false;
}

/**
 * 在函数体 AST 上遍历变量声明（**不进入**嵌套函数体），收集本层遮蔽与 signal 名，并与父层有效集合合并。
 *
 * - 若某名在本层以 **非** `createSignal` 初始化声明，则遮蔽父层同名绑定（不再视为父层 signal）。
 * - 若本层 `const x = createSignal(...)`，则 `x` 记入响应式集合。
 *
 * @param body - 箭头函数体（表达式或块）或方法块
 * @param parentEffective - 外层已生效的响应式绑定名（拷贝传入，不在此函数内修改）
 * @returns 当前函数体可见的响应式绑定名集合
 */
export function collectScopedSignalsAndShadows(
  body: ts.ConciseBody,
  parentEffective: ReadonlySet<string>,
): Set<string> {
  const declaredHere = new Map<string, "signal" | "other">();

  /**
   * 记录单个变量声明：是否为 signal、是否遮蔽父名。
   *
   * @param decl - `VariableDeclaration` 节点
   */
  /**
   * 记录 `const x = …` 或 **`const [getter, set] = createSignal(…)`**（首元为 getter，其余视为非 signal 读）。
   *
   * @param decl - 变量声明
   */
  const recordDecl = (decl: ts.VariableDeclaration): void => {
    const isSig = !!(decl.initializer && isCreateSignalCall(decl.initializer));
    if (ts.isIdentifier(decl.name)) {
      declaredHere.set(decl.name.text, isSig ? "signal" : "other");
      return;
    }
    if (ts.isArrayBindingPattern(decl.name)) {
      decl.name.elements.forEach((el, index) => {
        if (!ts.isBindingElement(el) || el.dotDotDotToken) return;
        if (!ts.isIdentifier(el.name)) return;
        const name = el.name.text;
        if (isSig) {
          declaredHere.set(name, index === 0 ? "signal" : "other");
        } else {
          declaredHere.set(name, "other");
        }
      });
    }
  };

  /**
   * 深度遍历节点，遇嵌套函数则不再下探（避免把内层 `const n = createSignal` 算进外层）。
   *
   * @param node - 语法子树
   */
  const walkSkippingNestedFunctions = (node: ts.Node): void => {
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      return;
    }
    if (ts.isVariableDeclaration(node)) recordDecl(node);
    ts.forEachChild(node, walkSkippingNestedFunctions);
  };

  if (ts.isBlock(body)) {
    walkSkippingNestedFunctions(body);
  } else {
    walkSkippingNestedFunctions(body);
  }

  const effective = new Set<string>();
  for (const name of parentEffective) {
    if (!declaredHere.has(name)) effective.add(name);
  }
  for (const [name, kind] of declaredHere) {
    if (kind === "signal") effective.add(name);
  }
  return effective;
}

/**
 * 表达式是否 **读取** 当前作用域内视为响应式的绑定：裸标识符命中集合，或 **`sig.value`** 且 `sig` 在集合中。
 *
 * @param expr - JSX 插值内表达式等
 * @param reactive - {@link collectScopedSignalsAndShadows} 产物
 */
export function expressionReadsReactiveBinding(
  expr: ts.Node,
  reactive: ReadonlySet<string>,
): boolean {
  if (reactive.size === 0) return false;
  let hit = false;
  /**
   * @param n - 子树节点
   */
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (ts.isIdentifier(n)) {
      if (reactive.has(n.text)) {
        hit = true;
        return;
      }
    }
    if (ts.isPropertyAccessExpression(n) && n.name.text === "value") {
      const b = n.expression;
      if (ts.isIdentifier(b) && reactive.has(b.text)) {
        hit = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return hit;
}

/**
 * 无调用、无 JSX、无函数字面量等的 **简单** 表达式，才允许在「已确认不读响应式绑定」的前提下做 insert 提升。
 *
 * @param expr - 待判定表达式
 */
export function isSimpleNonReactiveDependencyExpression(
  expr: ts.Expression,
): boolean {
  let ok = true;
  /**
   * @param n - 子树节点
   */
  const visit = (n: ts.Node): void => {
    if (!ok) return;
    if (
      ts.isJsxElement(n) || ts.isJsxFragment(n) || ts.isJsxSelfClosingElement(n)
    ) {
      ok = false;
      return;
    }
    if (
      ts.isCallExpression(n) ||
      ts.isNewExpression(n) ||
      ts.isArrayLiteralExpression(n) ||
      ts.isObjectLiteralExpression(n)
    ) {
      ok = false;
      return;
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      ok = false;
      return;
    }
    if (ts.isTemplateExpression(n) || ts.isTaggedTemplateExpression(n)) {
      ok = false;
      return;
    }
    if (ts.isElementAccessExpression(n)) {
      ok = false;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return ok;
}

/**
 * 是否可将 `{expr}` 编译为 **`insert(parent, …)`** 而非 `insertReactive`：
 * 要么满足原有 {@link sourceExpressionIsStaticForOneShotInsert}（由调用方传入），要么在 **有函数级 reactive 集合** 时，
 * 表达式不读任何响应式绑定且为 {@link isSimpleNonReactiveDependencyExpression}。
 *
 * @param expr - JSX 子表达式
 * @param sourceExpressionIsStaticForOneShotInsert - 与 transform 内静态判定一致的一元回调，避免循环依赖
 * @param reactiveBindings - 当前函数体有效响应式名；`undefined` 时不做依赖放宽（仅静态路径）
 */
/**
 * 是否出现 **`props` / `$props` 标识符**（组件形参常见）：其子字段可能是 getter、MountFn，不可改为单次 `insert`。
 *
 * @param expr - JSX 插值表达式
 */
export function expressionReferencesPropsLikeParameter(expr: ts.Node): boolean {
  let hit = false;
  /**
   * @param n - 子树节点
   */
  const visit = (n: ts.Node): void => {
    if (hit) return;
    if (
      ts.isIdentifier(n) &&
      (n.text === "props" || n.text === "$props")
    ) {
      hit = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return hit;
}

export function jsxExpressionMayHoistToInsertWithDeps(
  expr: ts.Expression,
  sourceExpressionIsStaticForOneShotInsert: (e: ts.Expression) => boolean,
  reactiveBindings: ReadonlySet<string> | undefined,
): boolean {
  if (sourceExpressionIsStaticForOneShotInsert(expr)) return true;
  if (reactiveBindings == null) return false;
  if (expressionReadsReactiveBinding(expr, reactiveBindings)) return false;
  if (expressionReferencesPropsLikeParameter(expr)) return false;
  return isSimpleNonReactiveDependencyExpression(expr);
}
