/**
 * @dreamer/view 404 页面示例
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <h1 className="text-9xl font-black text-slate-200">404</h1>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-800">页面未找到</h2>
        <p className="text-slate-500 italic">
          抱歉，您访问的页面似乎漂流到了虚空之中。
        </p>
      </div>
      <a
        href="/"
        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all"
      >
        返回首页
      </a>
    </div>
  );
}
