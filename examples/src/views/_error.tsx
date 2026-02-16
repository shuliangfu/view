/**
 * 错误兜底视图（约定 _error.tsx，路由扫描自动屏蔽）：用于 ErrorBoundary 等展示错误信息
 */

import type { VNode } from "@dreamer/view";

interface ErrorViewProps {
  /** 错误对象或消息 */
  error?: unknown;
  /** 重试回调（可选） */
  onRetry?: () => void;
}

/** 错误页：展示错误信息与重试按钮 */
export function ErrorView(props: ErrorViewProps): VNode {
  const message = props.error instanceof Error
    ? props.error.message
    : String(props.error ?? "未知错误");
  return (
    <section className="rounded-2xl border border-red-200/80 bg-white/90 p-12 shadow-lg backdrop-blur text-center dark:border-red-800/80 dark:bg-slate-800/90 sm:p-16">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
        出错了
      </p>
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        加载失败
      </h2>
      <p className="mb-6 max-w-md mx-auto text-slate-600 dark:text-slate-300 break-words">
        {message}
      </p>
      {props.onRetry && (
        <button
          type="button"
          onClick={() => props.onRetry?.()}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          重试
        </button>
      )}
    </section>
  );
}
