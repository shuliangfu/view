/**
 * @dreamer/view 错误 fallback 页面示例
 */
export default function ErrorPage(props: { error: Error; reset: () => void }) {
  return (
    <div className="p-8 bg-red-50 border-2 border-red-200 rounded-3xl space-y-6 max-w-2xl mx-auto my-12">
      <div className="flex items-center gap-4 text-red-600">
        <span className="text-4xl">⚠️</span>
        <h2 className="text-2xl font-black uppercase tracking-tighter">
          运行时崩溃 (Runtime Error)
        </h2>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-inner border border-red-100 overflow-auto max-h-60">
        <pre className="text-xs font-mono text-red-800 whitespace-pre-wrap">{props.error.stack || props.error.message}</pre>
      </div>

      <button
        type="button"
        onClick={props.reset}
        className="w-full bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 shadow-xl transition-all active:scale-95"
      >
        尝试重置并重新渲染
      </button>
    </div>
  );
}
