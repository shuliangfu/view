/**
 * 列表插入 API：`insertIrList`（可空列表源 + 可选 `fallback`）、以及其底层使用的
 * `coalesceIrList` / `expandIrArray`（与 JSX 中 `?.map` 编译产物同向）。
 *
 * - `insertIrList(parent, () => list)`：`list` 为 `null`/`undefined` 时先规范为空数组再挂载，避免整段报错。
 * - `options.fallback`：扁平后**无可见子项**时展示占位（与 `<For fallback>` 语义同向）。
 * - `expandIrArray`：扁平化嵌套数组，混合文本与 VNode 的规则与 `insertReactive` 数组分支一致。
 */

import type { VNode } from "@dreamer/view";
import {
  coalesceIrList,
  createEffect,
  createMemo,
  createRef,
  createSignal,
  expandIrArray,
  insertIrList,
} from "@dreamer/view";

export const metadata = {
  title: "列表插入",
  description:
    "insertIrList、coalesceIrList、expandIrArray 可空列表与 fallback 示例",
  keywords: "insertIrList, coalesceIrList, expandIrArray, 列表, fallback",
};

/** 列表源：可为 null（模拟未就绪）、空数组、字符串行或嵌套数组（展示 expand 扁平化） */
const items = createSignal<unknown[] | null>(null);

/** 挂载动态列表的容器；ref 就绪后由 effect 注册 `insertIrList` */
const listHostRef = createRef<HTMLDivElement>();

/**
 * 只读提示：当前列表经 coalesce / expand 后的规模，便于对照文档理解。
 */
const coerceHint = createMemo(() => {
  const raw = items.value;
  const coalesced = coalesceIrList(
    raw as readonly unknown[] | null | undefined,
  );
  const flat = expandIrArray(coalesced);
  const rawDesc = raw === null
    ? "null"
    : raw === undefined
    ? "undefined"
    : `数组(长度 ${raw.length})`;
  return `${rawDesc} → coalesceIrList 长度 ${coalesced.length} → expandIrArray 项数 ${flat.length}`;
});

/**
 * 在列表容器挂载后注册 `insertIrList`；列表源变化由内部 `insertReactive` 追踪 accessor。
 */
createEffect(() => {
  const parent = listHostRef.current;
  if (!parent) return;
  return insertIrList(
    parent,
    () => items.value as readonly unknown[] | null | undefined,
    {
      fallback: () => (
        <p
          className="text-sm text-amber-800 dark:text-amber-200"
          data-testid="ir-list-fallback"
        >
          列表为 null / 空数组：显示 fallback（与 &lt;For fallback&gt; 同向）
        </p>
      ),
    },
  );
});

const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";

/** 列表插入示例页根组件 */
function ListInsertDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
        列表 API
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        insertIrList / coalesceIrList / expandIrArray
      </h2>
      <div className="space-y-6">
        <p className="text-slate-600 dark:text-slate-300">
          手写挂载或库代码可使用{" "}
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-700">
            insertIrList(parent, () =&gt; list, {"{"} fallback {"}"})
          </code>
          ，与编译器对{" "}
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-700">
            items?.map(...)
          </code>{" "}
          使用的{" "}
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-700">
            coalesceIrList
          </code>
          、
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-700">
            expandIrArray
          </code>{" "}
          语义一致。
        </p>

        <div
          className="min-h-[4rem] rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-700/30"
          ref={listHostRef}
          data-testid="ir-list-host"
        />

        <p
          className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
          data-testid="ir-list-coerce-hint"
        >
          {coerceHint}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            data-testid="ir-list-btn-two"
            onClick={() => {
              items.value = ["alpha", "bravo"];
            }}
          >
            两条文本
          </button>
          <button
            type="button"
            className={btn}
            data-testid="ir-list-btn-nested"
            onClick={() => {
              items.value = [["内层甲", "内层乙"], "外层"];
            }}
          >
            嵌套数组
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              items.value = [];
            }}
          >
            空数组
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              items.value = null;
            }}
          >
            置 null
          </button>
        </div>
      </div>
    </section>
  );
}

export default ListInsertDemo;
