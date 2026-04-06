/**
 * @module runtime/control-flow
 * @description 控制流组件：ErrorBoundary、Show、For、Index、Portal 等。
 *
 * **支持的功能：**
 * - ✅ ErrorBoundary - 错误捕获和恢复
 * - ✅ Show - 条件渲染 (支持 when() 抛错处理)
 * - ✅ For - 列表渲染 (基础实现)
 * - ✅ Index - 基于索引的列表渲染
 * - ✅ Portal - 将内容渲染到指定容器
 * - ✅ Switch/Match - 多路分支（仅首个 when 为真的 Match 渲染，否则 fallback）
 *
 * **核心机制：**
 * - 统一的 marker + fragment 模式
 * - createEffect + insert 实现响应式更新
 * - 正确的清理机制 (onCleanup)
 * - 错误边界集成
 *
 * **范围说明：**
 * - 传入 **`key`**（`For` / `Index`）时按稳定键 **复用 DOM、重排节点**；不传则保持「整表重建」语义（与旧版一致）。
 * - 虚拟滚动等仍建议业务层或专用组件实现。
 *
 * @usage
 * <ErrorBoundary fallback={...}>
 *   <Show when={condition}>{...}</Show>
 *   <For each={list}>{item => <div>{item}</div>}</For>
 * </ErrorBoundary>
 */

import { createEffect } from "../reactivity/effect.ts";
import {
  adoptChild,
  cleanNode,
  createOwner,
  createRoot,
  getOwner,
  onCleanup,
  onError,
  type Owner,
  runWithOwner,
} from "../reactivity/owner.ts";
import { createSignal } from "../reactivity/signal.ts";
import { batch } from "../scheduler/batch.ts";
import {
  type InsertCurrent,
  type InsertValue,
  type JSXRenderable,
  type ShowChildren,
  type SwitchChild,
  VIEW_MATCH_KEY,
  type ViewMatchDescriptor,
  type ViewSignalTagged,
  type ViewSlot,
} from "../types.ts";
import { insert } from "./insert.ts";

/**
 * 比较两组 resetKeys 是否逐项相同（Object.is），用于判断依赖是否相对上次 effect 运行发生变化。
 */
function resetKeysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * 将 `each()` 的返回值规范为可安全调用 `forEach` 的数组。
 * `null`/`undefined` → `[]`；已是数组则原样；具备 `Symbol.iterator` 则 `Array.from`（兼容 Iterable 代理）。
 */
function normalizeEachList<T>(raw: T[] | Iterable<T> | null | undefined): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && Symbol.iterator in raw) {
    return Array.from(raw as Iterable<T>);
  }
  return [];
}

/**
 * 移除 `parent` 下 `marker` 之前的所有子节点（保留 `marker`）。
 */
function removeChildrenBeforeMarker(parent: Node, marker: Node): void {
  let child = parent.firstChild;
  while (child && child !== marker) {
    const next = child.nextSibling;
    parent.removeChild(child);
    child = next;
  }
}

/**
 * 由 `key` 函数生成每行的稳定字符串键；重复键自动加后缀避免 Map 碰撞。
 */
function stableRowKeys<T>(items: T[], keyFn: (item: T) => unknown): string[] {
  const nItems = items.length;
  const keys = new Array<string>(nItems);
  const count = new Map<string, number>();
  for (let i = 0; i < nItems; i++) {
    const it = items[i]!;
    const raw = keyFn(it);
    const base = raw === null || raw === undefined
      ? `__null:${i}`
      : String(raw);
    const c = count.get(base) ?? 0;
    count.set(base, c + 1);
    keys[i] = c === 0 ? base : `${base}__dup${c}`;
  }
  return keys;
}

/** 键控列表行：可移动的壳 + 独立 Owner，避免挂在列表 `createEffect` 下被 `cleanNode(effect)` 每轮误杀 */
interface KeyedListRow<T> {
  shell: HTMLElement;
  /** 行级 Owner（挂在列表 effect 的父 Owner 上，与 effect 兄弟） */
  rowOwner: Owner;
  dispose: () => void;
  setItem: (item: T) => void;
  setIndex: (n: number) => void;
}

/**
 * 创建键控行：壳内 `insert` 子树，响应 `item` / 下标变化。
 */
