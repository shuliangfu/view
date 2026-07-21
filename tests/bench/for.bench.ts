/**
 * For 键控列表热路径基准（happy-dom）。
 * 运行：`deno bench -A tests/bench/`
 */
import { Window } from "happy-dom";
import {
  createRoot,
  createSignal,
  flushPendingSync,
  For,
} from "../../src/mod.ts";

// 注入最小 DOM（bench 进程无浏览器）
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

type Row = { id: number; text: string };

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, text: `Item ${i}` }));
}

Deno.bench("For+key 创建 200 行", () => {
  const data = makeRows(200);
  const [list] = createSignal(data);
  createRoot((dispose) => {
    const container = document.createElement("div");
    const frag = For<Row>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const d = document.createElement("div");
        d.textContent = item.text;
        return d;
      },
    });
    container.appendChild(frag);
    flushPendingSync();
    dispose();
  });
});

Deno.bench("For+key 反转 200 行（重排）", () => {
  const [list, setList] = createSignal(makeRows(200));
  createRoot((dispose) => {
    const container = document.createElement("div");
    const frag = For<Row>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const d = document.createElement("div");
        d.textContent = item.text;
        return d;
      },
    });
    container.appendChild(frag);
    flushPendingSync();
    setList([...list()].reverse());
    flushPendingSync();
    dispose();
  });
});

Deno.bench("For+key 仅改字段不重排 200 行", () => {
  const [list, setList] = createSignal(makeRows(200));
  createRoot((dispose) => {
    const container = document.createElement("div");
    const frag = For<Row>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const d = document.createElement("div");
        d.textContent = item.text;
        return d;
      },
    });
    container.appendChild(frag);
    flushPendingSync();
    setList(list().map((r) => ({ ...r, text: r.text + "!" })));
    flushPendingSync();
    dispose();
  });
});
