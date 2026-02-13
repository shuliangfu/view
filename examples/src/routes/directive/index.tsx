/**
 * 指令示例：内置 vIf/vElse/vElseIf、vFor、vShow、vOnce、vCloak，以及自定义指令（如 v-focus）。
 *
 * JSX 中用 camelCase：vIf、vElse、vElseIf、vFor、vShow、vOnce、vCloak。
 * 表单双向绑定：使用 value + onInput/onChange 与 createSignal 或 createReactive。
 */

import { createSignal } from "@dreamer/view";
import { registerDirective } from "@dreamer/view/directive";
import type { VNode } from "@dreamer/view";

/** 注册自定义指令：挂载时 focus（引擎已在 mounted 时延后到微任务，元素已入文档） */
registerDirective("v-focus", {
  mounted(el: Element) {
    (el as HTMLInputElement).focus();
  },
});

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
/** 统一输入框样式 */
const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";

const [tab, setTab] = createSignal<"a" | "b" | "c">("a");
const [show, setShow] = createSignal(true);
const [list, setList] = createSignal(["苹果", "香蕉", "橙子"]);
const [vModelText, setVModelText] = createSignal("");
const [vModelChecked, setVModelChecked] = createSignal(false);
/** v-focus 演示用输入框引用，用于「再次聚焦」按钮 */
let focusInputEl: HTMLInputElement | null = null;

/** 子区块标题 */
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
/** 子区块容器 */
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";

export function DirectiveDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
        指令
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        vIf / vElse / vElseIf / vFor / vShow / vOnce / vCloak / 自定义
      </h2>
      <div className="space-y-6">
        <div className={block}>
          <h3 className={subTitle}>v-if / v-else / v-else-if</h3>
          <p className="mb-3 flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => setTab("a")}>
              A
            </button>
            <button type="button" className={btn} onClick={() => setTab("b")}>
              B
            </button>
            <button type="button" className={btn} onClick={() => setTab("c")}>
              C
            </button>
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            <span
              vIf={() => tab() === "a"}
              className="font-medium text-indigo-600 dark:text-indigo-400"
            >
              当前是 A
            </span>
            <span
              vElseIf={() => tab() === "b"}
              className="font-medium text-indigo-600 dark:text-indigo-400"
            >
              当前是 B
            </span>
            <span
              vElse
              className="font-medium text-indigo-600 dark:text-indigo-400"
            >
              当前是 C
            </span>
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>v-show</h3>
          <p className="text-slate-600 dark:text-slate-300">
            <button
              type="button"
              className={btn}
              onClick={() => setShow((x) => !x)}
            >
              切换显示
            </button>
            <span vShow={show} className="ml-2">
              这段由 vShow 控制显隐（不销毁节点）
            </span>
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>v-for</h3>
          <ul
            vFor={() => list()}
            className="mb-3 list-inside list-disc space-y-1 text-slate-600 dark:text-slate-300"
          >
            {(item: unknown, i: number) => (
              <li key={i}>
                {Number.isFinite(i) ? i + 1 : 0}.{" "}
                {item != null ? String(item) : ""}
              </li>
            )}
          </ul>
          <button
            type="button"
            className={btn}
            onClick={() => setList((prev) => [...prev, "新项"])}
          >
            追加一项
          </button>
        </div>
        <div className={block}>
          <h3 className={subTitle}>v-once</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            v-once：只渲染一次，不随 signal 更新。当前 tab 快照：
            <span
              vOnce
              className="font-medium text-indigo-600 dark:text-indigo-400"
            >
              {tab()}
            </span>
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>v-cloak</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            v-cloak：挂载前通过 CSS [data-view-cloak] 隐藏，hydrate 后移除，减少
            FOUC。
          </p>
          <p vCloak className="text-slate-600 dark:text-slate-300">
            此段带 vCloak，未激活前可被 CSS 隐藏。
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>表单 value + onInput/onChange 双向绑定</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            value + onInput/onChange 与 createSignal（或
            createReactive）即可双向同步。
          </p>
          <p className="mb-2 flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
            <input
              type="text"
              className={inputCls}
              placeholder="输入即同步"
              value={vModelText()}
              onInput={(e: Event) =>
                setVModelText((e.target as HTMLInputElement).value)}
            />
            <span>→ 当前值：{() => vModelText() || "(空)"}</span>
          </p>
          <p className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={vModelChecked()}
                onChange={(e: Event) =>
                  setVModelChecked((e.target as HTMLInputElement).checked)}
              />
              <span>勾选即同步</span>
            </label>
            <span>→ checked：{() => String(vModelChecked())}</span>
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>自定义指令 v-focus</h3>
          <p className="mb-2 text-slate-600 dark:text-slate-300">
            挂载时自动让该输入框获得焦点（出现光标/高亮边框），无需再点一下即可直接输入。若未看到效果，可先点击其它区域再点「再次聚焦」观察。
          </p>
          <p className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
            <input
              type="text"
              className={inputCls}
              placeholder="获得焦点"
              vFocus
              ref={(el: unknown) => {
                focusInputEl = el as HTMLInputElement | null;
              }}
            />
            <button
              type="button"
              className={btn}
              onClick={() => focusInputEl?.focus()}
            >
              再次聚焦
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
export default DirectiveDemo;
