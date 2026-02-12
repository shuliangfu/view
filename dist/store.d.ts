/**
 * @dreamer/view/store — 按需导入
 *
 * createStore：将对象变为嵌套响应式（Proxy），任意层级读写都会登记依赖/通知订阅。
 * 支持 actions（方法可互相调用、可读 state）、持久化（如 localStorage）。
 */
/**
 * 持久化存储类型：用户自配 storage 时实现此接口即可
 *
 * 需实现 getItem(key)、setItem(key, value)，可选 removeItem(key)。
 * 不传 persist.storage 时默认使用 globalThis.localStorage（若存在）；
 * 传入则完全使用用户提供的实例，可自定义存储位置（如 sessionStorage、内存、IndexedDB 壳等）。
 */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem?(key: string): void;
}
/** 持久化配置：key 必填；storage 由用户配置，不传则回退到 localStorage（若存在） */
export interface PersistOptions<T extends Record<string, unknown>> {
    /** 存储键名（在 storage 中使用的 key，用户可据此自定义存储位置或前缀） */
    key: string;
    /**
     * 存储实现：实现 {@link StorageLike} 类型（getItem/setItem/可选 removeItem）即可自定义存储位置
     * 不传时使用 globalThis.localStorage（不存在则不持久化）；传入则仅使用该 storage
     */
    storage?: StorageLike | null;
    /** 序列化，默认 JSON.stringify */
    serialize?: (state: T) => string;
    /** 反序列化，默认 JSON.parse */
    deserialize?: (raw: string) => T;
}
/**
 * getters：与 state 平级，每个 getter 为 (get) => value，内部通过 get() 读 state，返回值由 createMemo 缓存并响应式更新
 */
export type StoreGetters<T extends Record<string, unknown>> = Record<string, (get: () => T) => unknown>;
/**
 * actions：与 state 平级，每个 action 为 (get, set, ...args) => unknown，调用时由 createStore 注入 get/set
 */
export type StoreActions<T extends Record<string, unknown>> = Record<string, (get: () => T, set: (value: T | ((prev: T) => T)) => void, ...args: unknown[]) => unknown>;
/** createStore 的配置：state 必填，getters / actions / persist 与 state 平级 */
export interface CreateStoreConfig<T extends Record<string, unknown>, G extends StoreGetters<T> = StoreGetters<T>, A extends StoreActions<T> = StoreActions<T>> {
    /** 初始状态（会被浅拷贝，可嵌套） */
    state: T;
    /** 派生只读：每个 getter(get) => value，在 effect 中使用会随 state 响应式更新 */
    getters?: G;
    /** 方法：(get, set, ...args) => unknown，调用时自动注入 get/set */
    actions?: A;
    /** 持久化：初始化时从 storage 恢复，每次 set 后写入 */
    persist?: PersistOptions<T>;
}
/**
 * 创建响应式 store（嵌套 Proxy，与 createEffect 协作）
 *
 * 配置为单对象：state 必填，getters / actions / persist 与 state 平级。
 * - getters：{ name(get) { return get().xxx; } }，内部用 createMemo 缓存
 * - actions：{ method1(get, set, ...args) { } }，调用时自动注入 get/set
 *
 * @example
 * const [get, set] = createStore({ state: { count: 0 } });
 *
 * @example
 * const [get, set, actions] = createStore({
 *   state: { count: 0 },
 *   actions: {
 *     increment(get, set) { set({ ...get(), count: get().count + 1 }); },
 *     reset(get, set) { set({ ...get(), count: 0 }); },
 *   },
 * });
 *
 * @example
 * const [get, set, getters] = createStore({
 *   state: { count: 0, name: "" },
 *   getters: {
 *     double(get) { return get().count * 2; },
 *     greeting(get) { return `Hi, ${get().name}`; },
 *   },
 * });
 *
 * @example
 * const [get, set] = createStore({ state: { name: "" }, persist: { key: "user" } });
 */
export declare function createStore<T extends Record<string, unknown>>(config: CreateStoreConfig<T> & {
    getters?: undefined;
    actions?: undefined;
}): [getter: () => T, setter: (value: T | ((prev: T) => T)) => void];
export declare function createStore<T extends Record<string, unknown>, G extends StoreGetters<T>>(config: CreateStoreConfig<T, G> & {
    getters: G;
    actions?: undefined;
}): [
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
    getters: {
        [K in keyof G]: () => ReturnType<G[K]>;
    }
];
export declare function createStore<T extends Record<string, unknown>, A extends StoreActions<T>>(config: CreateStoreConfig<T, StoreGetters<T>, A> & {
    getters?: undefined;
    actions: A;
}): [
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
    actions: {
        [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]>;
    }
];
export declare function createStore<T extends Record<string, unknown>, G extends StoreGetters<T>, A extends StoreActions<T>>(config: CreateStoreConfig<T, G, A> & {
    getters: G;
    actions: A;
}): [
    getter: () => T,
    setter: (value: T | ((prev: T) => T)) => void,
    getters: {
        [K in keyof G]: () => ReturnType<G[K]>;
    },
    actions: {
        [K in keyof A]: (...args: unknown[]) => ReturnType<A[K]>;
    }
];
//# sourceMappingURL=store.d.ts.map