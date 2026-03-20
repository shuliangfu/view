/**
 * 路线 C SSR — 服务端执行编译后 fn(container) 并输出 HTML/流。
 * 与客户端插入点约定一致：同一套编译产物，服务端用伪 document 跑一次 fn，再序列化 container。
 *
 * @module @dreamer/view/runtime/ssr
 */

import { KEY_VIEW_SSR } from "../constants.ts";
import { setGlobal } from "../globals.ts";
import { setSSRShadowDocument } from "./active-document.ts";
import type { SSRElement } from "./ssr-document.ts";
import { createSSRDocument } from "./ssr-document.ts";

/** 选项：容器标签（默认 "div"）、是否在根容器上输出 data-view-ssr 标记等 */
export type SSROptions = {
  /** 根容器标签名，默认 "div" */
  containerTag?: string;
  /** 根容器是否带 data-view-ssr 标记，便于客户端识别服务端输出 */
  dataViewSsr?: boolean;
};

/**
 * 服务端将编译后组件输出为 HTML 字符串。
 * 优先将 globalThis.document 替换为伪 DOM；浏览器中 document 常为只读时改为设置影子 document（getActiveDocument）。
 * 与客户端 createRoot(fn, container) 使用同一套 fn，保证结构一致便于后续水合。
 *
 * @param fn - 编译产物：(container) => void，内部用 insert(container, ...) 建立结构
 * @param options - 可选；containerTag、dataViewSsr
 * @returns HTML 字符串（为 container 的 innerHTML，不含容器自身标签）
 *
 * @example
 * const html = renderToString((el) => { insert(el, () => "Hello"); });
 * // 返回 "Hello"（或带转义）
 */
export function renderToString(
  fn: (container: SSRElement) => void,
  options: SSROptions = {},
): string {
  const prevDoc = (globalThis as { document?: unknown }).document;
  const prevSsr = (globalThis as Record<string, unknown>)[KEY_VIEW_SSR];
  const doc = createSSRDocument();
  let patchedGlobalDocument = false;
  try {
    (globalThis as unknown as { document: typeof doc }).document = doc;
    patchedGlobalDocument = true;
  } catch {
    setSSRShadowDocument(doc);
  }
  setGlobal(KEY_VIEW_SSR, true);
  try {
    const tag = options.containerTag ?? "div";
    const container = doc.createElement(tag) as SSRElement;
    if (options.dataViewSsr !== false) {
      container.setAttribute("data-view-ssr", "");
    }
    fn(container);
    return container.innerHTML;
  } finally {
    if (patchedGlobalDocument) {
      (globalThis as { document?: unknown }).document = prevDoc;
    } else {
      setSSRShadowDocument(undefined);
    }
    if (prevSsr !== undefined) {
      setGlobal(KEY_VIEW_SSR, prevSsr);
    } else {
      (globalThis as Record<string, unknown>)[KEY_VIEW_SSR] = undefined;
    }
  }
}

/**
 * 服务端将编译后组件输出为异步 HTML 流。
 * 执行 fn(container) 后，按根级子节点顺序 yield 各子节点的 HTML，便于流式响应。
 *
 * @param fn - 编译产物：(container) => void
 * @param options - 可选；containerTag、dataViewSsr
 * @yields HTML 片段（每个根级子节点序列化后的字符串）
 *
 * @example
 * for await (const chunk of renderToStream((el) => { insert(el, "A"); insert(el, "B"); })) {
 *   response.write(chunk);
 * }
 */
export async function* renderToStream(
  fn: (container: SSRElement) => void,
  options: SSROptions = {},
): AsyncGenerator<string, void, undefined> {
  const prevDoc = (globalThis as { document?: unknown }).document;
  const prevSsr = (globalThis as Record<string, unknown>)[KEY_VIEW_SSR];
  const doc = createSSRDocument();
  let patchedGlobalDocument = false;
  try {
    (globalThis as unknown as { document: typeof doc }).document = doc;
    patchedGlobalDocument = true;
  } catch {
    setSSRShadowDocument(doc);
  }
  setGlobal(KEY_VIEW_SSR, true);
  try {
    const tag = options.containerTag ?? "div";
    const container = doc.createElement(tag);
    if (options.dataViewSsr !== false) {
      container.setAttribute("data-view-ssr", "");
    }
    fn(container);
    for (const child of container.children) {
      yield child.serialize();
    }
  } finally {
    if (patchedGlobalDocument) {
      (globalThis as { document?: unknown }).document = prevDoc;
    } else {
      setSSRShadowDocument(undefined);
    }
    if (prevSsr !== undefined) {
      setGlobal(KEY_VIEW_SSR, prevSsr);
    } else {
      (globalThis as Record<string, unknown>)[KEY_VIEW_SSR] = undefined;
    }
  }
}
