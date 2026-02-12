/**
 * View 模板引擎 — Context（跨层数据注入）
 *
 * createContext 创建上下文，Provider 在树中注入值，useContext 在任意子组件中读取。
 * 渲染时在 dom 中进入 Provider 即 push、退出即 pop，保证同一次渲染中子树读到正确值。
 */
import type { VNode } from "./types.ts";
/**
 * 进入 Provider 时压栈（由 dom 在渲染时调用）
 * @internal
 */
export declare function pushContext(id: symbol, value: unknown): void;
/**
 * 离开 Provider 时出栈（由 dom 在渲染时调用）
 * @internal
 */
export declare function popContext(id: symbol): void;
/**
 * 获取当前 context 值（栈顶），无则返回创建时的默认值
 * @internal
 */
export declare function getContext(id: symbol): unknown;
/**
 * 判断组件是否为某 context 的 Provider，若是则返回其 context id
 * @internal
 */
export declare function getProviderContextId(component: (props: Record<string, unknown>) => VNode | VNode[] | null): symbol | undefined;
/**
 * 若组件已注册为 context 提供者（含 createContext 的 Provider 或 registerProviderAlias 的别名），
 * 返回 { id, value } 供 dom 层 push；否则返回 undefined。
 * @internal
 */
export declare function getContextBinding(component: (props: Record<string, unknown>) => VNode | VNode[] | null, props: Record<string, unknown>): {
    id: symbol;
    value: unknown;
} | undefined;
export type ContextValue<T> = T;
/**
 * 创建上下文
 *
 * @param defaultValue 无 Provider 包裹时 useContext 返回的默认值
 * @returns { Provider, useContext }，Provider 为组件用于包裹子树，useContext 在子组件中调用取当前值
 *
 * @example
 * const ThemeContext = createContext<'light'|'dark'>('light');
 * // 根或父级：<ThemeContext.Provider value={theme()}><App /></ThemeContext.Provider>
 * // 子组件：const theme = ThemeContext.useContext();
 */
export declare function createContext<T>(defaultValue: T): {
    Provider: (props: {
        value: T;
        children?: VNode | VNode[] | null;
    }) => VNode | VNode[] | null;
    useContext: () => T;
    /** 注册“别名”提供者：用 getValue(props) 注入同一 context，便于包装组件（如 RouterProvider(router)）直接注入，无需内层 Provider */
    registerProviderAlias: (component: (props: Record<string, unknown>) => VNode | VNode[] | null, getValue: (props: Record<string, unknown>) => T) => void;
};
//# sourceMappingURL=context.d.ts.map