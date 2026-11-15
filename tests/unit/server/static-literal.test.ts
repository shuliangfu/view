import { describe, expect, it } from "@dreamer/test";
import {
  parseStaticLiteral,
  StaticLiteralError,
} from "../../../src/server/utils/static-literal.ts";

describe("server/utils/static-literal", () => {
  it("应解析对象、数组、字符串、数字、布尔和 null，并允许未加引号的键与尾逗号", () => {
    const v = parseStaticLiteral(
      `{ title: "Post Page", description: 'integration', n: 1.5, ok: true, empty: null, tags: ["a",], }`,
    );
    expect(v).toEqual({
      title: "Post Page",
      description: "integration",
      n: 1.5,
      ok: true,
      empty: null,
      tags: ["a"],
    });
  });

  it("应解析转义字符与负指数", () => {
    expect(parseStaticLiteral(`{ k: "a\\nb\\t", n: -2e3 }`)).toEqual({
      k: "a\nb\t",
      n: -2000,
    });
  });

  it("应拒绝函数、标识符值和模板字符串", () => {
    expect(() => parseStaticLiteral("{ fn: function () {} }")).toThrow(
      StaticLiteralError,
    );
    expect(() => parseStaticLiteral("{ k: window }")).toThrow(
      StaticLiteralError,
    );
    expect(() => parseStaticLiteral("{ k: `x` }")).toThrow(StaticLiteralError);
  });

  it("危险键不应写进结果对象的原型", () => {
    const v = parseStaticLiteral(
      '{"__proto__":{"polluted":true},"title":"ok"}',
    ) as Record<string, unknown>;
    expect(v.title).toBe("ok");
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"))
      .toBe(false);
    expect(Object.prototype.hasOwnProperty.call(v, "__proto__")).toBe(false);
  });
});
