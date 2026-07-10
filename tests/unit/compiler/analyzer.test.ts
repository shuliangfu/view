import { describe, expect, it } from "@dreamer/test";
import ts from "typescript";
import { isFullyStatic, serializeStatic } from "@dreamer/view/compiler";

describe("compiler/analyzer", () => {
  it("serializeStatic: 应当序列化静态 JSX 节点", () => {
    const code = `<div><span>Text</span></div>`;
    const sourceFile = ts.createSourceFile(
      "test.tsx",
      code,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    const jsxElement =
      (sourceFile.statements[0] as ts.ExpressionStatement).expression;

    expect(serializeStatic(jsxElement)).toBe("<div><span>Text</span></div>");
  });

  it("isFullyStatic: 应当正确识别静态与动态子树", () => {
    const staticCode = `<div><span></span></div>`;
    const dynamicCode = `<div>{count()}</div>`;

    const staticSF = ts.createSourceFile(
      "s.tsx",
      staticCode,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    const dynamicSF = ts.createSourceFile(
      "d.tsx",
      dynamicCode,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );

    const staticExpr =
      (staticSF.statements[0] as ts.ExpressionStatement).expression;
    const dynamicExpr =
      (dynamicSF.statements[0] as ts.ExpressionStatement).expression;

    expect(isFullyStatic(staticExpr)).toBe(true);
    expect(isFullyStatic(dynamicExpr)).toBe(false);
  });

  it("serializeStatic: 静态字符串拼接属性应并入 HTML", () => {
    const code = `<div class={"x" + "y"} />`;
    const sourceFile = ts.createSourceFile(
      "test.tsx",
      code,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    const jsxElement =
      (sourceFile.statements[0] as ts.ExpressionStatement).expression;
    const html = serializeStatic(jsxElement);
    expect(html).toContain('class="xy"');
    expect(html).not.toContain("<!--");
  });

  it("serializeStatic: 静态三元与模板字符串应并入 HTML", () => {
    const code = `<span class={false ? "a" : "b"} title={\`t-\${"x"}\`} />`;
    const sourceFile = ts.createSourceFile(
      "t.tsx",
      code,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    const jsxElement =
      (sourceFile.statements[0] as ts.ExpressionStatement).expression;
    const html = serializeStatic(jsxElement);
    expect(html).toContain('class="b"');
    expect(html).toContain('title="t-x"');
  });
});
