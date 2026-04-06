/**
 * @fileoverview 集成：SSR 异步与流式 API 在「类项目」调用方式下的验收（与单元测试互补，强调入口组合）。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  registerSSRPromise,
  renderToStream,
  renderToStringAsync,
} from "../../src/runtime/server.ts";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("integration：SSR 异步 / 流式", () => {
  it("renderToStringAsync：registerSSRPromise 排空后应得到稳定 HTML", async () => {
    const html = await renderToStringAsync(() => {
      registerSSRPromise(Promise.resolve());
      return jsx("main", { id: "async-main", children: "async-body" });
    });
    expect(html).toContain("async-main");
    expect(html).toContain("async-body");
  });

  it("renderToStream：应读完流并得到完整 HTML 片段", async () => {
    const stream = renderToStream(() =>
      jsx("section", { "data-stream": "1", children: "stream-content" })
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let combined = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      combined += decoder.decode(value, { stream: true });
    }
    expect(combined).toContain("section");
    expect(combined).toContain("stream-content");
  });
});
