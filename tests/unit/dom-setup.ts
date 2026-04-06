/**
 * @fileoverview 测试用 DOM 环境。
 * 注入 happy-dom 使运行时原语可在 Deno 环境下测试。
 */
import { Window } from "happy-dom";
import { beforeEach } from "@dreamer/test";
import { resetRegistry } from "../../src/reactivity/master.ts";

export { resetRegistry };

// 每个测试 it 运行前都重置物理单例状态，确保彻底隔离
beforeEach(() => {
  resetRegistry();
});

// 加载文件时也重置一次
resetRegistry();

const win = new Window();
const doc = win.document;

// @ts-ignore: 注入全局 DOM 环境
globalThis.window = win;
// @ts-ignore: 注入全局 DOM 环境
globalThis.document = doc;
// @ts-ignore: 与浏览器一致；路由与 History 单测依赖 globalThis.history（勿绑 location，避免 pathname 变为 about:blank）
globalThis.history = win.history;
// @ts-ignore: 注入全局 DOM 环境
globalThis.Node = win.Node;
// @ts-ignore: 注入全局 DOM 环境
globalThis.Element = win.Element;
// @ts-ignore: 注入全局 DOM 环境
globalThis.HTMLElement = win.HTMLElement;
// @ts-ignore: 注入全局 DOM 环境
globalThis.Text = win.Text;
// @ts-ignore: 注入全局 DOM 环境
globalThis.DocumentFragment = win.DocumentFragment;
// @ts-ignore: 注入全局 DOM 环境
globalThis.NodeList = win.NodeList;
// @ts-ignore: 注入全局 DOM 环境
globalThis.HTMLCollection = win.HTMLCollection;
// @ts-ignore: 注入全局 DOM 环境
globalThis.CharacterData = win.CharacterData;
// @ts-ignore: 注入全局 DOM 环境
globalThis.Comment = win.Comment;
// @ts-ignore: 注入全局 DOM 环境
globalThis.Event = win.Event;
// @ts-ignore: 注入全局 DOM 环境
globalThis.CustomEvent = win.CustomEvent;
// @ts-ignore: 注入全局 DOM 环境
globalThis.InputEvent = win.InputEvent;
// @ts-ignore: 注入全局 DOM 环境（表单 onBlur 等单测需要）
globalThis.FocusEvent = win.FocusEvent;
// @ts-ignore: 注入全局 DOM 环境
globalThis.MouseEvent = win.MouseEvent;
// @ts-ignore: 注入全局 DOM 环境
globalThis.KeyboardEvent = win.KeyboardEvent;
// @ts-ignore: Deno 顶层无 PopStateEvent，从 happy-dom 注入或最小 polyfill
{
  const w = win as unknown as {
    PopStateEvent?: new (t: string, i?: { state?: unknown }) => Event;
  };
  if (
    typeof (globalThis as { PopStateEvent?: unknown }).PopStateEvent ===
      "undefined"
  ) {
    if (w.PopStateEvent) {
      // @ts-ignore
      globalThis.PopStateEvent = w.PopStateEvent;
    } else {
      // @ts-ignore
      globalThis.PopStateEvent = class extends win.Event {
        state: unknown;
        constructor(type: string, init?: { state?: unknown }) {
          super(type);
          this.state = init?.state ?? null;
        }
      };
    }
  }
}

// 默认开启 HMR 开发模式以供测试
(globalThis as any).VIEW_DEV = true;

/**
 * 等待所有异步任务完成（用于 Happy DOM）。
 */
export async function waitUntilComplete() {
  // @ts-ignore
  if (globalThis.window?.happyDOM?.waitUntilComplete) {
    // @ts-ignore
    await globalThis.window.happyDOM.waitUntilComplete();
  }
}

/**
 * 关闭窗口以释放资源。
 */
export function closeWindow() {
  // @ts-ignore
  if (globalThis.window) {
    // @ts-ignore
    globalThis.window.close();
  }
}
