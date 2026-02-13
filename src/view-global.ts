/**
 * @module @dreamer/view/view-global
 * @description
 * 跨 bundle 共享的 global 读写：currentEffect、scheduler、context 栈/默认值/Provider 绑定、store 注册表等。
 * 独立小模块，供 signal / effect / scheduler / context / store 引用，保证 code-split 后 main 与 chunk 读写同一 global。
 * 无其他依赖，避免循环引用。一般由业务通过 @dreamer/view、@dreamer/view/context、@dreamer/view/store 等间接使用，无需直接导入本模块。
 *
 * **本模块导出：**
 * - Effect：`getGlobalCurrentEffect`、`setGlobalCurrentEffect`
 * - Scheduler：`getGlobalSchedulerState`、类型 `SchedulerState`
 * - Context：`getGlobalContextStacks`、`getGlobalContextDefaults`、`getGlobalProviderBindings`，类型 `GlobalContextStacks`、`GlobalContextDefaults`、`GlobalProviderBindings`、`ProviderBinding`
 * - Store：`getGlobalStoreRegistry`、`setGlobalStore`、`getGlobalStore`、`DEFAULT_STORE_KEY`，类型 `GlobalStoreRegistry`
 */

const KEY_EFFECT = "__VIEW_CURRENT_EFFECT";
const KEY_SCHEDULER = "__VIEW_SCHEDULER";
const KEY_CONTEXT_STACKS = "__VIEW_CONTEXT_STACKS";
const KEY_CONTEXT_DEFAULTS = "__VIEW_CONTEXT_DEFAULTS";
const KEY_PROVIDER_BINDINGS = "__VIEW_PROVIDER_BINDINGS";
const KEY_STORE_REGISTRY = "__VIEW_STORE_REGISTRY";

type EffectRun = (() => void) & { _subscriptionSets?: unknown[] };

export function getGlobalCurrentEffect(): EffectRun | null {
  const v = (globalThis as unknown as Record<string, unknown>)[KEY_EFFECT];
  return (v != null ? v : null) as EffectRun | null;
}

export function setGlobalCurrentEffect(effect: EffectRun | null): void {
  (globalThis as unknown as Record<string, unknown>)[KEY_EFFECT] = effect;
}

export type SchedulerState = {
  queue: Set<() => void>;
  queueCopy: (() => void)[];
  scheduled: boolean;
};

export function getGlobalSchedulerState(): SchedulerState {
  const g = globalThis as unknown as Record<string, SchedulerState | undefined>;
  let state = g[KEY_SCHEDULER];
  if (!state) {
    state = {
      queue: new Set(),
      queueCopy: [],
      scheduled: false,
    };
    (globalThis as unknown as Record<string, SchedulerState>)[KEY_SCHEDULER] =
      state;
  }
  return state;
}

/** Context 栈：id -> value[]，供 pushContext/getContext 跨 bundle 共享 */
export type GlobalContextStacks = Map<symbol, unknown[]>;
export function getGlobalContextStacks(): GlobalContextStacks {
  const g = globalThis as unknown as Record<
    string,
    GlobalContextStacks | undefined
  >;
  let m = g[KEY_CONTEXT_STACKS];
  if (!m) {
    m = new Map();
    (globalThis as unknown as Record<string, GlobalContextStacks>)[
      KEY_CONTEXT_STACKS
    ] = m;
  }
  return m;
}

/** Context 默认值：id -> defaultValue，供 getContext 无 Provider 时使用 */
export type GlobalContextDefaults = Map<symbol, unknown>;
export function getGlobalContextDefaults(): GlobalContextDefaults {
  const g = globalThis as unknown as Record<
    string,
    GlobalContextDefaults | undefined
  >;
  let m = g[KEY_CONTEXT_DEFAULTS];
  if (!m) {
    m = new Map();
    (globalThis as unknown as Record<string, GlobalContextDefaults>)[
      KEY_CONTEXT_DEFAULTS
    ] = m;
  }
  return m;
}

/** Provider 组件 -> { id, getValue }，供 dom 层渲染时 push 用；跨 bundle 后 main 渲染 chunk 的 Provider 能查到 chunk 注册的 binding */
export type ProviderBinding = {
  id: symbol;
  getValue: (props: Record<string, unknown>) => unknown;
};
export type GlobalProviderBindings = Map<
  (props: Record<string, unknown>) => unknown,
  ProviderBinding
>;
export function getGlobalProviderBindings(): GlobalProviderBindings {
  const g = globalThis as unknown as Record<
    string,
    GlobalProviderBindings | undefined
  >;
  let m = g[KEY_PROVIDER_BINDINGS];
  if (!m) {
    m = new Map();
    (globalThis as unknown as Record<string, GlobalProviderBindings>)[
      KEY_PROVIDER_BINDINGS
    ] = m;
  }
  return m;
}

/** Store 注册表：字符串 key -> store 实例（getter/setter 或带 getters/actions 的元组），code-split 下 main 注册、chunk 通过 key 取同一引用 */
export type GlobalStoreRegistry = Map<string, unknown>;

export function getGlobalStoreRegistry(): GlobalStoreRegistry {
  const g = globalThis as unknown as Record<
    string,
    GlobalStoreRegistry | undefined
  >;
  let m = g[KEY_STORE_REGISTRY];
  if (!m) {
    m = new Map();
    (globalThis as unknown as Record<string, GlobalStoreRegistry>)[
      KEY_STORE_REGISTRY
    ] = m;
  }
  return m;
}

/**
 * 将 store 注册到全局，供 code-split 后的 chunk 通过 getGlobalStore(key) 取到同一引用。
 * 不迁移 store 内部状态，仅共享引用；在 main（或任意先执行的 bundle）里调用即可。
 *
 * @param key - 唯一 key，如 "theme"、"app"
 * @param store - createStore 返回的 [getter, setter] 或带 getters/actions 的元组
 */
export function setGlobalStore(key: string, store: unknown): void {
  getGlobalStoreRegistry().set(key, store);
}

/** 默认 store 槽位 key，createStore 自动注册时使用，getGlobalStore() 无参时取此槽位 */
export const DEFAULT_STORE_KEY = "__view_default_store";

/**
 * 从全局注册表取 store；code-split 下 chunk 内调用可拿到 main 里 createStore 注册的同一实例。
 *
 * @param key - 可选，不传则取默认槽位（createStore 自动注册的 store）
 * @returns 已注册的 store，未注册时为 undefined
 */
export function getGlobalStore(key?: string): unknown {
  const k = key ?? DEFAULT_STORE_KEY;
  return getGlobalStoreRegistry().get(k);
}
