/**
 * 测试用 DOM 环境：在无 document 时注入 happy-dom，使 createRoot/render/hydrate 等测试真实执行
 * runtime.test.ts、integration.test.ts 首行 import 本文件后，document 可用
 */
import { Window } from "happy-dom";
if (typeof (globalThis as { document?: unknown }).document === "undefined") {
  const win = new Window();
  (globalThis as { window?: unknown; document?: unknown }).window = win;
  (globalThis as { document?: unknown }).document = win.document;
}
