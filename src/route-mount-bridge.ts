/**
 * 路由挂载桥接：将 **compileSource 产物**（`(parent)=>void`）与 **手写 jsx-runtime**（`VNode`）统一到 `MountFn`，
 * 供 `RoutePage`、布局链、loading 组件与 **`mountWithRouter` 根 `getMountFn`** 共用。
 *
 * @module @dreamer/view/route-mount-bridge
 * @internal 由 route-page 引用；稳定 API 仍以 `@dreamer/view/router` 为准
 */

import { isMountFn } from "./compiler/insert.ts";
import { mountVNodeTree } from "./compiler/vnode-mount.ts";
import { isVNodeLike } from "./dom/shared.ts";
import type { MountFn } from "./router.ts";

/**
 * 将页面或布局的「单次返回值」规范为挂载函数。
 * - **MountFn**：`(parent) => void`，与 compileSource 一致，原样返回。
 * - **VNode**：包一层 `(parent) => mountVNodeTree(parent, vnode)`，与手写 `jsx`/`jsxs` 对齐。
 * - **VNode 数组**：依次挂载（少见，兼容多根片段式返回）。
 *
 * @param value - `default(match)` 或布局 `default({ children })` 的返回值
 * @returns 可交给 `RoutePage` / `insertReactive` 的 MountFn
 * @throws 若既不是 MountFn 也不是可挂载的 VNode（及数组组合）
 */
export function coerceToMountFn(value: unknown): MountFn {
  if (isMountFn(value)) {
    return value as MountFn;
  }
  if (isVNodeLike(value)) {
    const vnode = value;
    return (parent) => {
      mountVNodeTree(parent, vnode);
    };
  }
  if (Array.isArray(value)) {
    return (parent) => {
      for (const item of value) {
        if (isMountFn(item)) {
          (item as MountFn)(parent);
        } else if (isVNodeLike(item)) {
          mountVNodeTree(parent, item);
        } else {
          throw new Error(
            `[RoutePage] Layout/page child item must be MountFn or VNode, got ${typeof item}`,
          );
        }
      }
    };
  }
  throw new Error(
    `[RoutePage] Expected MountFn or VNode from route default/layout, got ${
      value === null || value === undefined ? String(value) : typeof value
    }. ` +
      'With jsx: "runtime", ensure the page default export is a function returning a VNode (or use compileSource).',
  );
}

/**
 * 调用路由模块的 `default(match)`（或等价的同步 `default()`），再 **coerceToMountFn**。
 *
 * @param defaultExport - 页面模块的 `default`，签名为 `(match?) => unknown`
 * @param match - 当前路由 match（含 router 等），传给页面组件
 * @returns 挂载函数
 */
export function pageDefaultToMountFn(
  defaultExport: (match?: unknown) => unknown,
  match: unknown,
): MountFn {
  const raw = defaultExport(match);
  return coerceToMountFn(raw);
}

/**
 * 将 **布局链**（从外到内已排好序的模块列表，内层页在最前）与页面 default 合成一个 MountFn。
 * 与原有逻辑一致：自内向外 `layout({ children: innerMount })`；若布局返回 VNode，则对根节点执行 `mountVNodeTree`。
 *
 * @param pageDefault - 页面 `default`
 * @param match - 路由 match
 * @param layoutMods - 布局模块数组，顺序与现 RoutePage 一致（`layoutMods[0]` 为最内层紧邻页面的布局）
 * @returns 合成后的 MountFn
 */
export function composePageWithLayouts(
  pageDefault: (match?: unknown) => unknown,
  match: unknown,
  layoutMods: ReadonlyArray<{
    default: (props: { children: MountFn }) => unknown;
  }>,
): MountFn {
  let inner: MountFn = pageDefaultToMountFn(pageDefault, match);
  for (let i = layoutMods.length - 1; i >= 0; i--) {
    const layout = layoutMods[i]!;
    const prev = inner;
    inner = (parent) => {
      const out = layout.default({ children: prev });
      coerceToMountFn(out)(parent);
    };
  }
  return inner;
}
