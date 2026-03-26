/**
 * 控制流运行时组件示例：`For` / `Index` / `Show` / `Switch`+`Match` / `Dynamic`。
 *
 * **手写 JSX**：可传 **`createSignal` 返回的 ref 本身**（`each={fruits}`、`when={panelOpen}`、`component={emphasisTag}`），
 * 运行时会在 memo 内读 `.value` 并订阅；勿写 `each={fruits.value}`（JSX 先求值，只剩快照）。
 * compileSource 仍会把 `each={expr}` 等编成无参 accessor。与 `vIf` 等可并存。
 */

import type { VNode } from "@dreamer/view";
import { createSignal, Dynamic, For, Index, Show, Switch } from "@dreamer/view";
import type { SwitchMatchCase } from "@dreamer/view";

export const metadata = {
  title: "控制流",
  description: "For、Index、Show、Switch、Match、Dynamic 列表与条件分支示例",
  keywords: "For, Index, Show, Switch, Match, Dynamic, 控制流",
};

/** 列表源：`each={fruits}` 传 SignalRef；亦可用 `each={() => fruits.value}` */
const fruits = createSignal<string[]>(["苹果", "橙子", "香蕉"]);

/** `Index` 与 `For` 同实现，演示数值列表与下标 */
const scores = createSignal<number[]>([92, 88, 76]);

/** `Show` 的 `when` */
const panelOpen = createSignal(false);

/** `Switch` 当前分支键 */
const tab = createSignal<"a" | "b" | "none">("a");

/** `Dynamic`：本征标签名字符串在 `span` / `em` 间切换 */
const emphasisTag = createSignal<"span" | "em">("span");

/**
 * `Switch` 的 `matches`：手写 TS 时须显式传入（编译器才会把子级 `Match` 展开为数组）。
 */
const switchMatches: SwitchMatchCase[] = [
  {
    when: () => tab.value === "a",
    children: <span data-testid="cf-switch-a">当前：分支 A</span>,
  },
  {
    when: () => tab.value === "b",
    children: <span data-testid="cf-switch-b">当前：分支 B</span>,
  },
];

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";

const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";

const subTitle =
  "mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

/**
 * 控制流示例根组件：各块独立 signal，便于在页内点击观察 DOM 变化。
 */
function ControlFlowDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
        控制流
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        For / Index / Show / Switch · Match / Dynamic
      </h2>

      <div className="space-y-10">
        {/* For：列表 + fallback */}
        <div className={block}>
          <p className={subTitle}>For</p>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              each
            </code>{" "}
            订阅列表；空列表时走{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              fallback
            </code>
            。
          </p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-slate-800 dark:text-slate-100">
            {/* each 须为无参 accessor，勿 each={fruits.value} 快照 */}
            <For
              each={() => fruits.value}
              fallback={
                <li className="text-amber-700 dark:text-amber-300">
                  暂无水果（fallback）
                </li>
              }
            >
              {(item, index) => (
                <li data-testid={`cf-for-item-${index}`}>
                  {index + 1}. {item}
                </li>
              )}
            </For>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              data-testid="cf-for-clear"
              onClick={() => {
                fruits.value = [];
              }}
            >
              清空列表
            </button>
            <button
              type="button"
              className={btn}
              data-testid="cf-for-restore"
              onClick={() => {
                fruits.value = ["苹果", "橙子", "香蕉"];
              }}
            >
              恢复三项
            </button>
          </div>
        </div>

        {/* Index：与 For 同实现，强调 (item, index) */}
        <div className={block}>
          <p className={subTitle}>Index</p>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            与{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              For
            </code>{" "}
            共享运行时；适合按索引展示的列表。
          </p>
          <ul
            className="list-decimal space-y-1 pl-5 text-slate-800 dark:text-slate-100"
            data-testid="cf-index-list"
          >
            <Index each={scores}>
              {(score, idx) => (
                <li>
                  第 {idx} 项分数：<strong>{score}</strong>
                </li>
              )}
            </Index>
          </ul>
          <button
            type="button"
            className={btn + " mt-3"}
            data-testid="cf-index-bump"
            onClick={() => {
              scores.value = scores.value.map((s) => s + 1);
            }}
          >
            每项 +1
          </button>
        </div>

        {/* Show */}
        <div className={block}>
          <p className={subTitle}>Show</p>
          <div className="mb-3 min-h-6 text-slate-800 dark:text-slate-100">
            <Show
              when={panelOpen}
              fallback={
                <span className="text-slate-500" data-testid="cf-show-fallback">
                  面板关闭（fallback）
                </span>
              }
            >
              {(v: boolean) => (
                <span className="text-emerald-700 dark:text-emerald-300">
                  面板打开，when 值为 {String(v)}
                </span>
              )}
            </Show>
          </div>
          <button
            type="button"
            className={btn}
            data-testid="cf-show-toggle"
            onClick={() => {
              panelOpen.value = !panelOpen.value;
            }}
          >
            切换 Show
          </button>
        </div>

        {/* Switch + Match */}
        <div className={block}>
          <p className={subTitle}>Switch · Match</p>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            按顺序匹配首个为真的{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              Match
            </code>
            ；否则走{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              fallback
            </code>
            。
          </p>
          <div
            className="mb-3 min-h-6 font-medium text-slate-800 dark:text-slate-100"
            data-testid="cf-switch-outlet"
          >
            <Switch
              matches={switchMatches}
              fallback={
                <span data-testid="cf-switch-fallback">无匹配分支</span>
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                tab.value = "a";
              }}
            >
              A
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                tab.value = "b";
              }}
            >
              B
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                tab.value = "none";
              }}
            >
              无匹配
            </button>
          </div>
        </div>

        {/* Dynamic：本征标签名 */}
        <div className={block}>
          <p className={subTitle}>Dynamic</p>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              component
            </code>{" "}
            可为本征标签字符串或函数组件；此处在{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              span
            </code>{" "}
            /{" "}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-600/80">
              em
            </code>{" "}
            间切换。
          </p>
          <div className="mb-3 text-slate-800 dark:text-slate-100">
            <Dynamic
              component={emphasisTag}
              className="text-indigo-600 dark:text-indigo-400"
            >
              这段文字随标签类型改变强调样式
            </Dynamic>
          </div>
          <button
            type="button"
            className={btn}
            data-testid="cf-dynamic-toggle"
            onClick={() => {
              emphasisTag.value = emphasisTag.value === "span" ? "em" : "span";
            }}
          >
            切换 span / em
          </button>
        </div>
      </div>
    </section>
  );
}

export default ControlFlowDemo;
