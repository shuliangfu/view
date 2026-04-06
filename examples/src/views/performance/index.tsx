/**
 * @module views/performance
 * @description 展示 @dreamer/view 极致性能与高级表单集成。
 */

import { createForm, createSelector, createSignal, For } from "@dreamer/view";

export const metadata = {
  title: "Performance",
  group: "示例",
};

export default function PerformanceDemo() {
  // 1. 演示 createSelector: O(1) 级别的列表高亮切换
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const isSelected = createSelector(selectedId);
  const list = Array.from({ length: 100 }, (_, i) => i);

  // 2. 演示 createForm: 极致简化的受控表单
  const form = createForm({
    username: "dreamer",
    email: "",
    bio: "致力于构建极致性能的前端框架",
  });

  return (
    <div className="space-y-12">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Performance
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          演示 createSelector 与 createForm 带来的极致更新效率。
        </p>
      </header>

      {/* Selector 演示 */}
      <section className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm space-y-6 transition-colors">
        <h2 className="font-black dark:text-slate-100 uppercase tracking-widest text-xs text-slate-400">
          O(1) 列表选择器 (createSelector)
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-xl">
          点击下方方块切换高亮。即使列表很大，更新也是常数级的，只有被选中的节点会触发重绘。
        </p>
        <div className="grid grid-cols-10 gap-2 sm:gap-2">
          <For each={() => list}>
            {(id: number) => (
              <button
                type="button"
                aria-label={`选择项 ${id}`}
                aria-pressed={() => isSelected(id)}
                onClick={() => setSelectedId(id)}
                className={() =>
                  `min-h-8 min-w-8 w-8 h-8 rounded-lg transition-all shrink-0 ${
                    isSelected(id)
                      ? "bg-indigo-600 scale-110 shadow-lg shadow-indigo-200 dark:shadow-none"
                      : "bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
              />
            )}
          </For>
        </div>
        <div className="pt-4 border-t border-slate-50 dark:border-slate-700/50 font-mono text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          当前选中: {() => selectedId() ?? "None"}
        </div>
      </section>

      {/* Form 演示 */}
      <section className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm space-y-8 transition-colors">
        <h2 className="font-black dark:text-slate-100 uppercase tracking-widest text-xs text-slate-400">
          表单颗粒度演示 (createForm)
        </h2>
        <div className="grid grid-cols-1 gap-6 max-w-md">
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">
              用户名
            </label>
            <input
              {...form.field("username")}
              className="block w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">
              邮箱
            </label>
            <input
              {...form.field("email")}
              type="email"
              placeholder="example@dreamer.com"
              className="block w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">
              个人简介
            </label>
            <textarea
              {...form.field("bio")}
              rows={3}
              className="block w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => console.log("提交数据:", form.data)}
              className="flex-1 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 shadow-xl shadow-indigo-100 dark:shadow-none transition-all active:scale-95"
            >
              打印数据
            </button>
            <button
              type="button"
              onClick={() => form.reset()}
              className="px-6 py-2.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              重置
            </button>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/50">
          <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">
            实时状态追踪 (Reactive Data)
          </h3>
          <pre className="text-xs font-mono text-indigo-600 dark:text-indigo-400 overflow-x-auto">
            {() => JSON.stringify(form.data, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}
