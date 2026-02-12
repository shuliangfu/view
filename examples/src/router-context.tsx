/**
 * 示例内 Router 上下文：便于任意页面通过 useRouter() 获取 router 实例
 * 用于演示 navigate、replace、back、forward、href 等编程式 API
 */

import { createContext } from "@dreamer/view/context";
import type { Router } from "@dreamer/view/router";
import type { VNode } from "@dreamer/view";

const RouterContext = createContext<Router | null>(null);

/** 在根组件包裹，注入 router，子组件可用 useRouter() 获取 */
export function RouterProvider(props: {
  router: Router;
  children: VNode | VNode[];
}): VNode | VNode[] | null {
  return RouterContext.Provider({
    value: props.router,
    children: props.children,
  });
}

/** 注册为同一 context 的别名提供者：展开/渲染 RouterProvider 时用 props.router 注入，子组件 useRouter() 即可取到 */
RouterContext.registerProviderAlias(
  RouterProvider as (props: Record<string, unknown>) => VNode | VNode[] | null,
  (p) => (p as { router: Router }).router,
);

/** 获取当前 router 实例（在 RouterProvider 子树内使用） */
export function useRouter(): Router | null {
  return RouterContext.useContext();
}
