/**
 * View 模板引擎 — Effect（副作用）。执行用户函数时登记所读到的 signal 为依赖；signal 变更时自动重新执行 effect。支持 EffectScope，unmount 时统一清理。
 *
 * @module @dreamer/view/effect
 * @packageDocumentation
 *
 * **导出函数：** `createEffect`、`createRenderEffect`（依赖更新时同步/batch 末执行，非微任务）、`createMemo`、`children`（`props.children` / 子内容 memo 化，等价 `createMemo`）、`createDeferred`（派生值推迟到下一动画帧或 `queueMicrotask` 回退）、`createReaction`（同类方案 次级原语）、`catchError`（子 computation 抛错分发到 `onError`）、`untrack`、`on`（显式依赖，同类方案 同向）、`onCleanup`、`onMount`（首帧后微任务执行一次）、`setCurrentScope`、`getCurrentScope`、`runWithScope`、`getOwner`、`setOwner`、`runWithOwner`（同类方案 命名别名）、`createScopeWithDisposers`、`createRunDisposersCollector`
 *
 * **导出类型：** `EffectScope`、`Owner`（≡ `EffectScope`）、`CreateEffectOptions`、`CreateMemoOptions`、`OnOptions`
 *
 * `runWithScope` / `getCurrentScope` / `setCurrentScope` / `createScopeWithDisposers` 与 `runWithOwner`、手动 Owner 同向，供插件、测试或 `createRoot` 外托管子 effect；`createRunDisposersCollector` 主要由运行时与路由页使用。一般业务只需 `createEffect` / `createMemo` / `onCleanup` / `untrack`；需 **只订阅部分依赖** 时用 `createEffect(on(() => a.value, (v) => { … }))`。需 **读即同步提交 DOM 等** 时用 `createRenderEffect`（与 `createRenderEffect` 同向；普通 `createEffect` 仍走微任务批处理）。
 */

import { markRenderEffectRun, unschedule } from "./scheduler.ts";
import {
  createSignal,
  getCurrentEffect,
  markSignalGetter,
  setCurrentEffect,
  untrackReads,
  writeSignalForceNotify,
  writeSignalValueRaw,
} from "./signal.ts";
import type { EffectDispose } from "./types.ts";

/** 清理链表节点（4.2 effect 清理链表：避免数组扩容与多次小数组分配） */
type CleanupNode = { readonly fn: () => void; next: CleanupNode | null };

type EffectRunWithSubs = (() => void) & {
  _subscriptionSets?: Set<() => void>[];
  /** 本 effect 登记的清理函数链表头，下次运行前或 dispose 时统一执行 */
  _cleanupHead?: CleanupNode | null;
  /** 链表尾，便于 O(1) 追加 */
  _cleanupTail?: CleanupNode | null;
};

/**
 * Effect 作用域：由 createRoot 在挂载时设置，用于在 unmount 时统一回收该根下所有 effect 的 disposer。
 */
export type EffectScope = { addDisposer(dispose: () => void): void };

/**
 * **`Owner`** 同向类型别名：本运行时以 {@link EffectScope} 承载 dispose 树（`addDisposer`），
 * 与 `Owner` 在「子 effect 归属与统一清理」上一致，细节实现不必一一对应。
 */
export type Owner = EffectScope;

let currentScope: EffectScope | null = null;

/**
 * 设置当前 effect 作用域：`createEffect` 返回的 dispose 会登记到 `scope.addDisposer`（若 scope 非 null）。
 * `createRoot` / `hydrate` 在挂载 `fn(container)` 期间会设置；业务侧**优先**用 {@link runWithScope} 临时切换，避免忘记在 `finally` 里恢复。
 *
 * @param scope - 要设置的作用域，或 `null` 表示清除
 */
export function setCurrentScope(scope: EffectScope | null): void {
  currentScope = scope;
}

/**
 * 返回当前由 {@link setCurrentScope} 设置的 effect 作用域（无则 `null`）。
 *
 * @returns 当前作用域，或 `null`
 */
export function getCurrentScope(): EffectScope | null {
  return currentScope;
}

/**
 * 在指定作用域下同步执行 `fn`，执行前后保存/恢复 {@link getCurrentScope}（与同类方案 `runWithOwner(owner, fn)` 同向）。
 * 用于在 `createRoot` 之外创建子树，并把其内 `createEffect` 的 dispose 挂到自定义 `createScopeWithDisposers()` 上，便于统一 `runDisposers()`。
 * `fn` 抛错时仍会在 `finally` 中恢复外层 scope。
 *
 * @param scope - 子段要使用的 scope；`null` 表示在「无 scope」上下文中执行（与 `setCurrentScope(null)` 一致）
 * @param fn - 在 scope 激活期间执行的函数
 * @returns `fn()` 的返回值
 */
