/**
 * Runtime：createRoot、render、renderToString、generateHydrationScript、renderToStream
 *
 * - createRoot(fn, container)：创建响应式根，fn 内读到的 signal 变化会重新执行并更新 DOM
 * - render(fn, container)：等同于 createRoot
 * - renderToString(fn)：SSR/SSG 输出 HTML 字符串
 * - generateHydrationScript(options)：Hybrid 时注入脚本 HTML
 * - renderToStream(fn)（view/stream）：流式 SSR，服务端逐块输出
 */

import {
  createSignal,
  generateHydrationScript,
  renderToString,
} from "@dreamer/view";
import type { VNode } from "@dreamer/view";

const [ssrSample, setSsrSample] = createSignal("Hello SSR");

/** 用于 renderToString 的简单组件 */
function SsrSample(): VNode {
  return <div>renderToString 输出：{ssrSample()}</div>;
}

/** 当前 renderToString 结果（用 signal 存，点击更新时重新生成） */
const [html, setHtml] = createSignal("");

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
/** 统一输入框样式 */
const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";
const codeRootStr = "createRoot(() => <App />, container)";
const codeRenderStr = "render(fn, container)";
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

export function RuntimeDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">
        Runtime
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createRoot / render / renderToString / generateHydrationScript
      </h2>
      <div className="space-y-6">
        <p className="text-slate-600 dark:text-slate-300">
          本示例入口使用{" "}
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-800 dark:bg-slate-700 dark:text-slate-200">
            {codeRootStr}
          </code>{" "}
          挂载。{" "}
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-800 dark:bg-slate-700 dark:text-slate-200">
            {codeRenderStr}
          </code>{" "}
          与 createRoot 等价。
        </p>
        <div className={block}>
          <h3 className={subTitle}>renderToString（SSR 输出）</h3>
          <p className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              className={inputCls}
              value={() => ssrSample()}
              onInput={(e: Event) =>
                setSsrSample((e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              className={btn}
              onClick={() => setHtml(renderToString(() => <SsrSample />))}
            >
              生成 HTML
            </button>
          </p>
          <pre className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-800 overflow-auto dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
            {() => html() || "点击「生成 HTML」查看 renderToString 结果"}
          </pre>
        </div>
        <div className={block}>
          <h3 className={subTitle}>
            generateHydrationScript（可注入的脚本 HTML）
          </h3>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            用于 Hybrid：服务端将 data 与客户端脚本注入 HTML，客户端通过
            <code className="mx-1 rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-600/80">
              window.__VIEW_DATA__
            </code>
            读取并执行 hydrate(fn, container)。
          </p>
          <pre className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-xs text-slate-800 overflow-auto dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 whitespace-pre-wrap break-all">
            {generateHydrationScript({
              data: { userId: 1, preload: true },
              dataKey: "__VIEW_DATA__",
              scriptSrc: "/client.js",
            })}
          </pre>
        </div>
        <div className="rounded-lg border-l-4 border-sky-500/50 bg-sky-500/5 px-4 py-3 dark:bg-sky-500/10">
          <h3 className={subTitle}>renderToStream（view/stream）</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
            流式 SSR：在 Node/Deno 服务端使用，边渲染边输出，适合首屏流式响应。
          </p>
          <pre className="rounded-lg bg-slate-100 dark:bg-slate-700 p-3 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto">
            {`import { renderToStream } from "@dreamer/view/stream";
// for (const chunk of renderToStream(() => <App />)) {
//   res.write(chunk);
// }`}
          </pre>
        </div>
      </div>
    </section>
  );
}
export default RuntimeDemo;
