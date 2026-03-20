/**
 * View 模板引擎 — 客户端 Hybrid 运行时（createRoot / render / mount）
 *
 * 与 CSR 入口一致，仅 createRoot / render / mount，新标准 fn(container) => void。
 * 不含 renderToString、generateHydrationScript。
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
