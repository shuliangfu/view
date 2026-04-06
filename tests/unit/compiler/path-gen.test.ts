import { describe, expect, it } from "@dreamer/test";
import { generatePathCode } from "@dreamer/view/compiler";

describe("compiler/path-gen", () => {
  it("generatePathCode: 应当将数组转换为 DOM 寻址字符串", () => {
    expect(generatePathCode([])).toBe("");
    expect(generatePathCode([0])).toBe(".childNodes[0]");
    expect(generatePathCode([1, 2, 3])).toBe(
      ".childNodes[1].childNodes[2].childNodes[3]",
    );
  });
});
