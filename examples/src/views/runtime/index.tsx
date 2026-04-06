/**
 * @module views/runtime
 * @description 展示 @dreamer/view 核心运行时 API：SSR、插入与动态 DOM。
 */
import { createSignal } from "@dreamer/view";
/** 客户端 bundle 不经过 `@dreamer/view/ssr`，避免打入 happy-dom / `node:perf_hooks` */
import { renderToString } from "@dreamer/view/ssr";

export default function RuntimeDemo() {
  const [ssrSample, setSsrSample] = createSignal("梦幻框架演示");
  const [html, setHtml] = createSignal("");

  const getSsrHtml = () => {
    // 现代架构下 renderToString 直接接收一个返回 Node 的函数
    return renderToString(() => (
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
        <h3 className="font-bold text-indigo-700">SSR 渲染结果</h3>
        <p className="text-sm">内容: {ssrSample()}</p>
      </div>
    ));
  };

  const handleGenerate = () => {
    setHtml(getSsrHtml());
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          运行时 API (Runtime API)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          展示核心渲染逻辑。renderToString 在服务器或客户端均可运行，生成静态
          HTML 字符串。
        </p>
      </header>

      <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm space-y-8 transition-colors">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-slate-700/50 pb-4">
          SSR 生成模拟 (renderToString)
        </h2>
        <div className="space-y-6 max-w-md">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-1">
              输入源码
            </label>
            {/* value 须为函数，jsx-runtime 才会对受控属性订阅 signal（与 views/signal 示例一致） */}
            <input
              type="text"
              value={() => ssrSample()}
              onInput={(e: any) => setSsrSample(e.currentTarget.value)}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="输入要 SSR 的内容..."
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="w-full bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <span>🚀</span> 立即生成 HTML 字符串
          </button>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700 transition-colors">
          <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
            生成的 HTML 源码 (Static Output)
          </h3>
          <pre className="text-xs font-mono text-indigo-600 dark:text-indigo-400 whitespace-pre-wrap break-all bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-inner border border-slate-100 dark:border-slate-700">
            {() => html() || "点击「生成 HTML」查看结果"}
          </pre>
        </div>
      </div>
    </section>
  );
}
