/**
 * @module views/portal
 * @description 展示传送门 (Portal) 技术，用于实现 Modal/Tooltip 等全局层。
 */
import { createSignal, Portal, Show } from "@dreamer/view";

export default function PortalDemo() {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          传送门 (Portal)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          将组件渲染到文档的任何位置（通常是
          document.body），同时保持其父子关系和状态通信。
        </p>
      </header>

      <div className="relative p-16 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl bg-slate-50 dark:bg-slate-900/50 overflow-hidden transition-colors">
        <div className="text-center space-y-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            这是一个 overflow: hidden 的受限容器
          </p>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="mx-auto block bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95"
          >
            打开全局模态框
          </button>
        </div>

        <Show when={isOpen}>
          <Portal>
            {/* 这里的 DOM 将渲染在 body 根级，但仍受本组件状态控制 */}
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 px-4">
              <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 shadow-2xl max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-500">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
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
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    Portal Modal
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                    我渲染在 body
                    根级，因此完全不受父容器限制。我支持正常的响应式更新和主题切换。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:opacity-90 transition-all active:scale-95"
                >
                  我知道了
                </button>
              </div>
            </div>
          </Portal>
        </Show>
      </div>
    </section>
  );
}
