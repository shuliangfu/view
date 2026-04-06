/**
 * @fileoverview SSR 异步 API：`queueSsrAsyncTask`、`renderToStringAsync`、`renderToStream`、`generateHydrationScript`、DOM scope 嵌套。
 * 不引入 dom-setup，避免与「无 document」场景冲突；必要时临时保存/恢复全局。
 */

import { describe, expect, it } from "@dreamer/test";
import {
  enterSSRDomScope,
  generateHydrationScript,
  leaveSSRDomScope,
  queueSsrAsyncTask,
  registerSSRPromise,
  renderToStream,
  renderToString,
  renderToStringAsync,
} from "@dreamer/view/ssr";
import { createSignal } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";

/** 保存并临时移除全局 document/window，用于验证自研 SSR DOM 安装 */
function stashGlobals(): { doc: unknown; win: unknown } {
  const doc = globalThis.document;
  const win = globalThis.window;
  // @ts-ignore: 测试隔离，模拟无 document 的 SSR 宿主
  delete globalThis.document;
  // @ts-ignore: 与 document 一并移除，避免自研 SSR window 残留
  delete globalThis.window;
  return { doc, win };
}

/** 恢复全局 document/window */
function restoreGlobals(saved: { doc: unknown; win: unknown }): void {
  if (saved.doc !== undefined) {
    // @ts-ignore: 恢复测试前保存的 document 引用
    globalThis.document = saved.doc;
  }
  if (saved.win !== undefined) {
    // @ts-ignore: 恢复测试前保存的 window 引用
    globalThis.window = saved.win;
  }
}

describe("runtime/server（异步与流式）", () => {
  it("queueSsrAsyncTask：同一 isolate 内应按顺序串行执行", async () => {
    const order: string[] = [];
    const p1 = queueSsrAsyncTask(async () => {
      order.push("a");
      await new Promise((r) => setTimeout(r, 5));
      order.push("b");
      return 1;
    });
    const p2 = queueSsrAsyncTask(() => {
      order.push("c");
      return Promise.resolve(2);
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("renderToStringAsync：应排空 registerSSRPromise 队列后再输出最终 HTML", async () => {
    const html = await renderToStringAsync(() => {
      registerSSRPromise(Promise.resolve());
      return jsx("section", { id: "async-ssr", children: "ok" });
    });
    expect(html).toContain('id="async-ssr"');
    expect(html).toContain("ok");
  });

  it("renderToStream：应产出含初始 HTML 的 Uint8Array 分块", async () => {
    const stream = renderToStream(() =>
      jsx("article", { "data-test": "stream", children: "chunk" })
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    expect(out).toContain("article");
    expect(out).toContain("chunk");
  });

  it("generateHydrationScript：应包含根 id 与 bindingMap 的 JSON 片段", () => {
    const script = generateHydrationScript("app-root", [[[0, 1], "b1"]]);
    expect(script).toContain("app-root");
    expect(script).toContain("hydrate");
    expect(script).toContain("b1");
  });

  it("renderToString：应支持返回函数（递归 stringify）", () => {
    const html = renderToString(() => () =>
      jsx("footer", { children: "nested-fn" })
    );
    expect(html).toContain("footer");
    expect(html).toContain("nested-fn");
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("runtime/server（SSR DOM scope 嵌套）", () => {
  it("enterSSRDomScope / leaveSSRDomScope 嵌套配对后应卸载自研 DOM", () => {
    const saved = stashGlobals();
    try {
      enterSSRDomScope();
      enterSSRDomScope();
      expect(typeof globalThis.document).toBe("object");
      leaveSSRDomScope();
      expect(typeof globalThis.document).toBe("object");
      leaveSSRDomScope();
      expect(globalThis.document).toBeUndefined();
    } finally {
      restoreGlobals(saved);
    }
  });

  it("在已有 document 时嵌套 scope 不应卸载外层真实 document", () => {
    // 典型场景：测试环境已注入 happy-dom，仅增加引用计数
    if (typeof globalThis.document === "undefined") {
      return;
    }
    const before = globalThis.document;
    enterSSRDomScope();
    enterSSRDomScope();
    expect(globalThis.document).toBe(before);
    leaveSSRDomScope();
    leaveSSRDomScope();
    expect(globalThis.document).toBe(before);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("runtime/server（动态 signal + SSR）", () => {
  it("renderToString 与 createSignal 组合应输出更新后的文本", () => {
    const [s, setS] = createSignal(0);
    const html = renderToString(() =>
      jsx("div", {
        children: () => {
          if (s() === 0) setS(42);
          return String(s());
        },
      })
    );
    expect(html).toContain("42");
  });
}, { sanitizeOps: false, sanitizeResources: false });
