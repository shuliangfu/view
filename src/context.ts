/**
 * @module @dreamer/view/context
 * @description
 * 跨层数据注入（Context）：createContext 创建上下文，Provider 在树中注入值，useContext 在任意子组件中读取。渲染时 dom 层进入 Provider 即 push、退出即 pop，保证子树读到当前层级的 value。
 *
 * **本模块导出：**
 * - `createContext(defaultValue)`：返回 { Provider, useContext, registerProviderAlias }
 * - 类型：`ContextValue<T>`
 * - 内部 API（dom 层使用）：`pushContext`、`popContext`、`getContext`、`getProviderContextId`、`getContextBinding`
 *
 * **registerProviderAlias：** 可注册别名组件（如 RouterProvider(router)）直接注入同一 context，无需内层再包 Provider。
 *
 * @example
 * import { createContext } from "jsr:@dreamer/view/context";
 * const ThemeContext = createContext<"light" | "dark">("light");
 * <ThemeContext.Provider value={theme()}><App /></ThemeContext.Provider>
 * // 子组件：const theme = ThemeContext.useContext();
 */

import {
  KEY_CONTEXT_DEFAULTS,
  KEY_CONTEXT_STACKS,
  KEY_PROVIDER_BINDINGS,
} from "./constants.ts";
import { getGlobalOrDefault } from "./globals.ts";
import { markSignalGetter } from "./signal.ts";
import type { VNode } from "./types.ts";

/** context 栈：id -> value[]，跨 bundle 共享 */
type GlobalContextStacks = Map<symbol, unknown[]>;
/** context 默认值：id -> defaultValue */
type GlobalContextDefaults = Map<symbol, unknown>;
/** Provider 绑定：组件 -> { id, getValue } */
export type ProviderBinding = {
  id: symbol;
  getValue: (props: Record<string, unknown>) => unknown;
};
type GlobalProviderBindings = Map<
  (props: Record<string, unknown>) => unknown,
  ProviderBinding
>;

/**
 * 按 key 从 globalThis 取或创建 Map 并写入，供 context 的三种全局 Map 复用。
 * @param key - constants 中的 __VIEW_* 键名
 * @returns 已挂到 globalThis 的 Map（懒创建）
 */
function getGlobalMap<K, V>(key: string): Map<K, V> {
  return getGlobalOrDefault(key, () => new Map<K, V>());
}

function getGlobalContextStacks(): GlobalContextStacks {
  return getGlobalMap<symbol, unknown[]>(KEY_CONTEXT_STACKS);
}

function getGlobalContextDefaults(): GlobalContextDefaults {
  return getGlobalMap<symbol, unknown>(KEY_CONTEXT_DEFAULTS);
}

function getGlobalProviderBindings(): GlobalProviderBindings {
  return getGlobalMap<
    (props: Record<string, unknown>) => unknown,
    ProviderBinding
  >(KEY_PROVIDER_BINDINGS);
}

/** Fragment 的 type 标记，与 dom/shared 中 isFragment 判断一致，避免 context 依赖 dom */
const FRAGMENT_TYPE = "Fragment";

/**
 * ContextScope 的 type 标记。DOM 层 createElement 遇到此类型时在渲染 children 前后执行 pushContext/popContext，
 * 这样「渲染 children」发生在栈有效期内，getter 只需返回此 VNode，不必在 getter 内 push/pop（getter return 时 finally 会先于调用方渲染执行，导致栈已 pop）。
 * @internal 供 dom/element.ts 使用
 */
export const CONTEXT_SCOPE_TYPE = Symbol.for("view.contextScope");

/**
 * 进入 Provider 时将 value 压入该 context 的栈（由 dom 在渲染 Provider 时调用）。
 *
 * @param id - context 的 id（createContext 内部生成）
 * @param value - 当前 Provider 的 value
 * @internal 由 dom 层使用，业务代码通过 Provider 组件间接使用
 */
export function pushContext(id: symbol, value: unknown): void {
  const contextStacks = getGlobalContextStacks();
  let stack = contextStacks.get(id);
  if (!stack) {
    stack = [];
    contextStacks.set(id, stack);
  }
  stack.push(value);
}

/**
 * 离开 Provider 时从该 context 的栈弹出（由 dom 在渲染时调用）。
 *
 * @param id - context 的 id
 * @internal 由 dom 层使用
 */
export function popContext(id: symbol): void {
  const stack = getGlobalContextStacks().get(id);
  if (stack && stack.length > 0) stack.pop();
}

/**
 * 获取当前 context 值（栈顶）；无 Provider 时返回 createContext 时的 defaultValue。
 * 若栈顶为无参函数则视为 getter，调用后返回结果，便于细粒度渲染下在消费者执行时建立订阅。
 *
 * @param id - context 的 id
 * @returns 当前值或默认值（若为 getter 则为其返回值）
 * @internal 由 createContext 返回的 useContext 内部调用
 */
export function getContext(id: symbol): unknown {
  const contextStacks = getGlobalContextStacks();
  const defaultValues = getGlobalContextDefaults();
  const stack = contextStacks.get(id);
  const top = stack?.length ? stack[stack.length - 1] : undefined;
  const raw = top !== undefined ? top : defaultValues.get(id);
  let result: unknown;
  if (typeof raw === "function" && raw.length === 0) {
    result = (raw as () => unknown)();
  } else {
    result = raw;
  }
  return result;
}

