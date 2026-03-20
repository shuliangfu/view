/**
 * **响应式 DOM 引用**：与 JSX `ref={createRef()}` 及编译产物配合；`ref.current` 读写经内部 signal，在 `createEffect` 中读取会建立依赖。
 *
 * 命名与 React `createRef` 相近，语义为本库细粒度更新模型（非 React ref 对象同一套实现）。
 *
 * @module @dreamer/view/ref
 * @packageDocumentation
 *
 * **导出：** `createRef`、`ElementRef`
 */

import { createSignal } from "./signal.ts";

/**
 * 与编译器对象 ref 形态一致（`ref.current` 读写），但读/写会经过内部 signal，以支持细粒度更新。
 *
 * @typeParam E - 挂载的元素类型，默认 HTMLElement
 */
export type ElementRef<E extends Element = HTMLElement> = {
  get current(): E | null;
  set current(value: E | null);
};

/**
 * 创建可在模板中传给 `ref={...}` 的响应式引用对象。
 * 编译产物在挂载后执行 `ref.current = el`、卸载时 `ref.current = null`，均会触发依赖 `ref.current` 的 effect。
 *
 * @param initial - 初始值，一般为 `null`
 * @returns 带 `current` getter/setter 的 ref 对象
 *
 * @example
 * ```tsx
 * const wrapRef = createRef();
 * createEffect(() => {
 *   const el = wrapRef.current;
 *   if (!el) return;
 *   el.style.transform = `translate(${x()}px, ${y()}px)`;
 * });
 * return <div ref={wrapRef} />;
 * ```
 */
export function createRef<E extends Element = HTMLElement>(
  initial: E | null = null,
): ElementRef<E> {
  const [get, set] = createSignal<E | null>(initial);
  return {
    get current(): E | null {
      return get();
    },
    set current(value: E | null) {
      set(value);
    },
  };
}
