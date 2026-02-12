/**
 * View 模板引擎 — DOM 层共享类型与工具
 *
 * Fragment、IfContext、SSROptions、isFragment、isVNodeLike 等，供 element / stringify / hydrate 复用
 */
import type { VNode } from "../types.ts";
/** Fragment 的 type 标记，不创建真实节点，仅用于包裹子节点 */
export declare const FragmentType: unique symbol;
/** 判断是否为 Fragment 节点 */
export declare function isFragment(vnode: VNode): boolean;
/** v-if / v-else 兄弟链的上下文，用于 vElse 判断“上一个 vIf 是否为 false” */
export type IfContext = {
    lastVIf: boolean;
};
/**
 * SSR 选项：allowRawHtml 为 false 时 v-html / dangerouslySetInnerHTML 输出转义文本（安全场景）
 * 默认服务端 v-html 同样不转义，与客户端一致；若需禁止原始 HTML 可传 allowRawHtml: false
 */
export type SSROptions = {
    allowRawHtml?: boolean;
};
/** 判断是否形如 VNode（含 type、props） */
export declare function isVNodeLike(x: unknown): boolean;
//# sourceMappingURL=shared.d.ts.map