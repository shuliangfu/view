/**
 * @fileoverview 编译路径 SSR 下 document 替换与恢复：renderToString / renderToStream 执行完毕后 globalThis.document 被恢复。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { insert, renderToStream, renderToString } from "@dreamer/view/compiler";

describe("renderToString document 恢复", () => {
  it("执行完毕后 globalThis.document 被恢复", () => {
    const before = (globalThis as unknown as { document?: Document }).document;
    renderToString((el) => {
      insert(el, "x");
    });
    const after = (globalThis as unknown as { document?: Document }).document;
    expect(after).toBe(before);
  });
});

describe("renderToStream document 恢复", () => {
  it("流式 SSR 执行完毕后 globalThis.document 被恢复", async () => {
    const before = (globalThis as unknown as { document?: Document }).document;
    const gen = renderToStream((el) => insert(el, "y"));
    for await (const _ of gen) {
      // consume
    }
    const after = (globalThis as unknown as { document?: Document }).document;
    expect(after).toBe(before);
  });
});
