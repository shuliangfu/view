/**
 * @module views/context
 * @description 展示上下文提供者/消费者模式。
 */
import {
  createContext,
  createSignal,
  useContext,
} from "@dreamer/view/reactivity";

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

/**
 * Props Signal thunk dogfood（与 Context Proxy 对齐）：
 * 父组件把 Signal-of-object 当 `user={user}` 传入；子组件可急切写
 * `{props.user.name}` / `const user = props.user; {user.name}`，
 * setup untrack 下仍细粒度更新，不会整卡重跑。
 */
function UserCard(props: { user: { name: string; role: string } }) {
  const user = props.user;
  return (
    <div
      className="p-6 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl shadow-inner transition-colors"
      data-demo="eager-props-card"
    >
      <h3 className="font-black text-emerald-700 dark:text-emerald-400 mb-2 uppercase tracking-widest text-xs">
        Props 急切读 (UserCard)
      </h3>
      <div className="space-y-1">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          props.user.name:{" "}
          <span
            className="font-mono text-emerald-600 dark:text-emerald-400"
            data-demo="eager-props-name"
          >
            {props.user.name}
          </span>
        </p>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          user.role:{" "}
          <span className="font-mono text-emerald-600 dark:text-emerald-400">
            {user.role}
          </span>
        </p>
      </div>
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

      <section className="space-y-4" data-demo="eager-props">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Props 急切读（Signal thunk）
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          与 Context 相同：把 Signal 当 prop 传入后，子组件可直接写{" "}
          <code className="text-xs bg-slate-100 dark:bg-slate-900 px-1 rounded">
            {"{props.user.name}"}
          </code>
          ，无需 {"{() => props.user().name}"}。点上方登录／注销即可看到细粒度刷新。
        </p>
        <UserCard user={user} />
      </section>

      <section className="p-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-3xl">
        <h4 className="text-amber-900 dark:text-amber-300 font-bold mb-2">
          架构原理
        </h4>
        <p className="text-amber-700/70 dark:text-amber-400 text-sm font-medium leading-relaxed">
          <b>智能 Context／Props 代理</b>：`useContext` 与经 `jsx()` 传入的
          Signal props 共用 `signal-value-proxy`。直接访问 `user.name` /
          `props.user.name` 时，Proxy 在 setup `untrack` 下返回 `__VIEW_SIGNAL`
          thunk，由 insert 细粒度订阅——组件 setup 不会因字段变化整段重跑。
        </p>
      </section>
    </section>
  );
}
