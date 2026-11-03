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
 * - ✅ 可选 AbortSignal：每次 load 向 fetcher 传入 `{ signal }`；source 变化／refetch／外层 options.signal 会 abort 进行中的请求
 * - ✅ createInflightDedupe() - 上层 inflight 去重最小 helper（非 HTTP 缓存）
 * - ✅ 与 Suspense 集成 (registerForSuspense)
 * - ✅ SSR 支持 (registerSSRPromise)
 *
 * **核心机制：**
 * - 信号状态管理 (loading/data/error)
 * - 依赖源 (source) 变化自动触发
 * - 与 Suspense 的 loading 状态同步
 * - loadGeneration + AbortController：丢弃过期结果，并可真正取消 in-flight 工作
 *
 * **范围说明：**
 * - 重试／HTTP 缓存／跨 Resource 去重应在 fetch 层或用 {@link createInflightDedupe} 等上层策略实现；
 *   Suspense 注册见 `ensureSuspenseRegistration`。
 *
 * @usage
 * const user = createResource(userId, (id, { signal }) => fetchUser(id, signal))
 * // 放在 Suspense 外；勿在父组件 return 里直接 user()（会订阅 data 导致整组件重跑、重复 createResource）
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

function isAbortError(e: unknown): boolean {
  if (e == null || typeof e !== "object") return false;
  const name = (e as { name?: string }).name;
  return name === "AbortError";
}

/**
 * 每次 `load` 传给 fetcher 的第二参数。不使用 `signal` 时行为与 2.2 一致。
 */
export interface ResourceFetcherInfo {
  /** 本次加载的 AbortSignal；source 变化、refetch 或外层 `options.signal` abort 时会被中止 */
  signal: AbortSignal;
}

/**
 * `createResource` 可选配置（加法；省略则与现网默认一致）。
 */
export interface CreateResourceOptions {
  /**
   * 外层生命周期 AbortSignal（例如路由离开）。
   * abort 后会取消当前 in-flight load，**不会**写入 `error`。
   */
  signal?: AbortSignal;
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
  /** 重新发起请求（会 abort 上一趟 in-flight） */
  refetch: () => Promise<void>;
}

/**
 * 创建无显式依赖的异步资源（内部依赖常量 `true`）；须放在 `Suspense` 边界内使用。
 * @template T 成功解析的数据类型
 * @param fetcher 返回 Promise 的加载函数；可选第二参 `{ signal }`
 * @param options 可选；`signal` 用于外层取消
 * @returns 可调用的 {@link Resource}
 */
export function createResource<T>(
  fetcher: (
    source: true,
    info: ResourceFetcherInfo,
  ) => Promise<T>,
  options?: CreateResourceOptions,
): Resource<T>;
/**
 * 当 `source`（值或 getter）变化时重新执行 `fetcher`；`source` 为 `null`/`false` 时不请求。
 * @template T 数据类型
 * @template S 依赖类型
 * @param source 依赖或 getter
 * @param fetcher 接收当前依赖值与 {@link ResourceFetcherInfo} 的请求函数
 * @param options 可选；`signal` 用于外层取消
 * @returns {@link Resource}
 */
