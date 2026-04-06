/**
 * @module views/transition
 * @description 展示过场动画与加载转换逻辑。
 */
import { createSignal, Show, useTransition } from "@dreamer/view";

export default function TransitionDemo() {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = createSignal("home");

  const switchTab = (next: string) => {
    startTransition(() => {
      // 模拟一个长延迟的异步切换
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setTab(next);
          resolve();
        }, 1500);
      });
    });
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          渲染转换 (useTransition)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          通过 startTransition 进行低优先级更新。在异步任务完成前保持当前
          UI，并显示加载指示器，避免白屏。
        </p>
      </header>

      <div className="flex gap-3 p-2 bg-slate-100 dark:bg-slate-900 rounded-2xl w-fit transition-colors">
        <button
          type="button"
          onClick={() => switchTab("home")}
          className={() =>
            `px-8 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 ${
              tab() === "home"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-lg dark:shadow-none"
                : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300"
            }`}
        >
          常规内容
        </button>
        <button
          type="button"
          onClick={() => switchTab("slow")}
          className={() =>
            `px-8 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 ${
              tab() === "slow"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-lg dark:shadow-none"
                : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300"
            }`}
        >
          慢速加载
        </button>
      </div>

      <div className="relative p-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2.5rem] min-h-[240px] flex items-center justify-center bg-white dark:bg-slate-800/30 transition-colors">
        {/* 与本卡片绑定的过渡状态：放在内容区顶部居中，表示「当前这一块」在后台更新，而非全局角落提示 */}
        <Show when={isPending}>
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/40 px-4 py-2 rounded-full border border-indigo-100 dark:border-indigo-800 animate-pulse shadow-sm dark:shadow-none z-10">
            <span className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full">
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
              正在后台加载...
            </span>
          </div>
        </Show>

        <Show
          when={() => tab() === "home"}
          fallback={
            <div className="text-center animate-in slide-in-from-bottom-4 duration-700">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto mb-6">
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight mb-2">
                异步内容已就绪
              </h3>
              <p className="text-slate-500 dark:text-slate-400 font-medium">
                这段内容经过了并发模式的平滑转换。
              </p>
            </div>
          }
        >
          <div className="text-center animate-in fade-in duration-500">
            <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight mb-2">
              常规首页展示
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              点击上方切换标签，体验过渡效果。
            </p>
          </div>
        </Show>
      </div>
    </section>
  );
}