function createKeyedListRow<T>(
  props: { children: (item: T, index: () => number) => JSXRenderable },
  initialItem: T,
  initialIndex: number,
): KeyedListRow<T> {
  const shell = document.createElement("span");
  shell.setAttribute("data-view-for-keyed", "");

  const [getItem, setItem] = createSignal(initialItem);
  const [getIdx, setIdx] = createSignal(initialIndex);

  let insertCurrent: InsertCurrent = undefined;

  /**
   * 列表 `createEffect` 重跑前会对 effect 自身 `cleanNode`，其子 Owner 会被销毁。
   * 行 Owner 必须挂在 **effect.owner**（与 effect 同级的持久父节点）上，才能在列表更新时存活。
   */
  const listEffectOwner = getOwner();
  const persistParent = listEffectOwner?.owner ?? listEffectOwner;
  const rowOwner = createOwner();
  if (persistParent) adoptChild(persistParent, rowOwner);

  runWithOwner(rowOwner, () => {
    createEffect(() => {
      getItem();
      getIdx();
      insertCurrent = insert(
        shell,
        props.children(getItem(), () => getIdx()),
        insertCurrent,
        undefined,
      );
    });
  });

  return {
    shell,
    rowOwner,
    dispose: () => {
      cleanNode(rowOwner, true);
      if (shell.parentNode) shell.parentNode.removeChild(shell);
    },
    setItem: (it: T) => setItem(() => it),
    setIndex: (n: number) => setIdx(() => n),
  };
}

/**
 * ErrorBoundary 组件：捕获子组件错误。
 *
 * 当处于错误展示态时，effect 默认只订阅 `error` / `resetCount`，不会感知外部路由或查询参数变化；
 * 若子树依赖的数据已切换但仍显示旧 fallback，请传入 `resetKeys`（例如 `() => [userId()]`），
 * 在键变化时自动清除错误并重新挂载子树。
 *
 * @param props.fallback 错误时渲染的 UI，签名为 `(err, reset) => ...`
 * @param props.children 正常子树
 * @param props.resetKeys 可选：错误态下依赖变化时自动 `reset`
 * @returns 带锚点的 `DocumentFragment`
 */
export function ErrorBoundary(props: {
  fallback: (err: unknown, reset: () => void) => InsertValue;
  children: ViewSlot;
  /**
   * 返回依赖数组；仅在**当前已处于错误态**且数组与上次 effect 运行时的结果不同时清除错误并重试子树。
   * 切换到会触发错误的新键时，因当时 `error()` 仍为假，不会误清除即将展示的错误。
   */
  resetKeys?: () => readonly unknown[];
}): DocumentFragment {
  const [error, setError] = createSignal<unknown>(null);
  const [resetCount, setResetCount] = createSignal(0);

  onError((err) => {
    if (!error()) setError(() => err);
  });

  const marker = document.createTextNode("");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(marker);

  /** `insert` 追踪的当前 DOM 占位，勿与 {@link InsertValue} 混淆 */
  let current: InsertCurrent = undefined;
  let currentOwner: Owner | null = null;
  /** 上一次记录的 resetKeys，与本次比较以决定是否自动从错误态恢复 */
  let prevResetKeys: readonly unknown[] | undefined;

  /**
   * 单独 effect：只处理 resetKeys + error，**不得**与下方主渲染 effect 合并。
   * 若主 effect 订阅 resetKeys（如 userId），每次切换 ID 都会 cleanNode 整棵子树，
   * 与 createResource 的 effect 产生竞态，Suspense 可能被拆掉时尚未重新 register，导致无 loading。
   */
  if (props.resetKeys) {
    createEffect(() => {
      const rk = props.resetKeys!();
      if (
        prevResetKeys !== undefined && error() &&
        !resetKeysEqual(rk, prevResetKeys)
      ) {
        batch(() => {
          setError(null);
          setResetCount((c: number) => c + 1);
        });
      }
      prevResetKeys = rk.length ? [...rk] : [];
    });
  }

  createEffect(() => {
    const parent = marker.parentNode || fragment;

    resetCount();

    if (currentOwner) {
      cleanNode(currentOwner, true);
      currentOwner = null;
    }

    const err = error();
    if (err) {
      const content = props.fallback(err, () => {
        batch(() => {
          setError(null);
          setResetCount((c: number) => c + 1);
        });
      });
      current = insert(parent, content, current, marker);
    } else {
      currentOwner = createOwner();
      const parentOwner = getOwner();
      if (parentOwner) adoptChild(parentOwner, currentOwner);

      runWithOwner(currentOwner, () => {
        onError((e) => setError(() => e));

        try {
          const content: InsertValue = typeof props.children === "function"
            ? (props.children as () => JSXRenderable)()
            : props.children;
          current = insert(parent, content, current, marker);
        } catch (e) {
          setError(() => e);
        }
      });
    }
  });

  onCleanup(() => {
    if (currentOwner) cleanNode(currentOwner, true);
  });

  return fragment;
}