export function createResource<T, S>(
  source: S | (() => S),
  fetcher: (source: S, info: ResourceFetcherInfo) => Promise<T>,
  options?: CreateResourceOptions,
): Resource<T>;
export function createResource<T, S>(
  sourceOrFetcher:
    | S
    | (() => S)
    | ((source: true, info: ResourceFetcherInfo) => Promise<T>),
  maybeFetcherOrOptions?:
    | ((source: S, info: ResourceFetcherInfo) => Promise<T>)
    | CreateResourceOptions,
  maybeOptions?: CreateResourceOptions,
): Resource<T> {
  let _source: () => S;
  let _fetcher: (source: S, info: ResourceFetcherInfo) => Promise<T>;
  let options: CreateResourceOptions | undefined;

  if (arguments.length === 1) {
    _fetcher = sourceOrFetcher as unknown as (
      source: S,
      info: ResourceFetcherInfo,
    ) => Promise<T>;
    _source = () => true as unknown as S;
  } else if (
    arguments.length === 2 &&
    typeof maybeFetcherOrOptions !== "function"
  ) {
    // fetcher + options（无显式 source）
    _fetcher = sourceOrFetcher as unknown as (
      source: S,
      info: ResourceFetcherInfo,
    ) => Promise<T>;
    _source = () => true as unknown as S;
    options = maybeFetcherOrOptions as CreateResourceOptions | undefined;
  } else {
    _source = typeof sourceOrFetcher === "function"
      ? (sourceOrFetcher as () => S)
      : () => sourceOrFetcher as S;
    _fetcher = maybeFetcherOrOptions as (
      source: S,
      info: ResourceFetcherInfo,
    ) => Promise<T>;
    options = maybeOptions;
  }

  const [data, setData] = createSignal<T | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<unknown>(null);

  ensureSuspenseRegistration(loading);

  /** 递增以丢弃已过期的异步结果（快速切换 source 时避免旧请求写回） */
  let loadGeneration = 0;
  /** 当前 in-flight 的控制器；新 load／外层 abort 时 abort 之 */
  let currentController: AbortController | null = null;
  let removeOuterAbort: (() => void) | null = null;

  const clearOuterAbortListener = () => {
    if (removeOuterAbort) {
      removeOuterAbort();
      removeOuterAbort = null;
    }
  };

  const abortCurrent = () => {
    clearOuterAbortListener();
    if (currentController) {
      currentController.abort();
      currentController = null;
    }
  };

  const load = (source?: S) => {
    const s = source !== undefined ? source : _source();
    if (s === null || s === false) {
      abortCurrent();
      setLoading(false);
      return;
    }

    abortCurrent();
    const controller = new AbortController();
    currentController = controller;

    const outer = options?.signal;
    if (outer) {
      if (outer.aborted) {
        controller.abort();
      } else {
        const onOuterAbort = () => controller.abort();
        outer.addEventListener("abort", onOuterAbort);
        removeOuterAbort = () => {
          outer.removeEventListener("abort", onOuterAbort);
        };
      }
    }

    const myGen = ++loadGeneration;
    setLoading(true);
    setError(null);
    // 新一次请求前清空数据，避免 UI 仍显示上一份 source 的结果
    setData(() => undefined);
    // 重新挂到当前 Suspense（边界重建后必须再次注册，否则无 fallback）
    ensureSuspenseRegistration(loading);

    const info: ResourceFetcherInfo = { signal: controller.signal };

    const promise = (async () => {
      try {
        const result = await _fetcher(s, info);
        if (myGen !== loadGeneration || controller.signal.aborted) return;
        setData(() => result);
      } catch (e) {
        if (
          myGen !== loadGeneration ||
          controller.signal.aborted ||
          isAbortError(e)
        ) {
          // 取消：不写入 error，保持与「未失败」一致
          return;
        }
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
          if (currentController === controller) {
            clearOuterAbortListener();
            currentController = null;
          }
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
  // 注意：无显式 source 的 overload（仅 fetcher，或 fetcher+options）不挂 effect
  const hasExplicitSource =
    arguments.length >= 2 && typeof maybeFetcherOrOptions === "function";
  if (hasExplicitSource) {
    createEffect(() => {
      const s = _source(); // 追踪依赖
      untrack(() => load(s));
    });
  }

  // 外层 signal：若在创建后 abort，取消当前请求（上面 load 内 per-load listener 已覆盖；
  // 另加一次长期监听，确保 abort 发生在两次 load 之间也能清 loading）
  if (options?.signal && !options.signal.aborted) {
    options.signal.addEventListener("abort", () => {
      abortCurrent();
      setLoading(false);
    }, { once: true });
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

/**
 * 上层「inflight 去重」最小 helper：同一 `key` 在 Promise settle 前复用同一个 Promise。
 *
 * **不是** HTTP 缓存／SWR／持久层；不绑定 fetch 实现。
 * 与 AbortSignal 合用时：共享 Promise 的各方应接受「一处 abort 可能影响同 key 共享者」；
 * 需要独立取消时请使用不同 key，或不要对该请求去重。
 *
 * @example
 * ```ts
 * import { createInflightDedupe, createResource } from "@dreamer/view/resource";
 *
 * const inflight = createInflightDedupe();
 * const user = createResource(
 *   () => userId(),
 *   (id, { signal }) =>
 *     inflight(`user:${id}`, () =>
 *       fetch(`/api/user/${id}`, { signal }).then((r) => r.json())
 *     ),
 * );
 * ```
 */
export function createInflightDedupe(): <T>(
  key: string,
  run: () => Promise<T>,
) => Promise<T> {
  const map = new Map<string, Promise<unknown>>();
  return function inflight<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = map.get(key);
    if (existing) return existing as Promise<T>;
    let p: Promise<T>;
    try {
      p = Promise.resolve(run()).finally(() => {
        if (map.get(key) === p) map.delete(key);
      });
    } catch (e) {
      return Promise.reject(e);
    }
    map.set(key, p);
    return p;
  };
}
