/**
 * @module views/context
 * @description 展示上下文提供者/消费者模式。
 */
import { createContext, createSignal, useContext } from "@dreamer/view";

// 1. 创建 Context 实例
const UserContext = createContext({ name: "Guest", role: "none" });

// 2. 实现消费者组件
function UserProfile() {
  // 现在的 user 是一个智能代理，直接 user.name 访问即可，且具备响应式
  const user = useContext(UserContext);

  return (
    <div className="p-6 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl shadow-inner transition-colors">
      <h3 className="font-black text-indigo-700 dark:text-indigo-400 mb-2 uppercase tracking-widest text-xs">
        当前用户信息 (Consumer)
      </h3>
      <div className="space-y-1">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          用户名:{" "}
          <span className="font-mono text-indigo-600 dark:text-indigo-400">
            {user.name}
          </span>
        </p>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          角色:{" "}
          <span className="font-mono text-indigo-600 dark:text-indigo-400">
            {user.role}
          </span>
        </p>
      </div>
    </div>
  );
}

// 3. 中间层组件
function MiddleLayer() {
  return (
    <div className="p-8 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm bg-white dark:bg-slate-800 space-y-6 transition-colors">
      <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">
        中间层组件 (不传递 Props)
      </h4>
      <UserProfile />
    </div>
  );
}

export default function ContextDemo() {
  const [user, setUser] = createSignal({ name: "Guest", role: "none" });

  return (
    <section className="space-y-12">
      <header>
        <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          上下文集成 (Context API)
        </h2>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium">
          通过根级 Provider 注入状态，任意深度的子组件均可获取其响应式数据。
        </p>
      </header>

      <section className="space-y-6">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setUser({ name: "Admin", role: "superuser" })}
            className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95"
          >
            登录为管理员
          </button>
          <button
            type="button"
            onClick={() => setUser({ name: "Guest", role: "none" })}
            className="px-6 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all active:scale-95"
          >
            注销
          </button>
        </div>

        <UserContext.Provider value={user}>
          <MiddleLayer />
        </UserContext.Provider>
      </section>

      <section className="p-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-3xl">
        <h4 className="text-amber-900 dark:text-amber-300 font-bold mb-2">
          架构原理
        </h4>
        <p className="text-amber-700/70 dark:text-amber-400 text-sm font-medium leading-relaxed">
          <b>智能 Context 代理</b>：我们现在支持自动解包。 当您通过 `useContext`
          获取一个存储了信号（Signal）的上下文时，框架会自动为您创建一个 Proxy。
          您只需直接访问 `user.name`，Proxy
          内部会自动执行信号函数并触发响应式追踪。
          这使得代码在保持极致性能的同时，拥有了最自然的对象访问语法。
        </p>
      </section>
    </section>
  );
}
