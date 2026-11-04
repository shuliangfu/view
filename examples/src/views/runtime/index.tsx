/**
 * @module views/runtime
 * @description 展示 @dreamer/view 核心运行时 API：SSR、插入与动态 DOM；
 * 3.0：客户端水合 `mismatchMode`（默认 assert@VIEW_DEV／remount@prod；continue 须显式）。
 */
import { createSignal } from "@dreamer/view/reactivity";
import {
  getHydrationMismatches,
  hydrate,
  type HydrationMismatchMode,
  stopHydration,
} from "@dreamer/view/csr";
/** 客户端 bundle 不经过 `@dreamer/view/ssr`，避免打入 happy-dom / `node:perf_hooks` */
import { renderToString } from "@dreamer/view/ssr";

export default function RuntimeDemo() {
  const [ssrSample, setSsrSample] = createSignal("梦幻框架演示");
  const [html, setHtml] = createSignal("");
  const [hydrateLog, setHydrateLog] = createSignal(
    "选择 mismatchMode 后点「试水合」；省略选项 ≡ 3.0 默认（DEV assert／prod remount）。",
  );
  const [lastMode, setLastMode] = createSignal<HydrationMismatchMode | "">("");

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

  /**
   * 轻量 opt-in 试点：用故意错误的 binding path 制造 mismatch，
   * 观察 continue / assert / remount（不改库默认）。
   */
  const runHydratePilot = (mode: HydrationMismatchMode) => {
    const host = document.getElementById("hydrate-pilot-root");
    if (!host) {
      setHydrateLog("找不到 #hydrate-pilot-root");
      return;
    }
    stopHydration();
    host.innerHTML = "<span id=\"ssr-keep\">SSR 节点</span>";
    setLastMode(mode);
    try {
      const dispose = hydrate(
        () => {
          const el = document.createElement("div");
          el.id = "csr-extra";
          el.textContent = `client (${mode})`;
          return el;
        },
        host,
        {
          bindings: [[[99], "missing-pilot"]],
          warnMismatch: false,
          mismatchMode: mode,
        },
      );
      const mismatches = getHydrationMismatches().length;
      const kept = host.querySelector("#ssr-keep") != null;
      const csr = host.querySelector("#csr-extra")?.textContent ?? "";
      setHydrateLog(
        `mode=${mode} · mismatches=${mismatches} · SSR保留=${kept} · CSR="${csr}"`,
      );
      // 演示用：立刻 dispose Owner；continue 下 SSR 子节点默认仍在
      dispose();
      stopHydration();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHydrateLog(`mode=${mode} · 抛错：${msg}`);
      stopHydration();
    }
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          运行时 API (Runtime API)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          展示核心渲染逻辑。renderToString 在服务器或客户端均可运行，生成静态
          HTML 字符串。水合错位策略见下方 P1-2 试点（默认 continue）。
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

      <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm space-y-6 transition-colors">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-slate-700/50 pb-4">
          3.0 水合 mismatchMode
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          故意传入无效 binding path。{" "}
          <code className="text-xs">continue</code>（默认）保留 SSR；
          <code className="text-xs">assert</code> 抛错；
          <code className="text-xs">remount</code> 清空后 CSR。库默认仍为
          continue，此处仅为显式试点。文档：
          <code className="text-xs">docs/zh-CN/P1-2-hydration-opt-in-pilot.md</code>
        </p>
        <div
          id="hydrate-pilot-root"
          className="min-h-[3rem] rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 text-sm bg-slate-50 dark:bg-slate-900/40"
        >
          <span id="ssr-keep">SSR 节点</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {(["continue", "assert", "remount"] as HydrationMismatchMode[]).map(
            (mode) => (
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white dark:bg-indigo-600 hover:opacity-90 active:scale-95"
                onClick={() => runHydratePilot(mode)}
              >
                {() =>
                  lastMode() === mode ? `✓ ${mode}` : `试水合 · ${mode}`}
              </button>
            ),
          )}
        </div>
        <pre className="text-xs font-mono text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
          {() => hydrateLog()}
        </pre>
      </div>
    </section>
  );
}
