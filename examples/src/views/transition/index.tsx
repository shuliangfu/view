/**
 * Transition 示例：根据 show 控制挂载/卸载，并用 enter/leave class 配合 CSS 做进入离开动画
 *
 * 不内置动画，由 CSS transition 或 keyframes 配合 enter、leave、duration 实现。
 */

import type { VNode } from "@dreamer/view";
import { createSignal } from "@dreamer/view";
import { Transition } from "@dreamer/view/transition";

export const meta = {
  title: "Transition",
  description: "Transition 组件 enter/leave class 与 duration 实现显隐过渡",
  keywords: "Transition, enter, leave, duration, 过渡, 动画",
};

const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

/** Transition 示例页 */
export function TransitionDemo(): VNode {
  const [visible, setVisible] = createSignal(true);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">
        Transition
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        Transition 组件
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-300 leading-relaxed">
        使用{" "}
        <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
          Transition
        </code>{" "}
        根据 show 控制子节点挂载/卸载，挂载时添加 enter class，卸载前添加 leave
        class 并等待 duration（毫秒）后移除。动画由 CSS 实现。
      </p>

      {/* 本页用到的 enter/leave 样式，仅作演示 */}
      <style>
        {`.transition-enter { opacity: 0; transform: scale(0.95); }
          .transition-enter-active { opacity: 1; transform: scale(1); transition: opacity 0.2s ease, transform 0.2s ease; }
          .transition-leave { opacity: 1; transform: scale(1); }
          .transition-leave-active { opacity: 0; transform: scale(0.95); transition: opacity 0.2s ease, transform 0.2s ease; }`}
      </style>

      <div className={block}>
        <h3 className={subTitle}>显隐切换</h3>
        <p className="mb-3 text-slate-600 dark:text-slate-300">
          点击按钮切换显示/隐藏，下方内容会以淡入淡出 + 缩放过渡。
        </p>
        <button
          type="button"
          className={btn}
          onClick={() => setVisible((v) => !v)}
        >
          {visible() ? "隐藏" : "显示"}
        </button>
        <div className="mt-4">
          <Transition
            show={visible}
            enter="transition-enter transition-enter-active"
            leave="transition-leave transition-leave-active"
            duration={200}
            tag="div"
          >
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700/50">
              <p className="font-medium text-slate-800 dark:text-slate-100">
                这是 Transition 包裹的内容
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                show 为 false 时会先加上 leave class，等待 200ms 后再从 DOM 移除。
              </p>
            </div>
          </Transition>
        </div>
      </div>
    </section>
  );
}
export default TransitionDemo;