export function runWithScope<T>(scope: EffectScope | null, fn: () => T): T {
  const prev = currentScope;
  setCurrentScope(scope);
  try {
    return fn();
  } finally {
    setCurrentScope(prev);
  }
}

/**
 * **`getOwner()`** 别名：等价于 {@link getCurrentScope}。
 *
 * @returns 当前 `Owner`（即 {@link EffectScope}），无则 `null`
 */
export function getOwner(): Owner | null {
  return getCurrentScope();
}

/**
 * **`setOwner(owner)`** 别名：等价于 {@link setCurrentScope}。
 *
 * @param owner - 要激活的 `Owner`，或 `null` 清除
 */
export function setOwner(owner: Owner | null): void {
  setCurrentScope(owner);
}

/**
 * **`runWithOwner(owner, fn)`** 别名：等价于 {@link runWithScope}。
 *
 * @param owner - 子段 `Owner`
 * @param fn - 在 owner 激活期间执行
 * @returns `fn()` 的返回值
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  return runWithScope(owner, fn);
}

/**
 * 创建「带 `runDisposers` 的 effect 作用域」：与 {@link createRunDisposersCollector} 的 scope 形态一致，
 * 供 route-page、手写生命周期或与 {@link runWithScope} 组合使用；`runDisposers()` 会调用本 scope 内登记的全部 dispose。
 *
 * @param disposers - 可选，外部传入的数组则复用（供 createRunDisposersCollector 使用）；不传则新建
 * @returns 具 `addDisposer` 与 `runDisposers` 的 scope，`runDisposers()` 执行后清空列表
 */
export function createScopeWithDisposers(
  disposers?: Array<() => void>,
): EffectScope & { runDisposers(): void } {
  const list = disposers ?? [];
  return {
    addDisposer(d: () => void) {
      list.push(d);
    },
    runDisposers() {
      list.forEach((d) => d());
      list.length = 0;
    },
  };
}

/**
 * 创建「按轮收集子 effect disposer」的收集器，供 createRoot / hydrate 复用。
 * 根 effect 每次 run 时先执行上一轮收集的 disposers、清空，再设置本轮 scope，避免子 effect 堆积。
 *
 * @returns runDisposers 数组（unmount 时需执行）与 getScopeForRun()（根每次 run 时调用，返回本轮 scope）
 * @internal 仅由 runtime（主包）与 runtime-csr（csr/hybrid 共用）使用
 */
export function createRunDisposersCollector(): {
  runDisposers: Array<() => void>;
  /** 根 effect 每次 run 时调用：执行上一轮 disposers、清空，并返回本轮应设置的 scope */
  getScopeForRun(): EffectScope;
} {
  const runDisposers: Array<() => void> = [];
  return {
    runDisposers,
    getScopeForRun() {
      runDisposers.forEach((d) => d());
      runDisposers.length = 0;
      return createScopeWithDisposers(runDisposers);
    },
  };
}

/**
 * `catchError` 在子 {@link EffectScope} 上挂载的元数据（WeakMap，不污染 scope 对象）。
 */
type CatchErrorMeta = {
  /** 本层 `onError` */
  onError: (err: unknown) => void;
  /**
   * 内层 `onError` 若再抛错，下一个应尝试的「含 catchError 的 scope」；
   * 为 `null` 表示本层为最外层 catch。
   */
  parentCatchScope: EffectScope | null;
};

const catchErrorMetaByScope = new WeakMap<EffectScope, CatchErrorMeta>();

/**
 * 从 `effect` 登记时的 `scope` 起，沿 `catchError` 链分发错误；某一层的 `onError` 正常返回则视为已处理。
 * 若 `onError` 再抛错，则对 **上一层** `catchError` 继续尝试（与同类方案 再抛传播一致）。
 *
 * @param startScope - {@link createEffect} 登记 dispose 时捕获的 scope（常为 `catchError` 创建的子 scope）
 * @param err - 原始或上一层 `onError` 抛出的错误
 * @returns 是否已被某层 `onError` 消费（未再向外抛）
 */