/**
 * 条件渲染：`when()` 为真时渲染 `children`（可为函数接收真值），否则 `fallback`；`when` 抛错等同假分支。
 * @template T `when()` 真值分支类型
 * @param props.when 条件 getter
 * @param props.fallback 假分支或错误时内容
 * @param props.children 静态子或 `(item: T) => ...`
 * @returns `DocumentFragment`
 */
export function Show<T>(props: {
  when: () => T | undefined | null | false;
  fallback?: JSXRenderable;
  children: ShowChildren<T>;
}): DocumentFragment {
  const marker = document.createTextNode("");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(marker);

  let current: InsertCurrent = undefined;
  let currentDispose: (() => void) | null = null;
  let lastCondition: T | undefined | null | false = undefined;

  createEffect(() => {
    let condition: T | undefined | null | false = false;
    let hasError = false;

    // 安全地执行 when() 函数，捕获可能的错误
    try {
      condition = props.when();
    } catch (_err) {
      hasError = true;
      condition = false;
    }

    if (condition === lastCondition && current !== undefined && !hasError) {
      return;
    }
    lastCondition = condition;

    if (currentDispose) {
      currentDispose();
      currentDispose = null;
    }

    const parent = marker.parentNode || fragment;

    createRoot((dispose) => {
      currentDispose = dispose;

      let content;
      if (hasError || !condition) {
        content = props.fallback;
      } else {
        content = typeof props.children === "function"
          ? (props.children as (item: T) => JSXRenderable)(condition)
          : props.children;
      }

      current = insert(parent, content, current, marker);
    });
  });

  onCleanup(() => {
    if (currentDispose) currentDispose();
  });

  return fragment;
}

/**
 * For 组件：列表渲染。
 * - 未传 **`key`**：每次 `each` 变化整表销毁重建（与历史行为一致）。
 * - 传入 **`key`**：按稳定键复用行节点，仅重排/增删，适合大列表与重排场景。
 *
 * @template T 列表项类型
 * @param props.each 列表 getter
 * @param props.children `(item, index) => ...`，`index` 为响应式 getter
 * @param props.fallback 空列表时可选内容
 * @param props.key 可选稳定键函数，启用键控复用
 * @returns `DocumentFragment`
 */
export function For<T>(props: {
  each: () => T[] | null | undefined;
  /** 第二项始终由运行时传入，为当前下标的 getter */
  children: (item: T, index: () => number) => JSXRenderable;
  /** 列表为空时渲染的内容（可选） */
  fallback?: JSXRenderable;
  /** 稳定键；提供时启用键控复用与 DOM 重排 */
  key?: (item: T) => unknown;
}): DocumentFragment {
  if (props.key) {
    return forKeyedList(props as typeof props & { key: (item: T) => unknown });
  }
  return forLegacyList(props);
}

/**
 * 无 `key` 的 For：整表重建。
 */
function forLegacyList<T>(props: {
  each: () => T[] | null | undefined;
  children: (item: T, index: () => number) => JSXRenderable;
  fallback?: JSXRenderable;
}): DocumentFragment {
  const marker = document.createTextNode("");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(marker);

  let currentDispose: (() => void) | null = null;

  createEffect(() => {
    const items = normalizeEachList(props.each());
    const parent = marker.parentNode || fragment;

    if (currentDispose) {
      currentDispose();
      currentDispose = null;
    }

    createRoot((dispose) => {
      currentDispose = dispose;

      removeChildrenBeforeMarker(parent, marker);

      if (items.length === 0 && props.fallback !== undefined) {
        insert(parent, props.fallback, undefined, marker);
      } else {
        items.forEach((item, index) => {
          const content = props.children(item, () => index);
          insert(parent, content, undefined, marker);
        });
      }
    });
  });

  onCleanup(() => {
    if (currentDispose) currentDispose();
  });

  return fragment;
}

