/**
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入 HTTP 响应，减少 TTFB。
 *
 * @module @dreamer/view/stream
 * @packageDocumentation
 *
 * **导出函数：** renderToStream
 *
 * 可 `for (const chunk of renderToStream(fn))` 写入响应，或 `ReadableStream.from(renderToStream(fn))` 与 fetch/Response 配合。
 *
 * @example
 * const stream = renderToStream(() => <App />);
 * for (const chunk of stream) response.write(chunk);
 */

import { KEY_VIEW_SSR } from "./constants.ts";
import { createElementToStream } from "./dom.ts";
import type { SSROptions } from "./dom.ts";
import type { VNode } from "./types.ts";
import { setGlobal } from "./globals.ts";

/**
 * SSR 时替换 globalThis.document 的占位对象（与 runtime.ts 一致）：常用属性和方法写全，避免业务代码访问时报错。
 */
function createSSRDocumentShim(): Document {
  const style = { overflow: "" };
  const body = { style };
  const docElement = { style: {} };
  const safeStub = new Proxy({} as Record<string, unknown>, {
    get(_, key: string) {
      if (key === "style") return { overflow: "" };
      return safeStub;
    },
  });
  const noop = () => safeStub;
  const returnNull = () => null;
  const returnEmptyList = () => [];
  return new Proxy({} as Document, {
    get(_, key: string) {
      switch (key) {
        case "body":
          return body;
        case "documentElement":
          return docElement;
        case "head":
          return safeStub;
        case "createElement":
        case "createTextNode":
        case "createDocumentFragment":
          return noop;
        case "getElementById":
        case "querySelector":
          return returnNull;
        case "querySelectorAll":
        case "getElementsByClassName":
        case "getElementsByTagName":
        case "getElementsByTagNameNS":
          return returnEmptyList;
        case "appendChild":
        case "removeChild":
        case "insertBefore":
        case "replaceChild":
          return noop;
        case "documentURI":
        case "URL":
        case "title":
        case "characterSet":
          return "";
        case "defaultView":
          return null;
        default:
          return safeStub;
      }
    },
  });
}

function trySwapDocumentForSSR(shim: Document): Document | null {
  const g = globalThis as { document?: Document };
  try {
    const orig = g.document;
    g.document = shim;
    return orig ?? null;
  } catch {
    return null;
  }
}

/**
 * 流式 SSR：将根组件渲染为逐块输出的字符串生成器，便于边渲染边写入响应。
 * 执行期间设置 KEY_VIEW_SSR，并将 globalThis.document 替换为不抛错的 shim，业务代码可直接写 document。
 *
 * @param fn - 根组件函数，返回 VNode
 * @param options - 可选；allowRawHtml 为 false 时 dangerouslySetInnerHTML 输出转义文本（安全），默认不转义
 * @returns 字符串生成器 Generator<string>，可 for (const chunk of renderToStream(fn)) 或 ReadableStream.from(renderToStream(fn))
 */
export function renderToStream(
  fn: () => VNode,
  options?: SSROptions,
): Generator<string> {
  const vnode = fn();
  const inner = createElementToStream(vnode, undefined, options);
  return (function* () {
    setGlobal(KEY_VIEW_SSR, true);
    const g = globalThis as { document?: Document };
    const shim = createSSRDocumentShim();
    const origDoc = trySwapDocumentForSSR(shim);
    try {
      yield* inner;
    } finally {
      if (origDoc !== null) g.document = origDoc;
      setGlobal(KEY_VIEW_SSR, false);
    }
  })();
}