function dispatchCatchError(
  startScope: EffectScope | null,
  err: unknown,
): boolean {
  let target: EffectScope | null = startScope;
  let current = err;
  while (target != null) {
    const meta = catchErrorMetaByScope.get(target);
    if (meta != null) {
      try {
        meta.onError(current);
        return true;
      } catch (e) {
        current = e;
        target = meta.parentCatchScope;
        continue;
      }
    }
    return false;
  }
  return false;
}

/**
 * **`catchError(tryFn, onError)`** 同向：在 `tryFn` 执行期间建立子 {@link EffectScope} 并挂上 `onError`；
 * 其内创建的 `createEffect` / `createMemo` / `createRenderEffect` 在 **任意次 `run`** 中抛错会交给 `onError`（及外层嵌套的 `catchError`）。
 *
 * - **须有宿主 scope**：应在 {@link createRoot} / `runWithScope` 等已设置 {@link getCurrentScope} 的上下文中调用，以便在宿主 dispose 时连带清理子 scope 与 meta；否则子 effect 无法挂 dispose，且仅能对 `tryFn` **同步**抛错调用 `onError`。
 * - **无当前 scope** 时：退化为对 `tryFn` 的同步 `try/catch`，不创建子 scope（与同类方案 在无双亲 Owner 时行为同向：无法捕获异步 effect）。
 *
 * @param tryFn - 可能创建子 effect 的同步段
 * @param onError - 收到错误时调用；可再 `throw` 交给外层 `catchError`
 * @returns `tryFn()` 的返回值；若同步抛错且被 `onError` 吃掉则返回 `undefined`（与 TypeScript 常见用法一致）
 *
 * @example
 * ```ts
 * createRoot((el) => {
 *   catchError(
 *     () => {
 *       createEffect(() => {
 *         if (bad.value) throw new Error("x");
 *       });
 *     },
 *     (e) => console.error(e),
 *   );
 * }, container);
 * ```
 */
export function catchError<T>(
  tryFn: () => T,
  onError: (err: unknown) => void,
): T {
  const host = currentScope;
  if (host == null) {
    try {
      return tryFn();
    } catch (e) {
      onError(e);
      return undefined as T;
    }
  }

  const inner = createScopeWithDisposers();
  const parentCatchScope = catchErrorMetaByScope.has(host) ? host : null;
  catchErrorMetaByScope.set(inner, { onError, parentCatchScope });

  const teardown = (): void => {
    catchErrorMetaByScope.delete(inner);
    inner.runDisposers();
  };
  host.addDisposer(teardown);

  return runWithScope(inner, () => {
    try {
      return tryFn();
    } catch (e) {
      if (!dispatchCatchError(inner, e)) throw e;
      return undefined as T;
    }
  });
}

/**
 * 不登记依赖地执行函数：在 fn 内读到的 signal 不会把当前 effect 登记为订阅者。
 * 用于「只读一次、不随其变化重跑」的场景，例如判断是否有 loading 再启动定时器。
 *
 * @param fn - 要执行的函数
 * @returns fn 的返回值
 *
 * @example
 * createEffect(() => {
 *   const hasLoading = untrack(() => props.match.loading);
 *   if (hasLoading) startTimer(); // effect 不会因 props 重跑
 * });
 */
export function untrack<T>(fn: () => T): T {
  const prev = getCurrentEffect();
  setCurrentEffect(null);
  try {
    return fn();
  } finally {
    setCurrentEffect(prev);
  }
}

/**
 * {@link on} 的可选配置（与 第三参同向）。
 */
export type OnOptions = {
  /**
   * 为 `true` 时：作为 `createEffect` 的回调执行时 **第一次** 只建立依赖、**不**调用 `fn`，
   * 直至依赖随后再次变化才执行（避免挂载期副作用）。
   */
  defer?: boolean;
};

/**
 * 单依赖版 `on`：返回可供 `createEffect` / `createMemo` 传入的零参函数。
 *
 * @param dep - 依赖 accessor，其内对 signal 的读取会登记到外层 computation
 * @param fn - 在 {@link untrack} 中调用；回调内读其它 signal **不会**成为外层 effect 的依赖
 * @param options - 可选；`defer` 跳过首次 `fn` 调用
 */
