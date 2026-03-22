/**
 * @module @dreamer/view/router-mount
 * @description
 * SPA 根容器与内置路由器的绑定：在 `@dreamer/view/router` 子路径内提供 `mountWithRouter`，
 * 将「订阅路由 → 指令卸载 → 清空容器 → 整树重挂」与「同 routeKey 去重」收拢在框架侧，示例与业务入口只需一行挂载。
 */

import { runDirectiveUnmountOnChildren } from "./dom/unmount.ts";
import { createEffect } from "./effect.ts";
import { coerceToMountFn } from "./route-mount-bridge.ts";
import { mount } from "./runtime.ts";
import type { MountFn, Router } from "./router.ts";
import type { MountOptions, Root, VNode } from "./types.ts";

/**
 * 从当前 `RouteMatch` 推导用于「是否同一路由」的稳定键：优先 `fullPath`（含 query），否则 `path`。
 *
 * @param match - 当前匹配，可为 null（未匹配）
 * @returns 无匹配时为 `""`，否则为用于去重的字符串
 */
function routeKeyFromMatch(
  match: { fullPath?: string; path: string } | null,
): string {
  if (match == null) return "";
  return match.fullPath ?? match.path ?? "";
}

/**
 * 将路由器与根挂载函数绑定到 DOM 容器：订阅 `router.getCurrentRouteSignal()`，在路由变化时
 * 先对子树执行指令 `unmounted`，再清空容器并调用 `getMountFn(router)` 返回的 `(parent)=>void` 重建整树。
 *
 * **同键去重：** 若 effect 因 HMR 或其它依赖在同一 `routeKey` 下重复执行，且容器内已有子节点，则跳过本次重挂，
 * 避免生成第二棵未接入文档的子树及函数 ref 异常。
 *
 * @param container - 选择器（如 `"#root"`）或 `Element`，语义同 {@link mount}
 * @param router - `createRouter` 返回的实例（须已 `start()` 或即将 `start()`，以便地址与 signal 一致）
 * @param getMountFn - 接收同一 `router`，返回根内容：**`compileSource`** 下为 **`(parent)=>void`**；**`jsx: "runtime"`** 下可为 **`VNode`**（与 **`getRoot` 写 `return <App router={r} />`** 一致），内部经 **`coerceToMountFn`** 与 **`RoutePage`** 对齐
 * @param options - 透传给 `mount`（如 `noopIfNotFound`）
 * @returns 与 `mount` 相同的 `Root` 句柄
 *
 * @example
 * ```ts
 * const router = createRouter({ routes, notFound: notFoundRoute });
 * router.start();
 * mountWithRouter("#root", router, (r) => <App router={r} />, { noopIfNotFound: true });
 * ```
 */
export function mountWithRouter(
  container: string | Element,
  router: Router,
  getMountFn: (router: Router) => MountFn | VNode,
  options?: MountOptions,
): Root {
  return mount(
    container,
    (el) => {
      /** 上次完成整树挂载后的路由键，用于同键跳过重复 remount */
      let lastMountedRouteKey: string | undefined;
      createEffect(() => {
        const match = router.getCurrentRouteSignal()();
        const routeKey = routeKeyFromMatch(match);

        const hasMountedChild = el.firstChild != null;
        const sameRouteAlreadyMounted = hasMountedChild &&
          routeKey !== "" &&
          routeKey === lastMountedRouteKey;
        if (sameRouteAlreadyMounted) {
          return;
        }

        // 先执行子树已登记的 ref(null)/指令 unmount，再摘掉 #root 子节点，避免 ref 仍指向已脱离文档的旧节点
        runDirectiveUnmountOnChildren(el);
        while (el.firstChild) el.removeChild(el.firstChild);
        /** compileSource → MountFn；esbuild automatic JSX → VNode，需与 RoutePage 相同桥接 */
        coerceToMountFn(getMountFn(router))(el);
        lastMountedRouteKey = routeKey;
      });
    },
    options,
  );
}