/**
 * 带 `key` 的 For：增量更新与 DOM 重排。
 */
function forKeyedList<T>(props: {
  each: () => T[] | null | undefined;
  children: (item: T, index: () => number) => JSXRenderable;
  fallback?: JSXRenderable;
  key: (item: T) => unknown;
}): DocumentFragment {
  const marker = document.createTextNode("");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(marker);

  const rowMap = new Map<string, KeyedListRow<T>>();
  let fallbackCurrent: InsertCurrent = undefined;
  let keyedRootDispose: (() => void) | null = null;

  /**
   * 包一层持久 Root：列表 `createEffect` 的 `owner` 为该 Root，行 Owner 挂在 `effect.owner`（同一 Root）上，
   * 这样 `cleanNode(列表 effect)` 不会销毁行；若省略此层且外层无组件 Owner，则 `effect.owner === null`，行会误挂到 effect 自身而被每轮清掉。
   */
  createRoot((dispose) => {
    keyedRootDispose = dispose;

    createEffect(() => {
      const parent = marker.parentNode || fragment;
      const items = normalizeEachList(props.each());
      const keys = stableRowKeys(items, props.key);

      if (items.length === 0) {
        for (const row of rowMap.values()) row.dispose();
        rowMap.clear();
        removeChildrenBeforeMarker(parent, marker);
        if (props.fallback !== undefined) {
          fallbackCurrent = insert(
            parent,
            props.fallback,
            fallbackCurrent,
            marker,
          );
        } else {
          fallbackCurrent = insert(parent, null, fallbackCurrent, marker);
        }
        return;
      }

      if (fallbackCurrent !== undefined) {
        fallbackCurrent = insert(parent, null, fallbackCurrent, marker);
      }

      const nextKeySet = new Set(keys);
      // 仅收集待删键再 dispose：避免 `[...rowMap.entries()]` 整表拷贝；无删除时不分配数组
      let staleKeys: string[] | undefined;
      for (const k of rowMap.keys()) {
        if (!nextKeySet.has(k)) (staleKeys ??= []).push(k);
      }
      if (staleKeys) {
        for (let i = 0; i < staleKeys.length; i++) {
          const k = staleKeys[i]!;
          rowMap.get(k)!.dispose();
          rowMap.delete(k);
        }
      }

      for (let i = 0; i < items.length; i++) {
        const k = keys[i]!;
        const item = items[i] as T;
        const existing = rowMap.get(k);
        if (!existing) {
          const created = createKeyedListRow(props, item, i);
          rowMap.set(k, created);
          parent.insertBefore(created.shell, marker);
        } else {
          existing.setItem(item);
          existing.setIndex(i);
        }
      }

      let ref: Node = marker;
      for (let i = items.length - 1; i >= 0; i--) {
        const row = rowMap.get(keys[i]!)!;
        parent.insertBefore(row.shell, ref);
        ref = row.shell;
      }
    });

    onCleanup(() => {
      for (const row of rowMap.values()) row.dispose();
      rowMap.clear();
    });
  });

  onCleanup(() => {
    keyedRootDispose?.();
    keyedRootDispose = null;
  });

  return fragment;
}

/**
 * Index 组件：基于索引的列表渲染。
 * 可选 **`key`** 时与 For 相同，按键复用行（适合元素会重排但需保留 DOM 的场景）。
 *
 * @template T 列表项类型
 * @param props.each 列表 getter
 * @param props.children 行渲染函数
 * @param props.key 可选稳定键
 * @returns `DocumentFragment`
 */
export function Index<T>(props: {
  each: () => T[] | null | undefined;
  children: (item: T, index: () => number) => JSXRenderable;
  key?: (item: T) => unknown;
}): DocumentFragment {
  if (props.key) {
    return forKeyedList({
      each: props.each,
      children: props.children,
      key: props.key,
    });
  }

  const marker = document.createTextNode("");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(marker);

  let currentDispose: (() => void) | null = null;

  createEffect(() => {
    const items = normalizeEachList(props.each());
    const parent = marker.parentNode || fragment;

    if (currentDispose) {
      currentDispose();
      currentDispose = null;
    }

    createRoot((dispose) => {
      currentDispose = dispose;

      removeChildrenBeforeMarker(parent, marker);

      items.forEach((item, index) => {
        const content = props.children(item, () => index);
        insert(parent, content, undefined, marker);
      });
    });
  });

  onCleanup(() => {
    if (currentDispose) currentDispose();
  });

  return fragment;
}

