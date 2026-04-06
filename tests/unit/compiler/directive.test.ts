import ts from "typescript";
import { describe, expect, it } from "@dreamer/test";
import { transformJSX } from "@dreamer/view/compiler";

describe("compiler/directive", () => {
  it("应当转换自定义指令 use:name", () => {
    const code = `const el = <div use:model={data()}></div>;`;
    const sourceFile = ts.createSourceFile(
      "test.tsx",
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const result = ts.transform(sourceFile, [transformJSX]);
    const printer = ts.createPrinter();
    const output = printer.printFile(result.transformed[0]);

    // 期望包含 model(_el, () => data())
    expect(output).toContain("model(_el, () => data())");
  });
}, { sanitizeOps: false, sanitizeResources: false });