/**
 * 判断组件是否为某 context 的 Provider（含 createContext 的 Provider 或 registerProviderAlias 的别名），若是则返回其 context id。
 *
 * @param component - 组件函数
 * @returns context id 或 undefined
 * @internal 由 dom 层使用
 */
export function getProviderContextId(
  component: (props: Record<string, unknown>) => VNode | VNode[] | null,
): symbol | undefined {
  return getGlobalProviderBindings().get(
    component as (props: Record<string, unknown>) => unknown,
  )?.id;
}

/**
 * 若组件已注册为 context 提供者，返回 { id, value } 供 dom 层在渲染时 pushContext；否则返回 undefined。
 *
 * @param component - 组件函数
 * @param props - 组件 props（用于 getValue(props)）
 * @returns { id, value } 或 undefined
 * @internal 由 dom 层使用
 */
export function getContextBinding(
  component: (props: Record<string, unknown>) => VNode | VNode[] | null,
  props: Record<string, unknown>,
): { id: symbol; value: unknown } | undefined {
  const binding = getGlobalProviderBindings().get(
    component as (props: Record<string, unknown>) => unknown,
  );
  if (!binding) return undefined;
  return { id: binding.id, value: binding.getValue(props) };
}

/**
 * Context 值的类型别名（与 T 相同，用于语义化）。
 */
export type ContextValue<T> = T;

/**
 * 创建上下文，用于跨层注入数据。
 * Provider 的 value 可为 T 或无参 getter () => T；传 getter 时消费者在 useContext() 时再读值，便于细粒度渲染下正确建立订阅。
 *
 * @param defaultValue - 无 Provider 包裹时 useContext 返回的默认值
 * @param key - 可选，code-split 下跨 bundle 共享同一 context 时必传（如 "Theme"），内部用 Symbol.for("view.context."+key) 保证 main 与 chunk 用同一 id
 * @returns { Provider, useContext, registerProviderAlias }：Provider 为组件用于包裹子树，useContext 在子组件中取当前值，registerProviderAlias 可注册别名提供者
 *
 * **Store 在 code-split 下的共享：** 若 store 通过本 context 注入，需传 key 且子组件用同一 context 的 useContext，即可跨 chunk 共享。
 * 若 store 在单例模块（如 stores/theme.ts）且被 main 与路由 chunk 都 import，打包后可能各有一份；要保证单例可把 store 挂到 globalThis 或保证该模块只打进一个 shared chunk。
 *
 * @example
 * const ThemeContext = createContext<'light'|'dark'>('light', 'Theme');
 * const [theme, setTheme] = createSignal<'light'|'dark'>('light');
 * // 推荐传 getter，子组件 useContext() 时再读，保证点击等更新能触发消费者重渲染
 * <ThemeContext.Provider value={theme}><App /></ThemeContext.Provider>
 * // 子组件：const themeValue = ThemeContext.useContext();
 */
export function createContext<T>(defaultValue: T, key?: string): {
  Provider: (
    props: { value: T | (() => T); children?: VNode | VNode[] | null },
  ) => VNode | VNode[] | null;
  useContext: () => T;
  /** 注册“别名”提供者：用 getValue(props) 注入同一 context，便于包装组件（如 RouterProvider(router)）直接注入，无需内层 Provider */
  registerProviderAlias: (
    component: (props: Record<string, unknown>) => VNode | VNode[] | null,
    getValue: (props: Record<string, unknown>) => T,
  ) => void;
} {
  const id = key != null
    ? Symbol.for("view.context." + key)
    : Symbol("view.context");
  getGlobalContextDefaults().set(id, defaultValue);

  /**
   * Provider 用 getter 包一层：子节点通过 appendDynamicChild 的 effect 渲染，
   * 这样 theme() 的读取一定发生在该 effect 内，能稳定建立订阅；点击 setTheme 后该 effect 重跑，只更新该子树。
   * 若直接返回 ContextScope，在 RoutePage + createResource 的 patch 路径下可能不在 root effect 内读 theme，导致 subscribers: 0。
   */
  const Provider = (
    props: { value: T | (() => T); children?: VNode | VNode[] | null },
  ): VNode | VNode[] | null => {
    const children = props.children ?? null;
    const scopeGetter = (): VNode => ({
      type: CONTEXT_SCOPE_TYPE,
      props: { id, value: props.value, children },
      children: [],
    } as VNode);
    return {
      type: FRAGMENT_TYPE,
      props: { children: markSignalGetter(scopeGetter) },
      children: [],
    } as VNode;
  };
  getGlobalProviderBindings().set(
    Provider as (props: Record<string, unknown>) => unknown,
    { id, getValue: (p) => (p as { value: T | (() => T) }).value },
  );

  const useContext = (): T => {
    return getContext(id) as T;
  };

  const registerProviderAlias = (
    component: (props: Record<string, unknown>) => VNode | VNode[] | null,
    getValue: (props: Record<string, unknown>) => T,
  ): void => {
    getGlobalProviderBindings().set(
      component as (props: Record<string, unknown>) => unknown,
      {
        id,
        getValue: getValue as (p: Record<string, unknown>) => unknown,
      },
    );
  };

  return { Provider, useContext, registerProviderAlias };
}
