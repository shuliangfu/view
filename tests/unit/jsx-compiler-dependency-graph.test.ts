/**
 * @fileoverview {@link collectScopedSignalsAndShadows} / {@link expressionReadsReactiveBinding} 单元测试
 */

import { describe, expect, it } from "@dreamer/test";
import {
  collectScopedSignalsAndShadows,
  expressionReadsReactiveBinding,
} from "@dreamer/view/jsx-compiler";
import ts from "typescript";

describe("jsx-compiler dependency-graph", () => {
  /**
   * 内层 `const n = 3` 遮蔽外层 `createSignal` 的 `n` 时，内层有效集合不应含 `n`。
   */
  it("collectScopedSignalsAndShadows：同名遮蔽后内层无 signal n", () => {
    const source = `
function Outer() {
  const n = createSignal(0);
  function Inner() {
    const n = 3;
    return n;
  }
}
`;
    const sf = ts.createSourceFile(
      "x.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const outer = sf.statements[0] as ts.FunctionDeclaration;
    const innerDecl = outer.body!.statements.find((s) =>
      ts.isFunctionDeclaration(s)
    ) as ts.FunctionDeclaration;
    expect(innerDecl.body).toBeDefined();
    const outerEff = collectScopedSignalsAndShadows(
      outer.body!,
      new Set(),
    );
    expect(outerEff.has("n")).toBe(true);
    const innerEff = collectScopedSignalsAndShadows(
      innerDecl.body!,
      outerEff,
    );
    expect(innerEff.has("n")).toBe(false);
  });

  /**
   * `sig.value` 在 sig 属于响应式集合时应判为读依赖。
   */
  /**
   * `const [a, setA] = createSignal(0)` 应只把首绑定 `a` 记入响应式集合。
   */
  it("collectScopedSignalsAndShadows：元组解构 createSignal 仅首元为 signal", () => {
    const source = `
function F() {
  const [a, setA] = createSignal(0);
  return a;
}
`;
    const sf = ts.createSourceFile(
      "t.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const fn = sf.statements[0] as ts.FunctionDeclaration;
    const eff = collectScopedSignalsAndShadows(fn.body!, new Set());
    expect(eff.has("a")).toBe(true);
    expect(eff.has("setA")).toBe(false);
  });

  it("expressionReadsReactiveBinding：n.value 命中集合中的 n", () => {
    const source = `n.value`;
    const sf = ts.createSourceFile(
      "e.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const expr = (sf.statements[0] as ts.ExpressionStatement).expression;
    expect(expressionReadsReactiveBinding(expr, new Set(["n"]))).toBe(true);
    expect(expressionReadsReactiveBinding(expr, new Set())).toBe(false);
  });
});
