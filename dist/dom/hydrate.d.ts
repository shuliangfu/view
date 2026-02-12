/**
 * View 模板引擎 — 在已有 DOM 上 hydrate
 *
 * 复用 container 内子节点，与 vnode 树一一对应并挂上 props/effect
 */
import type { VNode } from "../types.ts";
/**
 * 在已有 DOM 容器上完整 hydrate：复用 container 内子节点，与 fn() 的 vnode 树一一对应
 */
export declare function hydrateElement(container: Element, vnode: VNode): void;
//# sourceMappingURL=hydrate.d.ts.map