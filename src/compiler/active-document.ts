/**
 * 运行时**当前 document** 解析：SSR 使用影子伪 `document` 时经 `getActiveDocument` 统一读取；浏览器则回退到 `globalThis.document`。
 *
 * @module @dreamer/view/runtime/active-document
 * @packageDocumentation
 *
 * **导出：** `getActiveDocument`、`setSSRShadowDocument`，类型 `ActiveDocumentLike`
 *
 * @internal 由 `insert`、主运行时、编译产物与 SSR 使用；应用侧请优先用 `@dreamer/view/ssr` 或 `getDocument`（浏览器）
 */

import { KEY_VIEW_SSR_DOCUMENT } from "../constants.ts";
import { getGlobal, setGlobal } from "../globals.ts";

/** 编译与 insert 所需的最小 document 能力（真实 Document 或 createSSRDocument 返回值） */
export type ActiveDocumentLike = {
  createElement(tag: string): unknown;
  createTextNode(text: string): unknown;
};

/**
 * 返回当前应使用的 document：若 SSR 已设置影子伪 document 则用之，否则用 globalThis.document。
 * 编译产物中 `createElement`/`createTextNode` 均经由此函数，以便浏览器内 renderToString 不修改 window。
 *
 * @returns 具备 createElement、createTextNode 的对象
 */
export function getActiveDocument(): ActiveDocumentLike {
  const shadow = getGlobal<ActiveDocumentLike>(KEY_VIEW_SSR_DOCUMENT);
  if (shadow != null) {
    return shadow;
  }
  const d = (globalThis as { document?: ActiveDocumentLike }).document;
  if (d == null) {
    throw new Error(
      "[view] document 不可用：请在有 DOM 的环境运行，或在 renderToString 周期内使用 createSSRDocument。",
    );
  }
  return d;
}

/**
 * 在无法将伪 document 赋给 globalThis.document 时，由 renderToString/renderToStream 设置；结束时传 undefined 清除。
 *
 * @param doc - createSSRDocument() 的返回值，或 undefined 表示清除影子
 */
export function setSSRShadowDocument(
  doc: ActiveDocumentLike | undefined,
): void {
  if (doc === undefined) {
    (globalThis as Record<string, unknown>)[KEY_VIEW_SSR_DOCUMENT] = undefined;
    return;
  }
  setGlobal(KEY_VIEW_SSR_DOCUMENT, doc);
}
