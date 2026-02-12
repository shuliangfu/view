/**
 * View 模板引擎 — Context（跨层数据注入）
 *
 * createContext 创建上下文，Provider 在树中注入值，useContext 在任意子组件中读取。
 * 渲染时在 dom 中进入 Provider 即 push、退出即 pop，保证同一次渲染中子树读到正确值。
 */

import type { VNode } from "./types.ts";

/** 每个 context 的栈，用于嵌套 Provider */
const contextStacks = new Map<symbol, unknown[]>();

/** context id -> 默认值（无 Provider 时 useContext 返回） */
const defaultValues = new Map<symbol, unknown>();

/** 可注入 context 的组件 -> { id, getValue }，支持默认 Provider(value) 与别名组件（如 RouterProvider(router)） */
const providerBindings = new Map<
  (props: Record<string, unknown>) => VNode | VNode[] | null,
  { id: symbol; getValue: (props: Record<string, unknown>) => unknown }
>();

/**
 * 进入 Provider 时压栈（由 dom 在渲染时调用）
 * @internal
 */
export function pushContext(id: symbol, value: unknown): void {
  let stack = contextStacks.get(id);
  if (!stack) {
    stack = [];
    contextStacks.set(id, stack);
  }
  stack.push(value);
}

/**
 * 离开 Provider 时出栈（由 dom 在渲染时调用）
 * @internal
 */
export function popContext(id: symbol): void {
  const stack = contextStacks.get(id);
  if (stack && stack.length > 0) stack.pop();
}

/**
 * 获取当前 context 值（栈顶），无则返回创建时的默认值
 * @internal
 */
export function getContext(id: symbol): unknown {
  const stack = contextStacks.get(id);
  const value = stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
  return value !== undefined ? value : defaultValues.get(id);
}

/**
 * 判断组件是否为某 context 的 Provider，若是则返回其 context id
 * @internal
 */
export function getProviderContextId(
  component: (props: Record<string, unknown>) => VNode | VNode[] | null,
): symbol | undefined {
  return providerBindings.get(component)?.id;
}

/**
 * 若组件已注册为 context 提供者（含 createContext 的 Provider 或 registerProviderAlias 的别名），
 * 返回 { id, value } 供 dom 层 push；否则返回 undefined。
 * @internal
 */
export function getContextBinding(
  component: (props: Record<string, unknown>) => VNode | VNode[] | null,
  props: Record<string, unknown>,
): { id: symbol; value: unknown } | undefined {
  const binding = providerBindings.get(component);
  if (!binding) return undefined;
  return { id: binding.id, value: binding.getValue(props) };
}

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
export function createContext<T>(defaultValue: T): {
  Provider: (
    props: { value: T; children?: VNode | VNode[] | null },
  ) => VNode | VNode[] | null;
  useContext: () => T;
  /** 注册“别名”提供者：用 getValue(props) 注入同一 context，便于包装组件（如 RouterProvider(router)）直接注入，无需内层 Provider */
  registerProviderAlias: (
    component: (props: Record<string, unknown>) => VNode | VNode[] | null,
    getValue: (props: Record<string, unknown>) => T,
  ) => void;
} {
  const id = Symbol("view.context");
  defaultValues.set(id, defaultValue);

  const Provider = (
    props: { value: T; children?: VNode | VNode[] | null },
  ): VNode | VNode[] | null => {
    return (props.children ?? null) as VNode | VNode[] | null;
  };
  providerBindings.set(
    Provider as (props: Record<string, unknown>) => VNode | VNode[] | null,
    { id, getValue: (p) => (p as { value: T }).value },
  );

  const useContext = (): T => {
    return getContext(id) as T;
  };

  const registerProviderAlias = (
    component: (props: Record<string, unknown>) => VNode | VNode[] | null,
    getValue: (props: Record<string, unknown>) => T,
  ): void => {
    providerBindings.set(component, {
      id,
      getValue: getValue as (p: Record<string, unknown>) => unknown,
    });
  };

  return { Provider, useContext, registerProviderAlias };
}
