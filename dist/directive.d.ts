/**
 * View 模板引擎 — 指令系统
 *
 * 支持内置指令 v-if / v-else / v-else-if / v-for / v-show / v-text / v-html / v-model，以及用户注册的自定义指令（v-xxxx）。
 * JSX 中使用 camelCase：vIf、vElse、vElseIf、vFor、vShow、vText、vHtml、vModel；模板中可使用 v-if、v-html、v-model 等。
 * v-model 用法：vModel={[getter, setter]}，如 createSignal 返回的元组。原生 input/textarea/select 由 applyProps 双向绑定；
 * 自定义表单组件：父组件直接传 model={[get, set]}，组件内解构 props.model 即可。
 */
import type { VNode } from "./types.ts";
/** 指令绑定：传给指令钩子的参数 */
export interface DirectiveBinding<T = unknown> {
    value: T;
    oldValue?: T;
    /** 参数，如 v-foo:arg 中的 arg */
    arg?: string;
    /** 修饰符，如 v-foo.mod1.mod2 中的 ['mod1','mod2'] */
    modifiers?: string[];
}
/** 指令钩子：mounted 挂载时、updated 绑定值变化时、unmounted 卸载时 */
export interface DirectiveHooks<T = unknown> {
    mounted?(el: Element, binding: DirectiveBinding<T>): void;
    updated?(el: Element, binding: DirectiveBinding<T>): void;
    unmounted?(el: Element): void;
}
/** 将模板风格名称转为 camelCase，如 v-if -> vIf */
export declare function directiveNameToCamel(name: string): string;
/** 将 camelCase 转为短横线，如 vIf -> v-if */
export declare function directiveNameToKebab(name: string): string;
/**
 * 注册自定义指令
 *
 * @param name 指令名，支持 v-xxx 或 vXxx
 * @param hooks mounted / updated / unmounted
 *
 * @example
 * registerDirective("v-focus", {
 *   mounted(el) { (el as HTMLInputElement).focus(); },
 * });
 */
export declare function registerDirective(name: string, hooks: DirectiveHooks): void;
/**
 * 根据 prop 名获取指令（支持 vIf、v-if 等）
 */
export declare function getDirective(propKey: string): DirectiveHooks | undefined;
export declare function isDirectiveProp(propKey: string): boolean;
/**
 * 判断 props 是否包含指定指令（同时支持 camelCase 与 kebab-case，减少魔法字符串）
 * @param props 节点 props
 * @param camelName 指令驼峰名，如 'vShow'、'vIf'、'vText'
 */
export declare function hasDirective(props: Record<string, unknown>, camelName: string): boolean;
/** 获取指令绑定当前值（若为 getter 则求值）；供 dom 层 v-once 等冻结时使用 */
export declare function getDirectiveValue(value: unknown): unknown;
/**
 * 从 props 中提取指令绑定（供 dom 层在 applyProps 时调用自定义指令）
 */
export declare function createBinding(value: unknown, arg?: string, modifiers?: string[]): DirectiveBinding;
/**
 * 检查 vnode 是否有结构性指令 vIf / vFor，需在 createElement 中优先处理
 */
export declare function hasStructuralDirective(props: Record<string, unknown>): "vIf" | "vFor" | null;
/**
 * 取 vIf 的当前值（boolean 或 getter 求值）
 * 支持标记过的 signal getter 与普通无参函数（如 () => tab() === "a"），以便在 effect 内读 signal 并订阅
 */
export declare function getVIfValue(props: Record<string, unknown>): boolean;
/**
 * 取 vElse 是否应显示：依赖外部传入的 lastVIf（上一个 vIf 为 false 时 vElse 才显示）
 */
export declare function getVElseShow(lastVIf: boolean): boolean;
/**
 * 取 v-else-if 的当前条件值（仅当上一个 v-if 为 false 时才有意义）
 * 支持标记过的 signal getter 与普通无参函数，以便在 effect 内读 signal 并订阅
 */
export declare function getVElseIfValue(props: Record<string, unknown>): boolean;
/**
 * 从 v-for 的 children 解析出工厂函数。
 * 支持：(item, index) => VNode 的单个函数，或 expand 后得到的单元素数组 [factory]。
 */
export declare function resolveVForFactory(children: unknown): (item: unknown, index: number) => VNode | VNode[];
/**
 * 取 vFor 的 list 与子节点工厂（children 为 (item, index) => VNode | VNode[]）
 */
export declare function getVForListAndFactory(props: Record<string, unknown>, children: unknown): {
    list: unknown[];
    factory: (item: unknown, index: number) => VNode | VNode[];
} | null;
/** 取 v-show 的当前值（boolean 或 getter 求值），供 dom 层应用 display */
export declare function getVShowValue(props: Record<string, unknown>): boolean;
/** 取 v-text 的当前值（string 或 getter/函数求值），供 dom 层应用 textContent */
export declare function getVTextValue(props: Record<string, unknown>): string;
/**
 * 取 v-html 的当前值（string 或 getter/函数求值），供 dom 层应用 innerHTML
 *
 * 安全：未转义 HTML，存在 XSS 风险。禁止将未 sanitize 的用户输入传入。
 * 仅限信任内容；对用户输入请先用 DOMPurify、sanitize-html 等库做 sanitize 后再传入。
 */
export declare function getVHtmlValue(props: Record<string, unknown>): string;
/**
 * 从 props 中取出 v-model/model 绑定，供需要同时兼容 vModel 与 model 的自定义组件使用
 *
 * 推荐做法：自定义组件直接接收 model={[get, set]}，组件内 const [get, set] = props.model 即可。
 * 若组件需同时接受 vModel 或 model（如模板编译产物），可调用本函数统一取出 [getter, setter]。
 *
 * @param props 组件 props（可含 vModel、v-model 或 model）
 * @returns [getter, setter] 或 null（未传时）
 */
export declare function getModelFromProps(props: Record<string, unknown>): [() => unknown, (v: unknown) => void] | null;
/**
 * 应用自定义指令到元素：在 applyProps 中对每个指令 prop 调用 mounted，若值为 getter 则用 effect 调用 updated；
 * 若指令提供 unmounted，通过 registerUnmount 登记，节点从 DOM 移除前会调用
 */
export declare function applyDirectives(el: Element, props: Record<string, unknown>, effectFn: (fn: () => void) => () => void, registerUnmount?: (el: Element, cb: () => void) => void): void;
//# sourceMappingURL=directive.d.ts.map