/**
 * 解包一层或多层非 Signal 的渲染用 thunk，直到得到非函数或带 __VIEW_SIGNAL 的 getter。
 */
function unwrapRenderableThunk(value: unknown): unknown {
  let v: unknown = value;
  while (
    typeof v === "function" &&
    !(v as ViewSignalTagged).__VIEW_SIGNAL
  ) {
    v = (v as () => unknown)();
  }
  return v;
}

/**
 * 将 Switch 的 children 规范为数组（单个子或 Fragment 数组）。
 */
function normalizeSwitchChildren(
  children: SwitchChild | readonly SwitchChild[] | false | null | undefined,
): SwitchChild[] {
  if (children == null || children === false) return [];
  if (Array.isArray(children)) return [...children];
  return [children];
}

/**
 * Switch：仅渲染第一个 `when()` 为真的 Match 的 children；若无匹配且提供 fallback 则渲染 fallback。
 * Match 返回描述对象而非 DOM，由 Switch 统一 insert，避免多分支同时挂载。
 *
 * @param props.children `Match` 描述符或数组
 * @param props.fallback 无匹配分支时的内容
 * @returns `DocumentFragment`
 */
export function Switch(props: {
  children: SwitchChild | readonly SwitchChild[];
  fallback?: InsertValue;
}): DocumentFragment {
  /** 插槽容器：marker 的 previousSibling 仅限 Switch 自己插入的内容，避免误删外层 section 里更靠前的按钮等节点 */
  const slot = document.createElement("span");
  slot.setAttribute("data-view-switch", "");
  slot.style.display = "contents";

  const marker = document.createTextNode("");
  slot.appendChild(marker);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(slot);

  createEffect(() => {
    const parent = marker.parentNode || slot;
    while (marker.previousSibling) {
      parent.removeChild(marker.previousSibling);
    }

    const parts = normalizeSwitchChildren(props.children);
    let selected: InsertValue | null = null;

    for (const part of parts) {
      const unwrapped = unwrapRenderableThunk(part);
      if (
        unwrapped &&
        typeof unwrapped === "object" &&
        (unwrapped as ViewMatchDescriptor)[VIEW_MATCH_KEY] === true
      ) {
        const desc = unwrapped as ViewMatchDescriptor;
        if (desc.when()) {
          selected = desc.children;
          break;
        }
      }
    }

    if (selected != null && selected !== false) {
      insert(parent, selected, null, marker);
    } else if (props.fallback != null) {
      insert(parent, props.fallback, null, marker);
    }
  });

  return fragment;
}

/**
 * Match：仅作为 Switch 的子项使用；返回描述符（类型见 `../types.ts` 的 `ViewMatchDescriptor`），由 Switch 按顺序求值 when 并择一插入。
 *
 * @param props.when 条件值或零参 getter
 * @param props.children 命中时插入的内容
 * @returns {@link ViewMatchDescriptor}
 */
export function Match(props: {
  when: unknown | (() => unknown);
  children: JSXRenderable;
}): ViewMatchDescriptor {
  const whenFn: () => unknown = typeof props.when === "function"
    ? (props.when as () => unknown)
    : () => props.when;
  return {
    [VIEW_MATCH_KEY]: true,
    when: whenFn,
    children: props.children,
  };
}

/**
 * 声明式 Portal：把 `children` 插入到 `mount`（默认 `document.body`），随依赖更新。
 * @param props.mount 目标容器节点
 * @param props.children 要传送的内容
 * @returns 空 `DocumentFragment`（实际内容挂在 `mount` 上）
 */
export function Portal(
  props: { mount?: Node; children: JSXRenderable },
): DocumentFragment {
  const container = props.mount || document.body;
  const marker = document.createTextNode("");
  const fragment = document.createDocumentFragment();
  fragment.appendChild(marker);

  let current: InsertCurrent = null;

  createEffect(() => {
    current = insert(container, props.children, current);
  });

  onCleanup(() => {
    insert(container, null, current);
    if (marker.parentNode) marker.parentNode.removeChild(marker);
  });

  return document.createDocumentFragment();
}
