/**
 * Globals 示例：getDocument、getGlobal、setGlobal
 *
 * - getDocument()：浏览器或 SSR 影子 document；不可用时返回 null，不抛错
 * - getGlobal/setGlobal：在 globalThis 上按 key 存取全局状态，便于跨模块共享
 *
 * **jsx: "runtime"**：`{globalCount.value}` / `{docTitle.value}` 在 `jsx()` 时已是快照，点击改 signal 后文案不会变；
 * 动态展示请传 **`{globalCount}`**、**`{docTitle}`**（SignalRef 在 normalizeChildren 中转为 getter，走 insertReactive）。
 * **compileSource** 下编译器会把裸 `.value` 插值包成响应式，与手写 runtime 不同。
 *
 * 调试点击：编译产物为 `button.addEventListener("click", handler)`。若控制台无任何输出：
 * - 确认 DevTools 的上下文是当前页面（非 extension），且未过滤掉 log；
 * - 看 Console 是否有未捕获错误导致后续脚本未执行；
 * - 在 Elements 里选中按钮，Chrome 可执行 getEventListeners($0) 查看是否挂了 click。
 */

import type { VNode } from "@dreamer/view";
import { createSignal } from "@dreamer/view";
import { getDocument, getGlobal, setGlobal } from "@dreamer/view/globals";

export const metadata = {
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
  const globalCount = createSignal(
    (getGlobal<number>(DEMO_COUNTER_KEY) ?? 0) as number,
  );

  /** 点击后自增并写回 globalThis，再更新本地 signal 以重绘 */
  const incrementGlobal = () => {
    const next = (getGlobal<number>(DEMO_COUNTER_KEY) ?? 0) + 1;
    setGlobal(DEMO_COUNTER_KEY, next);
    globalCount.value = next;
  };

  /** 使用 getDocument() 安全获取 document，并读取当前 title 展示 */
  const readDocTitle = () => {
    try {
      const doc = getDocument();
      if (!doc) return;
      return doc.title;
    } catch (e) {
      return (e as Error).message;
    }
  };
  /** 最近一次读取的 document.title，用于展示 */
  const docTitle = createSignal<string | null>(null);

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
        在浏览器或 SSR 影子周期内访问 document（否则为 null），以及按 key 在
        globalThis 上存取全局状态。
      </p>
      <div className="space-y-6">
        <div className={block}>
          <h3 className={subTitle}>getGlobal / setGlobal</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            当前 globalThis[{DEMO_COUNTER_KEY}] ={" "}
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              {globalCount}
            </span>
            。点击下方按钮自增并写回 globalThis，刷新页面后仍会保留（同 tab
            内）。
          </p>
          <button
            type="button"
            className={btn}
            data-testid="globals-increment-global"
            onClick={incrementGlobal}
          >
            自增并 setGlobal
          </button>
        </div>
        <div className={block}>
          <h3 className={subTitle}>getDocument()</h3>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            当前 document.title：{" "}
            <span className="font-mono text-sm text-indigo-600 dark:text-indigo-400">
              {docTitle}
            </span>
          </p>
          <button
            type="button"
            className={btn}
            onClick={() => (docTitle.value = readDocTitle() ?? null)}
          >
            重新读取 document.title
          </button>
        </div>
        <div className="rounded-lg border-l-4 border-rose-500/50 bg-rose-500/5 px-4 py-3 dark:bg-rose-500/10">
          <h3 className={subTitle}>SSR 说明</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            在 renderToString / renderToStream 周期内会设置影子 document，此时
            getDocument() 与编译产物一致可拿到伪 DOM；若仅标记 SSR
            但未挂影子则返回 null。真实浏览器中始终用 globalThis.document。
          </p>
        </div>
      </div>
    </section>
  );
}
export default GlobalsDemo;
