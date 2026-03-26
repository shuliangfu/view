/**
 * 核心 API：createSignal、createEffect、createMemo、onCleanup
 *
 * - createSignal：返回 `SignalRef`，用 `.value` 读/写，在 effect 中读会登记依赖
 * - createEffect：副作用，依赖的 signal 变化时重新执行，返回 dispose
 * - createMemo：派生值缓存，依赖变化时重新计算
 * - onCleanup：在 effect 内注册，effect 下次运行或 dispose 时执行
 */

import type { VNode } from "@dreamer/view";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "@dreamer/view";

export const metadata = {
  title: "Signal",
  description:
    "createSignal、createEffect、createMemo、onCleanup 核心 API 示例",
  keywords: "createSignal, createEffect, createMemo, onCleanup",
};

const count = createSignal(0);
const name = createSignal("");

/** createMemo：派生值，依赖 count 时自动更新 */
const double = createMemo(() => count.value * 2);

/**
 * 姓名问候语：供 JSX 写 `{nameLine}`（勿 `nameLine()`）。
 * 手写 jsx-runtime 下不可写 `{name.value ? ...}`，会在 jsx() 时快照；须用 memo 或无参 getter 让 insertReactive 订阅 name。
 */
const nameLine = createMemo(() =>
  name.value ? `你好，${name.value}！` : "请输入名字"
);

/** createEffect + onCleanup：控制台打印与清理 */
createEffect(() => {
  const n = name.value;
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

function SignalDemo(): VNode {
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
            count：
            {/* data-testid 供 e2e 读取计数，避免对整页 innerText 用 \b2\b 等易碎正则 */}
            <span
              className="font-mono font-semibold text-indigo-600 dark:text-indigo-400"
              data-testid="signal-demo-count"
            >
              {count}
            </span>
            {" · "}
            double（createMemo）：
            <span
              className="font-mono font-semibold text-indigo-600 dark:text-indigo-400"
              data-testid="signal-demo-double"
            >
              {double}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                count.value = (c) => c + 1;
              }}
            >
              +1
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                count.value = (c) => c - 1;
              }}
            >
              -1
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                count.value = 0;
              }}
            >
              归零
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            name：<input
              type="text"
              className={`ml-2 ${inputCls}`}
              value={() => name.value}
              onInput={(e: Event) => {
                name.value = (e.target as HTMLInputElement).value;
              }}
            />
          </p>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            {nameLine}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            createEffect 与 onCleanup 已在模块内使用；createMemo 用于 double。
          </p>
        </div>

        {/* 三元、并且、或者：用计数器数值做条件演示 */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-600/80 dark:bg-amber-900/20">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
            TSX 表达式：三元、并且（&&）、或者（||）
          </p>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            当前
            count：<span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
              {count}
            </span>
            {" · "}
            用上方按钮改变 count 观察下面三行是否按条件更新。
            <strong className="ml-1">本示例为手写 jsx-runtime</strong>
            ：插值若在 jsx() 时先求值（如直接写{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              {"count.value"}
            </code>
            ）会变成快照；演示区用无参 getter{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              {"() => ..."}
            </code>
            包一层，与{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              {"{count}"}
            </code>
            、
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              createMemo
            </code>
            等价。若走 <strong>compileSource</strong>
            ，编译器常把{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              {"{ expr }"}
            </code>
            生成{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              insertReactive
            </code>
            ，那时可直接写条件表达式。
          </p>
          <ul className="list-inside list-disc space-y-2 text-slate-600 dark:text-slate-300">
            <li>
              <strong>三元</strong>{" "}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
                {"{ count.value > 1 ? '大于1' : '不大于1' }"}
              </code>
              {" → "}
              <span className="font-mono text-amber-700 dark:text-amber-300">
                {() => (count.value > 1 ? "大于1" : "不大于1")}
              </span>
            </li>
            <li>
              <strong>并且</strong>{" "}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
                {"{ count.value > 0 && <span>... </span> }"}
              </code>
              {" → "}
              {() =>
                count.value > 0 && (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-green-800 dark:bg-green-900/50 dark:text-green-200">
                    count 大于 0 时显示
                  </span>
                )}
            </li>
            <li>
              <strong>或者</strong>{" "}
              <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
                {"{ (count.value === 0 || count.value > 5) && <span>... </span> }"}
              </code>
              {" → "}
              {() =>
                (count.value === 0 || count.value > 5) && (
                  <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">
                    count 为 0 或大于 5 时显示
                  </span>
                )}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
export default SignalDemo;
