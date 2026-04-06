/**
 * @module views/resource
 * @description 展示 @dreamer/view 异步资源加载与数据获取。
 */

import {
  createResource,
  createSignal,
  ErrorBoundary,
  type Resource,
  Suspense,
} from "@dreamer/view";

/**
 * 模拟一个异步数据获取 API。
 */
async function fakeApi(id: number) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (id === 3) throw new Error("模拟的网络请求错误 (ID: 3)");
  return { id, name: `用户 ${id}`, bio: "致力于构建极致性能的前端框架" };
}

type UserRecord = { id: number; name: string; bio: string };

/**
 * 仅在子组件内调用 `user()`：若在 ResourceDemo 的 return 里直接写 `user()`，
 * 会订阅 data 信号；请求完成 setData 后整页组件重跑并再次执行 createResource，导致永远 loading。
 */
function UserLoaded(props: { user: Resource<UserRecord> }) {
  const current = props.user();
  if (!current) return null;
  return (
    <div className="p-12 border border-indigo-100 dark:border-indigo-800 rounded-3xl bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950 dark:to-slate-900 shadow-sm text-center animate-in zoom-in-95 duration-500">
      <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl">
        👤
      </div>
      <h3 className="text-5xl font-black text-indigo-700 dark:text-indigo-300 tracking-tighter mb-3">
        {current.name}
      </h3>
      <p className="text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto font-medium">
        {current.bio}
      </p>
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 font-mono">
        ID: {current.id}
      </div>
    </div>
  );
}

export default function ResourceDemo() {
  const [userId, setUserId] = createSignal(1);
  /**
   * 与 Suspense 配合须在边界外创建：同一 resource 在 fallback/内容切换时不应重复 new，
   * register 会先同步再微任务绑定最近 Suspense 栈。
   */
  const user = createResource(userId, fakeApi);

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          异步资源 (Resource)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          通过 createResource 实现响应式数据获取。当 userId
          改变时，数据会自动重新加载。Suspense 会在加载过程中显示 fallback。
        </p>
      </header>

      <div className="flex gap-4 p-4 bg-slate-100 dark:bg-slate-900 rounded-2xl max-w-md mx-auto justify-center transition-colors">
        {[1, 2, 3].map((id) => (
          <button
            type="button"
            onClick={() => setUserId(id)}
            className={() =>
              `px-6 py-2 rounded-xl font-bold border transition-all active:scale-95 ${
                userId() === id
                  ? "bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-200 dark:shadow-none"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
          >
            ID: {id}
          </button>
        ))}
      </div>

      <div className="relative p-10 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl min-h-[260px] bg-white dark:bg-slate-800/50 transition-colors">
        {/* 切换用户 ID 时自动退出错误页并重新加载，否则会一直卡在上一 ID 的 fallback */}
        <ErrorBoundary
          resetKeys={() => [userId()]}
          fallback={(err: any, reset: () => void) => (
            <div className="text-center p-8 space-y-6 animate-in fade-in duration-500">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto text-red-500">
                <svg
                  className="w-10 h-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-black text-red-600 dark:text-red-400 mb-2">
                  加载失败
                </h3>
                <p className="text-red-500 dark:text-red-400 font-medium text-sm max-w-xs mx-auto">
                  {err.message}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all active:scale-95"
              >
                尝试重试
              </button>
            </div>
          )}
        >
          <Suspense
            fallback={() => (
              <div
                className="flex flex-col items-center gap-6 text-slate-500 dark:text-slate-400"
                role="status"
                aria-live="polite"
              >
                <span className="sr-only">正在加载用户数据</span>
                {/* 三点依次上跳（tailwind.css 中 view-resource-dot-jump），比单环旋转更容易看出在加载 */}
                <div
                  className="flex h-12 items-end justify-center gap-3 shrink-0"
                  aria-hidden="true"
                >
                  <span className="view-resource-dot bg-indigo-500 dark:bg-indigo-400" />
                  <span className="view-resource-dot view-resource-dot--delay2 bg-indigo-500 dark:bg-indigo-400" />
                  <span className="view-resource-dot view-resource-dot--delay3 bg-indigo-500 dark:bg-indigo-400" />
                </div>
                <p className="text-sm font-medium">正在加载用户数据...</p>
                {/* fallback 用函数包一层，避免父组件同步渲染时求值 userId() 导致整页重挂载、信号重置为 1 */}
                <p className="text-xs text-slate-400">ID: {userId()}</p>
              </div>
            )}
          >
            <UserLoaded user={user} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </section>
  );
}
