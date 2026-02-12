/**
 * View 模板引擎 — SSR：将 VNode 转为 HTML 字符串或流
 *
 * createElementToString、createElementToStream、stringifyAttributes、escapeText/escapeAttr、normalizeChildrenForSSR
 */
import type { VNode } from "../types.ts";
import type { IfContext, SSROptions } from "./shared.ts";
/**
 * 将 VNode 转为 HTML 字符串（SSR，无浏览器 API）
 * SSR 时 getter 只求值一次；vIf/vElse/vFor 与 createElement 逻辑一致
 * options.allowRawHtml 为 false 时 v-html 输出转义文本（安全场景）。
 * 默认 v-html 在服务端同样不转义，与客户端一致。
 */
export declare function createElementToString(vnode: VNode, ifContext?: IfContext, options?: SSROptions): string;
/**
 * 流式 SSR：将 VNode 转为逐块输出的字符串生成器，与 createElementToString 结构一致
 * options.allowRawHtml 为 false 时 v-html 输出转义文本；默认 v-html 在服务端同样不转义
 */
export declare function createElementToStream(vnode: VNode, ifContext?: IfContext, options?: SSROptions): Generator<string>;
//# sourceMappingURL=stringify.d.ts.map