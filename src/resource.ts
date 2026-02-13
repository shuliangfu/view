/**
 * @module @dreamer/view/resource
 * @description
 * 异步数据源（Resource）：基于 Promise 的 getter，在 effect/组件中调用返回 { data, loading, error, refetch }，Promise 完成时自动触发依赖更新。
 *
 * **本模块导出：**
 * - `createResource(fetcher)`：无 source，单次或手动 refetch
 * - `createResource(source, fetcher)`：source 变化时自动重新请求
 * - 类型：`ResourceResult<T>`（data、loading、error、refetch）
 *
 * **与 Suspense：** resource().loading 时可用 Suspense 的 fallback 显示加载态；有 data 时显示内容。
 *
 * @example
 * import { createResource } from "jsr:@dreamer/view/resource";
 * const [id, setId] = createSignal(1);
 * const user = createResource(id, (id) => fetch(`/api/user/${id}`).then((r) => r.json()));
 * createEffect(() => { const { data, loading } = user(); if (data) console.log(data); });
 */

import { createEffect } from "./effect.ts";
import { createSignal, markSignalGetter } from "./signal.ts";

/**
 * Resource 的只读状态，由 createResource 返回的 getter() 得到。
 */
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

type ResourceState<T> = Pick<ResourceResult<T>, "data" | "loading" | "error">;

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
export function createResource<T>(
  fetcher: () => Promise<T>,
): () => ResourceResult<T>;

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
export function createResource<S, T>(
  source: () => S,
  fetcher: (source: S) => Promise<T>,
): () => ResourceResult<T>;

export function createResource<S, T>(
  sourceOrFetcher: (() => S) | (() => Promise<T>),
  maybeFetcher?: (source: S) => Promise<T>,
): () => ResourceResult<T> {
  const hasSource = typeof maybeFetcher === "function";
  const source = hasSource
    ? (sourceOrFetcher as () => S)
    : ((): undefined => undefined);
  const fetcher = hasSource
    ? (maybeFetcher as (source: S) => Promise<T>)
    : (sourceOrFetcher as () => Promise<T>);

  const [getState, setState] = createSignal<ResourceState<T>>({
    data: undefined,
    loading: false,
    error: undefined,
  });

  /** 当前执行请求的函数，由 effect 写入，refetch 调用 */
  const runRef: { current: () => void } = { current: () => {} };

  /** effect dispose 或重新运行后置为 -1，Promise 回调仅当 gen === generation 时才 setState，避免 unmount/旧 run 后误更新 */
  let generation = 0;
  createEffect(() => {
    const gen = ++generation;
    const s = source();
    runRef.current = () => {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      Promise.resolve(fetcher(s as S))
        .then((value) => {
          if (gen !== generation) return;
          setState({ data: value, loading: false, error: undefined });
        })
        .catch((e) => {
          if (gen !== generation) return;
          setState((prev) => ({ ...prev, loading: false, error: e }));
        });
    };
    runRef.current();
    return () => {
      generation = -1;
    };
  });

  const getter = (): ResourceResult<T> => {
    const s = getState();
    return { ...s, refetch: () => runRef.current() };
  };
  return markSignalGetter(getter) as () => ResourceResult<T>;
}
