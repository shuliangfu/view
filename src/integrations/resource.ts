/**
 * @module integrations/resource
 * @description 异步资源加载模块 - createResource 实现。
 *
 * **支持的功能：**
 * - ✅ createResource() - 创建异步资源
 * - ✅ loading/error/data 状态管理
 * - ✅ 依赖追踪 (source 变化自动重新加载)
 * - ✅ mutate() - 手动修改数据
 * - ✅ refetch() - 手动重新请求
 * - ✅ 与 Suspense 集成 (registerForSuspense)
 * - ✅ SSR 支持 (registerSSRPromise)
 *
 * **核心机制：**
 * - 信号状态管理 (loading/data/error)
 * - 依赖源 (source) 变化自动触发
 * - 与 Suspense 的 loading 状态同步
 *
 * **范围说明：**
 * - 重试/HTTP 缓存/请求去重可在 fetch 层或封装 `createResource` 的上层策略实现；Suspense 注册见 `ensureSuspenseRegistration`。
 *
 * @usage
 * const user = createResource(userId, fetchUser) // 放在 Suspense 外；勿在父组件 return 里直接 user()（会订阅 data 导致整组件重跑、重复 createResource）
 * <Suspense fallback={<Loading/>}>
 *   <UserCard user={user} />
 * </Suspense>
 */

import { createEffect } from "../reactivity/effect.ts";
import { createSignal, untrack } from "../reactivity/signal.ts";
import { registerSSRPromise } from "../runtime/ssr-promises.ts";
import { registerForSuspense } from "../runtime/suspense.ts";
import { batch } from "../scheduler/batch.ts";

/**
 * 将资源的 `loading` 订阅挂到当前 Suspense 边界；若边界尚未挂载则下一微任务重试。
 * **每次 `load()` 都必须调用**：`ErrorBoundary` 恢复子树时会销毁并新建 `Suspense`，
 * 仅在 `createResource` 初始化时注册一次会导致新边界永远收不到 `loading`，界面不显示 fallback 但请求仍在进行。
 */
function ensureSuspenseRegistration(loadingFn: () => boolean): void {
  if (!registerForSuspense(loadingFn)) {
    queueMicrotask(() => {
      registerForSuspense(loadingFn);
    });
  }
}

/**
 * 资源对象接口：它本身是一个函数（用于获取数据），同时挂载了状态和方法。
 */
export interface Resource<T> {
  /** 获取当前数据 */
  (): T | undefined;
  /** 是否正在加载 */
  loading: () => boolean;
  /** 错误信息 */
  error: () => unknown;
  /** 手动修改本地数据 */
  mutate: (v: T | undefined) => void;
  /** 重新发起请求 */
  refetch: () => Promise<void>;
}

/**
 * 创建一个异步资源。
 * @param fetcher 异步请求函数
 */
export function createResource<T>(
  fetcher: () => Promise<T>,
): Resource<T>;
/**
 * 创建一个带依赖的异步资源。
 * @param source 依赖源（可以是信号 getter）
 * @param fetcher 异步请求函数，接收依赖源的值
 */
export function createResource<T, S>(
  source: S | (() => S),
  fetcher: (source: S) => Promise<T>,
): Resource<T>;
export function createResource<T, S>(
  sourceOrFetcher: S | (() => S) | (() => Promise<T>),
  maybeFetcher?: (source: S) => Promise<T>,
): Resource<T> {
  let _source: () => S;
  let _fetcher: (source: S) => Promise<T>;

  if (arguments.length === 1) {
    _fetcher = sourceOrFetcher as unknown as (source: S) => Promise<T>;
    _source = () => true as unknown as S;
  } else {
    _source = typeof sourceOrFetcher === "function"
      ? (sourceOrFetcher as () => S)
      : () => sourceOrFetcher as S;
    _fetcher = maybeFetcher!;
  }

  const [data, setData] = createSignal<T | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<unknown>(null);

  ensureSuspenseRegistration(loading);

  /** 递增以丢弃已过期的异步结果（快速切换 source 时避免旧请求写回） */
  let loadGeneration = 0;

  const load = (source?: S) => {
    const s = source !== undefined ? source : _source();
    if (s === null || s === false) {
      setLoading(false);
      return;
    }

    const myGen = ++loadGeneration;
    setLoading(true);
    setError(null);
    // 新一次请求前清空数据，避免 UI 仍显示上一份 source 的结果
    setData(() => undefined);
    // 重新挂到当前 Suspense（边界重建后必须再次注册，否则无 fallback）
    ensureSuspenseRegistration(loading);

    const promise = (async () => {
      try {
        const result = await _fetcher(s);
        if (myGen !== loadGeneration) return;
        setData(() => result);
      } catch (e) {
        if (myGen !== loadGeneration) return;
        try {
          batch(() => {
            setError(e);
          });
        } catch (_) {
          // 忽略二次抛出的异常，因为错误已经通过 setError 传出去了
        }
      } finally {
        if (myGen === loadGeneration) {
          setLoading(false);
        }
      }
    })();
    // 只有在服务端才需要收集 promise
    if (typeof globalThis.document === "undefined") {
      registerSSRPromise(promise);
    }
    return promise;
  };

  // 立即开始加载
  untrack(() => load());

  // 核心优化：当依赖源 (source) 变化时，自动触发重新加载
  if (arguments.length > 1) {
    createEffect(() => {
      const s = _source(); // 追踪依赖
      untrack(() => load(s));
    });
  }

  // 构建超级资源对象
  const resource: any = () => {
    ensureSuspenseRegistration(loading);
    if (error()) throw error();
    return data();
  };
  resource.loading = () => {
    ensureSuspenseRegistration(loading);
    return loading();
  };
  resource.error = error;
  resource.mutate = (v: T | undefined) => setData(() => v);
  resource.refetch = load;

  // 确保 resource 对象在被用作信号时也能正常工作
  resource.__VIEW_SIGNAL = true;

  return resource as Resource<T>;
}
