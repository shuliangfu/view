/**
 * @module examples/views/boundary/index
 * @description 错误边界 (ErrorBoundary) 示例。
 */
import { createEffect, createSignal, ErrorBoundary } from "@dreamer/view";

/** 一个会偶尔崩溃的危险组件 */
function BrokenComponent() {
  const [shouldThrow, setShouldThrow] = createSignal(false);

  createEffect(() => {
    if (shouldThrow()) {
      throw new Error("这是一个来自组件内部的自定义异常！");
    }
  });

  return (
    <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <h3 className="text-lg font-bold mb-4">危险区域</h3>
      <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
        点击下方按钮会触发一个 JS 运行时错误。如果没有 ErrorBoundary
        包装，整个路由都会崩溃。
      </p>
      <button
        type="button"
        onClick={() => setShouldThrow(true)}
        className="px-4 py-2 bg-rose-500 text-white text-sm font-bold rounded-xl hover:bg-rose-600 transition-all active:scale-95"
      >
        引爆错误！
      </button>
    </div>
  );
}

export default function BoundaryPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          错误边界
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          演示如何捕获局部渲染异常并显示降级 UI。
        </p>
      </header>

      <section className="space-y-6">
        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest px-1">
          示例 1: 局部捕获
        </p>

        {/* 关键：使用 ErrorBoundary 包装 */}
        <ErrorBoundary
          fallback={(err, reset) => (
            <div className="p-8 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-3xl text-center">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/40 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h4 className="text-rose-900 dark:text-rose-300 font-black mb-2">
                组件已崩溃
              </h4>
              <p className="text-rose-700/70 dark:text-rose-400 text-sm mb-6 font-medium">
                错误信息: {String(err)}
              </p>
              <button
                type="button"
                onClick={reset}
                className="px-6 py-2.5 bg-rose-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 shadow-lg shadow-rose-200 dark:shadow-none transition-all"
              >
                尝试重置
              </button>
            </div>
          )}
        >
          {() => <BrokenComponent />}
        </ErrorBoundary>
      </section>

      <section className="p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl border border-indigo-100 dark:border-indigo-800">
        <h4 className="text-indigo-900 dark:text-indigo-300 font-bold mb-2">
          正常区域
        </h4>
        <p className="text-indigo-700/70 dark:text-indigo-400 text-sm font-medium">
          即便上方的组件引爆了，这个区域依然是完好无损的。这就是 ErrorBoundary
          的威力。
        </p>
      </section>
    </div>
  );
}
