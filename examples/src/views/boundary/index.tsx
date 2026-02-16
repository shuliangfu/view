/**
 * Boundary：ErrorBoundary、Suspense
 *
 * - ErrorBoundary：捕获子树错误，显示 fallback(error)
 * - Suspense：children 为 Promise 或 getter 返回 Promise 时先显示 fallback，resolve 后显示内容
 */

import type { VNode } from "@dreamer/view";
import { createEffect, createSignal } from "@dreamer/view";
import { ErrorBoundary, Suspense } from "@dreamer/view/boundary";

export const metadata = {
  title: "Boundary",
  description: "ErrorBoundary、Suspense 示例",
  keywords: "ErrorBoundary, Suspense, 错误边界",
};

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";

/** 会抛错的组件，用于演示 ErrorBoundary */
function Thrower(props: { shouldThrow?: boolean }): VNode {
  if (props.shouldThrow) throw new Error("子组件故意抛错");
  return <span className="text-slate-600 dark:text-slate-300">未抛错</span>;
}

/**
 * 模拟异步内容：约 1s 后 resolve 的 Promise。
 * 在 createEffect 里调用并写入 signal，避免在渲染路径里每次调用产生新 Promise；
 * signal 放在模块级，这样 BoundaryDemo 重渲染时不会新建 signal、不会丢已设的 Promise。
 */
function createAsyncContentPromise(): Promise<VNode> {
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve(
          <span className="text-slate-600 dark:text-slate-300">
            异步内容已加载
          </span>,
        ),
      1000,
    );
  });
}

/** 模块级：保证重渲染时复用同一 Promise，不因组件重跑而新建 signal */
const [asyncPromise, setAsyncPromise] = createSignal<Promise<VNode> | null>(
  null,
);

const [shouldThrow, setShouldThrow] = createSignal(false);

export function BoundaryDemo(): VNode {
  // 只在尚未有 Promise 时请求一次，effect 重跑时因 asyncPromise() 已有值不会重复执行
  createEffect(() => {
    if (!asyncPromise()) setAsyncPromise(createAsyncContentPromise());
  });

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Boundary
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        ErrorBoundary / Suspense
      </h2>
      <div className="space-y-8">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ErrorBoundary
          </h3>
          <p className="mb-3">
            <button
              type="button"
              className={btn}
              onClick={() => setShouldThrow((x) => !x)}
            >
              切换「抛错」状态
            </button>
          </p>
          <ErrorBoundary
            fallback={(err) => (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
                捕获到错误：{String(err)}
              </p>
            )}
          >
            <Thrower shouldThrow={shouldThrow()} />
          </ErrorBoundary>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Suspense
          </h3>
          <Suspense
            fallback={
              <p className="text-slate-500 dark:text-slate-400">加载中…</p>
            }
          >
            {asyncPromise() ?? <p className="text-slate-500 dark:text-slate-400">加载中…</p>}
          </Suspense>
        </div>
      </div>
    </section>
  );
}
export default BoundaryDemo;
