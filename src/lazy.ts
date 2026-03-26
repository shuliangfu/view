/**
 * **`lazy`** 向：动态 `import()` 默认导出组件，配合 {@link createResource} 在首屏拉取模块；
 * 加载中返回 `null`（宜外包 **Suspense** 与 `fallback`，见 `@dreamer/view/boundary`）。
 *
 * @module @dreamer/view/lazy
 */

import { createResource } from "./resource.ts";

/**
 * 动态模块约定：与 ES `import()` 默认导出一致。
 */
export type LazyComponentModule<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  default: (props: TProps) => unknown;
};

/**
 * 包装 `() => import("./Foo")`，得到可作为 VNode `type` 的组件函数（签名与手写组件一致）。
 * 模块就绪后每次仍调用 `default(props)`，以便 props 变化时子树更新。
 *
 * @param load - 返回 `Promise<{ default: (props) => … }>`，与路由 `() => import("…")` 相同
 * @returns `(props) => unknown`，返回值可为 `VNode`、`() => VNode`、`(parent)=>void` 或加载中 `null`
 *
 * @example
 * ```tsx
 * const Heavy = lazy(() => import("./Heavy.tsx"));
 * // <Suspense fallback={<Spinner />}><Heavy id={1} /></Suspense>
 * ```
 */
export function lazy<
  TProps extends Record<string, unknown> = Record<
    string,
    unknown
  >,
>(
  load: () => Promise<LazyComponentModule<TProps>>,
): (props: TProps) => unknown {
  const loadModule = createResource(() => load().then((m) => m.default));
  return (props: TProps) => {
    const { data: Comp, loading, error } = loadModule();
    if (error != null) {
      throw error;
    }
    if (loading || Comp == null) {
      return null;
    }
    return Comp(props);
  };
}