function onSingle<T, U>(
  dep: () => T,
  fn: (input: T, prevInput: T | undefined, prevResult: U | undefined) => U,
  options?: OnOptions,
): () => U | undefined {
  let prevInput: T | undefined;
  let prevResult: U | undefined;
  /** 与同类方案 一致：仅首轮 effect 可能因 defer 跳过 `fn` */
  let deferPending = options?.defer === true;

  return (): U | undefined => {
    const input = dep();
    const prevIn = prevInput;
    prevInput = input;

    if (deferPending) {
      deferPending = false;
      return undefined;
    }

    const result = untrack(() => fn(input, prevIn, prevResult));
    prevResult = result;
    return result;
  };
}

/**
 * 多依赖版 `on`：`deps` 中每个 accessor 都会在同一轮被求值以收集订阅。
 *
 * @param deps - 非空的 accessor 列表（空数组则每轮 `input` 为 `[]`）
 * @param fn - `input` / `prevInput` 为与各 accessor 当前/上一轮值对齐的数组
 * @param options - 可选；`defer` 跳过首次 `fn`
 */
function onMany<U>(
  deps: readonly (() => unknown)[],
  fn: (
    input: unknown[],
    prevInput: unknown[] | undefined,
    prevResult: U | undefined,
  ) => U,
  options?: OnOptions,
): () => U | undefined {
  let prevInput: unknown[] | undefined;
  let prevResult: U | undefined;
  let deferPending = options?.defer === true;

  return (): U | undefined => {
    const input = deps.map((d) => d());
    const prevIn = prevInput;
    prevInput = input;

    if (deferPending) {
      deferPending = false;
      return undefined;
    }

    const result = untrack(() => fn(input, prevIn, prevResult));
    prevResult = result;
    return result;
  };
}

/**
 * 显式依赖包装器（与 常见响应式文档「Reactive utilities / on」同向）：
 * 传入 `createEffect` / `createMemo` 时，**仅** `dep(s)` 内读取的响应式源会触发重跑；`fn` 在 {@link untrack} 中执行，其内部读取不额外订阅。
 *
 * - 单依赖：`on(() => s.value, (v, prevV, prevRet) => …)`
 * - 多依赖：`on([() => a.value, () => b.value], (vs, prevVs, prevRet) => …)`
 * - `defer: true`：外层 computation 的 **首次** 运行不调用 `fn`（仍读取依赖以订阅）
 *
 * @param deps - 单 accessor，或 accessor 组成的只读元组/数组
 * @param fn - 依赖更新时调用；第三参 `prevResult` 为上一轮 `fn` 的返回值（首轮为 `undefined`）
 * @param options - 可选配置
 * @returns 无参函数，供传入 `createEffect` / `createMemo`
 *
 * @example
 * createEffect(on(() => count.value, (n) => console.log(n, other.value))); // `other` 在 `fn` 内读不订阅
 */
export function on<T, U = void>(
  deps: () => T,
  fn: (input: T, prevInput: T | undefined, prevResult: U | undefined) => U,
  options?: OnOptions,
): () => U | undefined;
export function on<U = void>(
  deps: readonly (() => unknown)[],
  fn: (
    input: unknown[],
    prevInput: unknown[] | undefined,
    prevResult: U | undefined,
  ) => U,
  options?: OnOptions,
): () => U | undefined;
// 实现签名用 any，避免与「单依赖 / 数组依赖」两条重载在 strict 下互不兼容（对外类型仍由重载提供）。
export function on(
  deps: (() => unknown) | readonly (() => unknown)[],
  // deno-lint-ignore no-explicit-any
  fn: any,
  options?: OnOptions,
  // deno-lint-ignore no-explicit-any
): any {
  if (Array.isArray(deps)) {
    return onMany(deps, fn as Parameters<typeof onMany>[1], options);
  }
  return onSingle(
    deps as () => unknown,
    fn as Parameters<typeof onSingle>[1],
    options,
  );
}

/**
 * 在当前 effect 内登记清理函数。
 * 清理函数会在该 effect 下次重新执行前、或 effect 被 dispose 时统一执行。
 * 仅在 createEffect(fn) 的 fn 执行过程中调用有效。
 *
 * @param cb - 清理函数（如取消订阅、移除监听器等）
 *
 * @example
 * createEffect(() => {
 *   const id = setInterval(() => {}, 1000);
 *   onCleanup(() => clearInterval(id));
 * });
 */
export function onCleanup(cb: () => void): void {
  const run = getCurrentEffect() as EffectRunWithSubs | null;
  if (run == null) return;
  const node: CleanupNode = { fn: cb, next: null };
  if (run._cleanupHead == null) {
    run._cleanupHead = run._cleanupTail = node;
  } else {
    run._cleanupTail!.next = node;
    run._cleanupTail = node;
  }
}

