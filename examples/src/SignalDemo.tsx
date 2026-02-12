/**
 * 核心 API：createSignal、createEffect、createMemo、onCleanup
 *
 * - createSignal：响应式单元，getter 在 effect 中读会登记依赖
 * - createEffect：副作用，依赖的 signal 变化时重新执行，返回 dispose
 * - createMemo：派生值缓存，依赖变化时重新计算
 * - onCleanup：在 effect 内注册，effect 下次运行或 dispose 时执行
 */

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "@dreamer/view";
import type { VNode } from "@dreamer/view";

const [count, setCount] = createSignal(0);
const [name, setName] = createSignal("");

/** createMemo：派生值，依赖 count 时自动更新 */
const double = createMemo(() => count() * 2);

/** createEffect + onCleanup：控制台打印与清理 */
createEffect(() => {
  const n = name();
  if (n) {
    const t = setTimeout(() => {}, 0);
    onCleanup(() => clearTimeout(t));
  }
});

/** 统一按钮样式：高端圆角、阴影、focus 环 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
/** 统一输入框样式 */
const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";

export function SignalDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
        核心 API
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createSignal / createEffect / createMemo / onCleanup
      </h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            count：<span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
              {count}
            </span>
            {" · "}
            double（createMemo）：<span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
              {double}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => setCount((c) => c + 1)}
            >
              +1
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setCount((c) => c - 1)}
            >
              -1
            </button>
            <button type="button" className={btn} onClick={() => setCount(0)}>
              归零
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            name：<input
              type="text"
              className={`ml-2 ${inputCls}`}
              value={() => name()}
              onInput={(e: Event) =>
                setName((e.target as HTMLInputElement).value)}
            />
          </p>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            {() => (name() ? `你好，${name()}！` : "请输入名字")}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            createEffect 与 onCleanup 已在模块内使用；createMemo 用于 double。
          </p>
        </div>
      </div>
    </section>
  );
}
