/**
 * insert 热路径基准（happy-dom）：静态文本／Signal thunk／多子节点。
 * 运行：`deno task bench` 或 `deno bench -A tests/bench/`
 *
 * Effect 路径已在 signal.bench.ts；本文件补 insert DOM 写入／响应式替换。
 */
import { Window } from "happy-dom";
import {
  createRoot,
  createSignal,
  flushPendingSync,
  insert,
} from "../../src/mod.ts";

const win = new Window();
// @ts-ignore
globalThis.window = win;
// @ts-ignore
globalThis.document = win.document;
// @ts-ignore
globalThis.Node = win.Node;
// @ts-ignore
globalThis.DocumentFragment = win.DocumentFragment;
// @ts-ignore
globalThis.Comment = win.Comment;
// @ts-ignore
globalThis.Text = win.Text;
// @ts-ignore
globalThis.HTMLElement = win.HTMLElement;
// @ts-ignore
globalThis.Element = win.Element;

Deno.bench("insert 静态文本 ×100", () => {
  createRoot((dispose) => {
    const parent = document.createElement("div");
    for (let i = 0; i < 100; i++) {
      insert(parent, `row-${i}`);
    }
    dispose();
  });
});

Deno.bench("insert Signal thunk 初次 + 100 次更新", () => {
  const [text, setText] = createSignal("v0");
  createRoot((dispose) => {
    const parent = document.createElement("div");
    insert(parent, () => text());
    flushPendingSync();
    for (let i = 1; i <= 100; i++) {
      setText(`v${i}`);
      flushPendingSync();
    }
    dispose();
  });
});

Deno.bench("insert 100 个元素子节点（数组）", () => {
  createRoot((dispose) => {
    const parent = document.createElement("div");
    const kids = Array.from({ length: 100 }, (_, i) => {
      const el = document.createElement("span");
      el.textContent = String(i);
      return el;
    });
    insert(parent, kids);
    dispose();
  });
});
