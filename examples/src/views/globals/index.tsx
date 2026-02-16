/**
 * Globals 示例：getDocument、getGlobal、setGlobal
 *
 * - getDocument()：在浏览器中安全获取 document，SSR 环境下会抛错提示勿在服务端使用
 * - getGlobal/setGlobal：在 globalThis 上按 key 存取全局状态，便于跨模块共享
 */

import type { VNode } from "@dreamer/view";
import { createSignal } from "@dreamer/view";
import { getDocument, getGlobal, setGlobal } from "@dreamer/view/globals";

export const meta = {
  title: "Globals",
  description: "getDocument、getGlobal、setGlobal 安全访问 document 与全局状态",
  keywords: "getDocument, getGlobal, setGlobal, SSR, document",
};

/** 用于演示的 global key，避免与框架内部 key 冲突 */
const DEMO_COUNTER_KEY = "__view_demo_global_counter";

const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

/** Globals 示例页 */
export function GlobalsDemo(): VNode {
  /** 从 globalThis 读取并显示的计数器，用 signal 驱动视图更新 */
  const [globalCount, setGlobalCount] = createSignal(
    (getGlobal<number>(DEMO_COUNTER_KEY) ?? 0) as number,
  );

  /** 点击后自增并写回 globalThis，再更新本地 signal 以重绘 */
  const incrementGlobal = () => {
    const next = (getGlobal<number>(DEMO_COUNTER_KEY) ?? 0) + 1;
    setGlobal(DEMO_COUNTER_KEY, next);
    setGlobalCount(next);
  };

  /** 使用 getDocument() 安全获取 document，并读取当前 title 展示 */
  const readDocTitle = () => {
    try {
      const doc = getDocument();
      return doc.title;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const [docTitle, setDocTitle] = createSignal(readDocTitle());

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
        Globals
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        getDocument / getGlobal / setGlobal
      </h2>
      <p className="mb-6 text-slate-600 dark:text-slate-300 leading-relaxed">
        通过{" "}
        <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
          @dreamer/view/globals
        </code>{" "}
        在浏览器中安全访问 document（SSR 下会抛错），以及按 key 在 globalThis 上存取全局状态。
      </p>
      <div className="space-y-6">
        <div className={block}>
          <h3 className={subTitle}>getGlobal / setGlobal</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            当前 globalThis[{DEMO_COUNTER_KEY}] ={" "}
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              {globalCount()}
            </span>
            。点击下方按钮自增并写回 globalThis，刷新页面后仍会保留（同 tab 内）。
          </p>
          <button type="button" className={btn} onClick={incrementGlobal}>
            自增并 setGlobal
          </button>
        </div>
        <div className={block}>
          <h3 className={subTitle}>getDocument()</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            当前 document.title：{" "}
            <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400">
              {docTitle()}
            </span>
          </p>
          <button
            type="button"
            className={btn}
            onClick={() => setDocTitle(readDocTitle())}
          >
            重新读取 document.title
          </button>
        </div>
        <div className="rounded-lg border-l-4 border-rose-500/50 bg-rose-500/5 px-4 py-3 dark:bg-rose-500/10">
          <h3 className={subTitle}>SSR 说明</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            在服务端渲染（renderToString / renderToStream）时调用 getDocument()
            会抛出明确错误，提示不要在服务端使用 document。可在 createEffect
            或 onMount 等仅客户端逻辑中使用 getDocument。
          </p>
        </div>
      </div>
    </section>
  );
}
export default GlobalsDemo;