/**
 * **`onMount`** 同向：在当前 computation（`createEffect` / `createMemo` 内部 effect）的**同步段结束后**
 * 通过 `queueMicrotask` 执行一次 `fn`；本运行时无独立「提交渲染」阶段，微任务近似于「首帧 paint 之后」。
 *
 * - `fn` 在 `untrackReads` 中调用，其内读 signal **不会**成为外层 effect 的依赖；同时仍保留当前 effect，故 `fn` 内可调用 {@link onCleanup} 并登记到本 effect。
 * - 执行 `fn` 时临时将 {@link getCurrentEffect} 置为当前 effect，便于嵌套 {@link createEffect} 等行为与同步段一致。
 * - `fn` 若返回函数，则作为 **mount 清理**：在 effect **下次重跑前**或 **dispose** 时调用（与本调用登记的 `onCleanup` 一并触发）。
 * - effect 若在微任务派发**之前**被清理或重跑，则待执行的 `fn` **不会**执行；重跑会先取消上一轮未执行的 mount、并调用上一轮返回的 mount 清理。
 *
 * 须在 {@link createEffect} / {@link createMemo} 的回调执行过程中调用（与 {@link onCleanup} 相同前提）；无当前 effect 时静默忽略。
 *
 * @param fn - 挂载后执行一次；可返回清理函数
 *
 * @example
 * ```ts
 * createEffect(() => {
 *   const [n, setN] = createSignal(0);
 *   onMount(() => {
 *     const id = setInterval(() => setN((x) => x + 1), 1000);
 *     return () => clearInterval(id);
 *   });
 * });
 * ```
 */
export function onMount(fn: () => void | (() => void)): void {
  const run = getCurrentEffect() as EffectRunWithSubs | null;
  if (run == null) return;

  /** effect 重跑或 dispose 后置 true，使尚未执行的微任务跳过 `fn` */
  let cancelled = false;
  /** `fn()` 返回的清理函数，在下一轮 effect 清理或 dispose 时调用 */
  let mountDispose: (() => void) | undefined;

  onCleanup(() => {
    cancelled = true;
    mountDispose?.();
    mountDispose = undefined;
  });

  queueMicrotask(() => {
    if (cancelled) return;
    const prev = getCurrentEffect();
    setCurrentEffect(run);
    try {
      const ret = untrackReads(fn);
      if (typeof ret === "function") {
        mountDispose = ret;
      }
    } finally {
      setCurrentEffect(prev);
    }
  });
}

/** 顺序执行清理链表并清空（4.2 链表实现） */
function runCleanups(run: EffectRunWithSubs): void {
  let n = run._cleanupHead;
  run._cleanupHead = run._cleanupTail = null;
  while (n) {
    n.fn();
    n = n.next;
  }
}

/**
 * createEffect 的可选配置：scope 用于将本 effect 的 disposer 登记到指定作用域，
 * 而非当前 effect 的 run scope。RoutePage 等需「与 path 绑定的长生命周期」时传入，避免根重跑时被误 dispose。
 */
export type CreateEffectOptions = {
  scope?: EffectScope;
};

/**
 * `createMemo` 可选配置（与 第三参 `options` 同向）。
 */
export type CreateMemoOptions<T> = {
  /**
   * - `false`：每次依赖更新后**始终**通知 memo 订阅者，即便 `fn()` 结果与缓存 `Object.is` 为真（同类方案 语义）。
   * - 函数：返回 `true` 表示相等，**不**写入底层 signal、不通知订阅者；首帧不调用。
   */
  equals?: false | ((prev: T, next: T) => boolean);
};

/**
 * `createDeferred` 可选配置（与 第二参 `options` 同向：初始值与 `equals`）。
 */
export type CreateDeferredOptions<T> = {
  /**
   * 在首次推迟提交之前，`accessor` 的返回值；不传则首段为 `undefined`，直至第一次 `requestAnimationFrame`（或 `queueMicrotask` 回退）提交 `source()`。
   */
  initialValue?: T;
  /**
   * 与 {@link CreateMemoOptions} 中 `equals` 相同：控制推迟写入时是否跳过「相等」的更新。
   */
  equals?: false | ((prev: T, next: T) => boolean);
};

