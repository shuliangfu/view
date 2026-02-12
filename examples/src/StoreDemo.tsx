/**
 * Store 示例：createStore + getters + actions + persist
 *
 * 展示派生状态（getters）、方法（actions）、持久化（localStorage）的完整用法。
 * 在 JSX 中用 getter 形式（如 () => get().count、getters.double）以保证响应式更新。
 */

import { createStore } from "@dreamer/view/store";
import type { VNode } from "@dreamer/view";

/** Store state 类型（满足 createStore 的 Record<string, unknown> 约束） */
type DemoState = Record<string, unknown> & { count: number; name: string };

const [get, _set, getters, actions] = createStore({
  state: { count: 0, name: "" } as DemoState,
  getters: {
    double(get: () => DemoState) {
      return get().count * 2;
    },
    greeting(get: () => DemoState) {
      return get().name ? `你好，${get().name}！` : "请输入名字";
    },
  },
  actions: {
    increment(
      get: () => DemoState,
      set: (v: DemoState | ((p: DemoState) => DemoState)) => void,
    ) {
      set({ ...get(), count: get().count + 1 });
    },
    reset(
      get: () => DemoState,
      set: (v: DemoState | ((p: DemoState) => DemoState)) => void,
    ) {
      set({ ...get(), count: 0 });
    },
    setName(
      get: () => DemoState,
      set: (v: DemoState | ((p: DemoState) => DemoState)) => void,
      ...args: unknown[]
    ) {
      set({ ...get(), name: args[0] as string });
    },
  },
  persist: { key: "view-demo-store" },
});

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
/** 统一输入框样式 */
const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100";

/** Store 综合 demo：高端卡片分区 */
export function StoreDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        Store
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createStore（getters / actions / persist）
      </h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30">
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            count：<span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
              {() => get().count}
            </span>
            {" · "}
            double：<span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
              {getters.double}
            </span>
          </p>
          <p className="mb-3 text-slate-600 dark:text-slate-300">
            <span className="font-medium text-indigo-600 dark:text-indigo-400">
              {getters.greeting}
            </span>
          </p>
          <input
            type="text"
            className={`mb-3 ${inputCls}`}
            placeholder="输入名字"
            value={() => get().name}
            onInput={(e: Event) =>
              actions.setName((e.target as HTMLInputElement).value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => actions.increment()}
            >
              count +1
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => actions.reset()}
            >
              count 归零
            </button>
          </div>
        </div>
        <p className="rounded-lg border-l-4 border-emerald-500/50 bg-emerald-500/5 px-4 py-3 text-sm text-slate-600 dark:bg-emerald-500/10 dark:text-slate-300">
          状态已持久化到 localStorage（key: view-demo-store），刷新页面会恢复。
        </p>
      </div>
    </section>
  );
}
