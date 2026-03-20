/**
 * View 模板引擎 — 仅 CSR 运行时（createRoot / render / mount）
 *
 * 不包含 renderToString、generateHydrationScript，打主包时可从 @dreamer/view/csr 引入以减小体积。
 * 新标准：createRoot/render 为 fn(container) => void 形态。
 */

import { NOOP_ROOT, resolveMountContainer } from "./runtime-shared.ts";
import { createRoot, render } from "./compiler/mod.ts";
import type { MountOptions, Root } from "./types.ts";

/** 创建根并挂载，fn(container) 只执行一次 */
export { createRoot, render };

/**
 * 统一挂载入口：支持选择器或 Element。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param fn 根挂载函数 (container) => void
 * @param options noopIfNotFound 查不到时静默返回空 Root
 * @returns Root 句柄
 */
export function mount(
  container: string | Element,
  fn: (container: Element) => void,
  options?: MountOptions,
): Root {
  const el = resolveMountContainer(
    container,
    options?.noopIfNotFound ?? false,
  );
  if (!el) return NOOP_ROOT;
  return render(fn, el);
}