/**
 * `createEffect` / {@link createRenderEffect} 共用实现：`syncNotify` 为 true 时由调度器对 `run` 走同步通知路径（见 `notifyEffectSubscriber`）。
 *
 * @param fn - 副作用函数，可返回清理函数（可选）
 * @param opts - 可选；scope 指定登记 disposer 的作用域
 * @param syncNotify - 为 true 时等价 `createRenderEffect` 的通知语义
 * @returns dispose 函数
 */
function createEffectImpl(
  fn: () => void | (() => void),
  opts: CreateEffectOptions | undefined,
  syncNotify: boolean,
): EffectDispose {
  /** 登记 dispose 与 {@link dispatchCatchError} 共用，须在 `run` 闭包前确定 */
  const scope = opts?.scope ?? currentScope;
  let disposed = false;
  const run = (): void => {
    if (disposed) return;
    // 若由调度器触发（非首次），先执行上次登记的 cleanups
    runCleanups(run as EffectRunWithSubs);
    // 从上次依赖的所有 signal 订阅列表中移除本 effect，再重新收集
    const subs = (run as EffectRunWithSubs)._subscriptionSets;
    if (subs) {
      for (const s of subs) s.delete(run);
      subs.length = 0;
    }
    (run as EffectRunWithSubs)._cleanupHead =
      (run as EffectRunWithSubs)
        ._cleanupTail =
        null;
    const prev = getCurrentEffect();
    (run as EffectRunWithSubs)._subscriptionSets = [];
    setCurrentEffect(run);
    try {
      const nextDispose = fn();
      if (typeof nextDispose === "function") {
        const r = run as EffectRunWithSubs;
        const node: CleanupNode = { fn: nextDispose, next: null };
        if (r._cleanupHead == null) r._cleanupHead = r._cleanupTail = node;
        else {
          r._cleanupTail!.next = node;
          r._cleanupTail = node;
        }
      }
    } catch (err) {
      /** 与 `catchError` 对齐：按 effect 登记时的 scope 链分发，未处理则继续抛出 */
      if (scope == null || !dispatchCatchError(scope, err)) {
        throw err;
      }
    } finally {
      setCurrentEffect(prev);
    }
  };

  (run as EffectRunWithSubs)._subscriptionSets = [];
  (run as EffectRunWithSubs)._cleanupHead =
    (run as EffectRunWithSubs)
      ._cleanupTail =
      null;
  if (syncNotify) {
    markRenderEffectRun(run);
  }
  run();

  const disposer = (): void => {
    if (disposed) return;
    disposed = true;
    const runWithSubs = run as EffectRunWithSubs;
    const subs = runWithSubs._subscriptionSets;
    if (subs) {
      for (const s of subs) s.delete(run);
      subs.length = 0;
    }
    runCleanups(runWithSubs);
    unschedule(run);
  };
  if (scope) scope.addDisposer(disposer);
  return disposer;
}

/**
 * 创建响应式副作用。
 * 立即执行一次 fn；执行过程中读到的 signal 会将该 effect 登记为依赖。
 * 之后任意依赖的 signal 变更时，会通过调度器异步重新执行该 effect（微任务批处理）。
 * fn 可返回一个清理函数，在 effect 下次运行前或 dispose 时被调用。
 * 传入 opts.scope 时，disposer 登记到该 scope 而非当前 run scope，适合不随根重跑清理的 resource。
 *
 * @param fn - 副作用函数，可返回清理函数（可选）
 * @param opts - 可选；scope 指定登记 disposer 的作用域
 * @returns dispose 函数，调用后取消该 effect 的所有订阅并不再执行
 *
 * @example
 * const count = createSignal(0);
 * const stop = createEffect(() => {
 *   console.log(count.value);
 *   return () => console.log("cleanup");
 * });
 * stop(); // 停止 effect 并执行 cleanup
 */
export function createEffect(
  fn: () => void | (() => void),
  opts?: CreateEffectOptions,
): EffectDispose {
  return createEffectImpl(fn, opts, false);
}

/**
 * **`createRenderEffect`** 同向：依赖变更时在 **当前同步栈**（**非** `batch` 时）立即重跑；在 **`batch` 内** 触发的更新推迟到 **最外层 batch 结束** 后、普通 `createEffect` 微任务波次 **之前** 同步排空（见 `scheduler.notifyEffectSubscriber`）。
 * 首次创建仍立即同步执行一次，语义与 {@link createEffect} 一致；`onCleanup` / 返回 dispose / `opts.scope` 行为相同。
 *
 * 用于须与读值同一 tick 内更新 DOM 测量等场景；一般业务优先 {@link createEffect}，避免长时间阻塞主线程。
 *
 * @param fn - 副作用函数，可返回清理函数（可选）
 * @param opts - 可选；scope 指定登记 disposer 的作用域
 * @returns dispose 函数
 */
