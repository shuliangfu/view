/**
 * @dreamer/view 加载占位符示例
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4 text-indigo-600">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-indigo-100 rounded-full">
        </div>
        <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin">
        </div>
      </div>
      <p className="text-sm font-bold uppercase tracking-[0.2em] animate-pulse">
        正在构建精彩内容...
      </p>
    </div>
  );
}
