/**
 * View 模板引擎 — Resource（异步数据源）
 *
 * createResource 提供基于 Promise 的异步数据，在 effect/组件中作为 getter 使用，
 * 返回 { data, loading, error, refetch }，Promise 完成时自动触发依赖更新。
 */
/** Resource 的只读状态，由 getter 返回 */
export type ResourceResult<T> = {
    /** 最近一次请求成功时的数据，未完成或失败时为 undefined */
    data: T | undefined;
    /** 当前是否有进行中的请求 */
    loading: boolean;
    /** 最近一次请求的错误，无错误时为 undefined */
    error: unknown;
    /** 手动触发重新请求（沿用当前 source） */
    refetch: () => void;
};
/**
 * 创建无 source 的异步数据源（单次或手动 refetch）
 *
 * @param fetcher 返回 Promise 的请求函数，在 effect 中执行；可被 refetch 再次调用
 * @returns 返回 getter：在 effect/组件中调用 getter() 得到 { data, loading, error, refetch }
 *
 * @example
 * const user = createResource(() => fetch('/api/user').then(r => r.json()));
 * createEffect(() => { const { data, loading } = user(); if (data) console.log(data); });
 */
export declare function createResource<T>(fetcher: () => Promise<T>): () => ResourceResult<T>;
/**
 * 创建带 source 的异步数据源（source 变化时自动重新请求）
 *
 * @param source 响应式 source getter；在 effect 中读取，source() 变化时触发重新请求
 * @param fetcher 接收当前 source 值，返回 Promise；仅在 source 变化或 refetch 时调用
 * @returns 返回 getter：在 effect/组件中调用 getter() 得到 { data, loading, error, refetch }
 *
 * @example
 * const [id, setId] = createSignal(1);
 * const user = createResource(id, (id) => fetch(`/api/user/${id}`).then(r => r.json()));
 */
export declare function createResource<S, T>(source: () => S, fetcher: (source: S) => Promise<T>): () => ResourceResult<T>;
//# sourceMappingURL=resource.d.ts.map