export function createRenderEffect(
  fn: () => void | (() => void),
  opts?: CreateEffectOptions,
): EffectDispose {
  return createEffectImpl(fn, opts, true);
}

/**
 * 次级原语：把「依赖收集」与「下一次变更时的一次性回调」拆开（与 常见响应式文档「Secondary primitives / createReaction」同向）。
 *
 * - 调用返回的 `track(() => { …读 signal… })` 时，先 **武装**：订阅 `track` 内读取的依赖；**首次**执行 `track` 时**不会**调用 `onInvalidate`。
 * - 依赖 **随后第一次** 发生变更通知时：在 {@link untrack} 中调用 `onInvalidate` **一次**，并 dispose 该武装 effect；之后同一轮武装内再变更多次不会重复调用（须再次 `track` 才能重新武装）。
 * - 再次调用 `track` 会先 dispose 上一轮尚未触发的武装（与常见方案「须再次 track」一致）。
 *
 * @param onInvalidate - 依赖首次变更时执行一次；在 {@link untrack} 内调用，其内部读 signal 不会成为外层依赖
 * @returns `track` 函数：`track(trackingFn)` 建立订阅
 *
 * @example
 * const s = createSignal("a");
 * const track = createReaction(() => console.log("next tick after arm"));
 * track(() => { void s.value; });
 * s.value = "b"; // 打印一次
 * s.value = "c"; // 不再打印，除非再 track(...)
 */
export function createReaction(
  onInvalidate: () => void,
): (trackFn: () => void) => void {
  /** 当前武装的 effect dispose；新 `track` 或触发后清空 */
  let armedDispose: EffectDispose | null = null;

  return (trackFn: () => void) => {
    armedDispose?.();
    armedDispose = null;

    let isFirstRun = true;
    /** 第二次及以后的同步重入（同 tick 多 signal 写）只应触发一次 onInvalidate */
    let invalidated = false;
    /** 占位避免首帧同步 `run` 时 TDZ；首帧提前 return，不会调用到占位 dispose */
    const effectRef: { dispose: EffectDispose } = {
      dispose: () => {},
    };
    effectRef.dispose = createEffect(() => {
      trackFn();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      if (invalidated) return;
      invalidated = true;
      untrack(() => {
        onInvalidate();
      });
      const dispose = effectRef.dispose;
      const runLater = typeof globalThis.queueMicrotask === "function"
        ? () => globalThis.queueMicrotask(finish)
        : () => void Promise.resolve().then(finish);
      /**
       * 推迟 dispose：避免在 `createEffect` 的 `run` 栈尚未返回时同步 `dispose()` 重入。
       */
      function finish(): void {
        armedDispose = null;
        dispose();
      }
      runLater();
    });
    armedDispose = effectRef.dispose;
  };
}

/**
 * 创建只读派生值（memo）。
 * 依赖的 signal 变化时才重新计算并缓存结果；在 effect 或模板中读取返回的 getter 时会登记依赖。
 * 传入 `options.equals` 时与同类方案 一致：函数形式时在 `fn()` 算出 `next` 后与缓存比较，相等则跳过写入；`equals: false` 时每次依赖更新都通知订阅者，即使 `Object.is` 相同。
 *
 * @param fn - 派生计算函数，应只依赖 signal 等响应式数据
 * @param _initialValue - 预留，与同类方案 签名对齐；当前未参与首帧逻辑
 * @param options - 可选；`equals` 为函数时返回 true 跳过更新；为 `false` 时强制通知
 * @returns 无参 getter，返回当前缓存的计算结果
 *
 * @example
 * const a = createSignal(1);
 * const double = createMemo(() => a.value * 2);
 * createEffect(() => console.log(double())); // 2 → a.value = 2 后输出 4
 */
export function createMemo<T>(
  fn: () => T,
  _initialValue?: T,
  options?: CreateMemoOptions<T>,
): () => T {
  const state = createSignal<T>(undefined as unknown as T);
  const equals = options?.equals;
  /** 是否已有过提交的缓存值；首帧不调用 `equals`，避免 `prev` 无意义比较 */
  let seeded = false;
  createEffect(() => {
    const next = fn();
    if (equals === false) {
      writeSignalForceNotify(state, next);
      seeded = true;
      return;
    }
    if (typeof equals === "function" && seeded) {
      const prev = untrack(() => state.value);
      if (equals(prev as T, next)) {
        return;
      }
    }
    /** 须用 `writeSignalValueRaw`：`next` 为函数时 `.value =` 会被当成 updater */
    writeSignalValueRaw(state, next);
    seeded = true;
  });
  return markSignalGetter(() => state.value) as () => T;
}

