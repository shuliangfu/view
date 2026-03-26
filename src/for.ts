/**
 * **`<For>` / `<Index>`** 列表组件（运行时）：与 {@link mapArray}、`insertReactive` 数组分支配合；
 * 编译器对标签 `For` / `Index` 会将子节点按 **render prop** `(item, index) => …` 展开，并将 `each={expr}` 包成 **`() => expr`** 以建立 signal 依赖。
 * 手写 JSX 还可传 **`each={listRef}`**（`createSignal` 的 `SignalRef`），运行时在读 `each` 时访问 `.value` 并订阅。
 *
 * **说明**：行级更新为 View 的 `mapArray` 粒度（列表源变化时整表重映射）；`Index` 当前与 `For` 同实现，按索引传递**值**而非 accessor。
 *
 * @module @dreamer/view/for
 */

import { coalesceIrList } from "./compiler/ir-coerce.ts";
import { mapArray } from "./map-array.ts";
import {
  type CreateSignalReturn,
  isSignalRef,
  type SignalRef,
} from "./signal.ts";

/**
 * `each` 可为无参 accessor、`createSignal` 返回的列表容器，或已求值的数组快照（快照不单独追踪列表内 signal，依赖外层 effect 重跑刷新）。
 *
 * **注意：** `CreateSignalReturn` 须写在 `SignalRef` 与 `readonly T[]` 之前，否则交叉 `SignalTuple` 后类型上含 `0`/`1` 下标，
 * 推断易误匹配「二元组数组」分支，把 `children` 的 `item` 错推成 getter/setter 联合而非列表元素类型 `T`。
 */
export type ListEachInput<T> =
  | CreateSignalReturn<readonly T[] | null | undefined>
  | (() => readonly T[] | null | undefined)
  | SignalRef<readonly T[] | null | undefined>
  | readonly T[]
  | null
  | undefined;

/**
 * {@link For} / {@link Index} 的 props：`each` / `fallback` 等命名与常见列表组件一致。
 */
export type ForProps<T> = {
  /** 列表源：无参 accessor、`SignalRef`（读 `.value`），或静态数组（`each={arr.value}` 仅为快照，勿用） */
  each: ListEachInput<T>;
  /**
   * 行渲染：返回与 `insertReactive` 数组单项一致（常见为编译产物 `markMountFn`、文本、VNode）。
   * @param item - 当前元素
   * @param index - 行下标
   */
  children: (item: T, index: number) => unknown;
  /**
   * 列表经 {@link coalesceIrList} 后长度为 0 时的占位；可为无参函数（返回挂载值）或静态插入值。
   */
  fallback?: unknown;
};

/**
 * 读取 `each`：`SignalRef` 读 `.value`；无参函数则调用；否则视为已展开的列表引用。
 *
 * @param each - props.each
 * @returns 原始列表或 null/undefined
 */
function readEach<T>(
  each: ListEachInput<T>,
): readonly T[] | null | undefined {
  if (isSignalRef(each)) {
    return (each as SignalRef<readonly T[] | null | undefined>).value;
  }
  if (typeof each === "function" && (each as () => unknown).length === 0) {
    return (each as () => readonly T[] | null | undefined)();
  }
  return each as readonly T[] | null | undefined;
}

/**
 * 解析 `fallback`：无参函数则调用后作为单项插入值。
 *
 * @param fb - props.fallback
 */
function resolveFallback(fb: unknown): unknown {
  if (typeof fb === "function" && (fb as () => unknown).length === 0) {
    return (fb as () => unknown)();
  }
  return fb;
}

/**
 * **`<For>`**：返回**无参 getter**，供 `insertReactive(parent, () => For(props)())` 使用；
 * getter 求值得到**数组**（每行一项），走现有数组协调逻辑。
 *
 * @param props - each / children / 可选 fallback
 * @returns `() => unknown[]`
 */
export function For<T>(props: ForProps<T>): () => unknown[] {
  const mapped = mapArray(
    () => coalesceIrList(readEach(props.each)) as readonly T[],
    (item, index) => props.children(item, index),
  );
  return () => {
    const rows = mapped();
    if (rows.length === 0 && props.fallback != null) {
      return [resolveFallback(props.fallback)];
    }
    return rows;
  };
}

/**
 * **`<Index>`**：当前与 {@link For} 共享实现（按值 + 索引）；后续可升级为按索引 accessor 语义。
 *
 * @param props - 同 {@link ForProps}
 * @returns `() => unknown[]`
 */
export function Index<T>(props: ForProps<T>): () => unknown[] {
  return For(props);
}