/**
 * **`children`** 向 API：对子内容 getter 做 {@link createMemo} 缓存，父组件重跑时仅在依赖变化后重新解析 `props.children` 或嵌套函数返回值；读返回的 getter 会建立细粒度依赖。
 *
 * @param fn - 返回子节点 / 片段（与 `insert`、编译产物子表达式语义一致）
 * @returns 无参 getter，行为与 `createMemo(fn)` 相同
 *
 * @example
 * ```ts
 * const resolved = children(() => props.children);
 * createEffect(() => { void resolved(); });
 * ```
 */
export function children<T>(fn: () => T): () => T {
  return createMemo(fn);
}

/**
 * **`createDeferred`** 同向：返回只读 accessor（无参 getter），其值**滞后**于 `source()` 的同步更新——在浏览器中优先用 **`requestAnimationFrame`** 提交，与「paint 后再更新昂贵派生」的常见做法一致；无 rAF 时（部分 SSR / 纯运行环境）退化为 **`queueMicrotask`**，仍保证不在同一同步栈内与 `source` 同拍提交。
 *
 * 内部用 `createEffect` 订阅 `source`；每次 `source` 依赖变更并经调度器执行 effect 后，将**该次**读到的值排入下一帧 / 下一微任务。快速连续变更时，中间帧可被合并，最终以**最后一次**排队的值为准（与取消并重排 rAF 的语义一致）。
 *
 * @param source - 与 `createMemo` 相同：零参函数，其内读取的 signal 构成依赖
 * @param options - 可选；`initialValue` 在首次推迟提交前作为返回值；`equals` 与 {@link createMemo} 一致
 * @returns 无参 getter，供模板或其它 memo/effect 订阅；读时建立对内部缓存 signal 的依赖
 *
 * @example
 * ```ts
 * const count = createSignal(0);
 * const slow = createDeferred(() => count.value);
 * // 同步段内多次写入 count 后，slow() 仍可能为旧值，直至下一帧再跟上
 * ```
 */
export function createDeferred<T>(
  source: () => T,
  options?: CreateDeferredOptions<T>,
): () => T {
  const equals = options?.equals;
  const hasInitial = options != null && "initialValue" in options;
  const state = createSignal<T>(
    hasInitial ? options!.initialValue as T : undefined as unknown as T,
  );
  let seeded = hasInitial;
  /**
   * 无 rAF 时用于作废尚未执行的 `queueMicrotask` 回调（无法像 `cancelAnimationFrame` 一样取消）。
   */
  let deferGeneration = 0;

  /**
   * 将 `source` 某次读到的 `next` 写入内部 signal（尊重 `equals`）。
   *
   * @param next - 推迟提交时刻应展示的值
   */
  function applyDeferredCommit(next: T): void {
    if (equals === false) {
      writeSignalForceNotify(state, next);
      seeded = true;
      return;
    }
    if (typeof equals === "function" && seeded) {
      const prev = untrack(() => state.value);
      if (equals(prev as T, next)) return;
    }
    /** 须用 `writeSignalValueRaw`：`next` 为函数时 `.value =` 会被当成 updater */
    writeSignalValueRaw(state, next);
    seeded = true;
  }

  createEffect(() => {
    const next = source();
    const raf = globalThis.requestAnimationFrame;
    const cancelRaf = globalThis.cancelAnimationFrame;
    if (typeof raf === "function" && typeof cancelRaf === "function") {
      let frameId: number | undefined;
      frameId = raf.call(globalThis, () => {
        frameId = undefined;
        applyDeferredCommit(next);
      }) as number;
      return () => {
        if (frameId !== undefined) {
          cancelRaf.call(globalThis, frameId);
          frameId = undefined;
        }
      };
    }
    const myGen = ++deferGeneration;
    const run = () => {
      if (myGen !== deferGeneration) return;
      applyDeferredCommit(next);
    };
    if (typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(run);
    } else {
      void Promise.resolve().then(run);
    }
    return () => {
      deferGeneration++;
    };
  });

  return markSignalGetter(() => state.value) as () => T;
}
