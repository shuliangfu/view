/**
 * @module views/control-flow
 * @description 展示 @dreamer/view 核心控制流组件。
 */
import {
  createContext,
  createSignal,
  Dynamic,
  For,
  Index,
  Match,
  Show,
  Switch,
  useContext,
} from "@dreamer/view";

const UserContext = createContext({ name: "Guest", role: "none" });

function DeepChild() {
  const user = useContext(UserContext);
  return (
    <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800 rounded-xl">
      <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 dark:text-indigo-500 mb-3">
        当前用户信息 (Consumer)
      </h5>
      <div className="space-y-1">
        <p className="text-sm font-bold dark:text-slate-300">
          用户名:{" "}
          <span className="text-indigo-600 dark:text-indigo-400">
            {user.name}
          </span>
        </p>
        <p className="text-sm font-bold dark:text-slate-300">
          角色:{" "}
          <span className="text-indigo-600 dark:text-indigo-400">
            {user.role}
          </span>
        </p>
      </div>
    </div>
  );
}

function MiddleLayer() {
  return (
    <div className="p-6 border border-slate-100 dark:border-slate-700 rounded-2xl">
      <h4 className="text-sm font-bold mb-4 dark:text-slate-300 text-slate-600">
        中间层组件 (不传递 Props)
      </h4>
      <DeepChild />
    </div>
  );
}

export default function ControlFlowDemo() {
  const [tab, setTab] = createSignal<"a" | "b" | "none">("a");
  const [fruits, setFruits] = createSignal(["苹果", "橙子", "香蕉"]);
  const [scores, setScores] = createSignal([88, 92, 75]);
  const [panelOpen, setPanelOpen] = createSignal(true);
  const [emphasisTag, setEmphasisTag] = createSignal<"em" | "span">("em");
  const [user, setUser] = createSignal({ name: "Guest", role: "none" });

  return (
    <section className="space-y-12">
      {/* 1. Switch / Match */}
      <section className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold italic dark:text-slate-100">
          多路分支 (Switch / Match)
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("a")}
            className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-300 transition-all active:scale-95"
          >
            显示 A
          </button>
          <button
            type="button"
            onClick={() => setTab("b")}
            className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-300 transition-all active:scale-95"
          >
            显示 B
          </button>
          <button
            type="button"
            onClick={() => setTab("none")}
            className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-300 transition-all active:scale-95"
          >
            隐藏全部
          </button>
        </div>

        <Switch
          fallback={
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl italic text-slate-400 dark:text-slate-500 text-sm">
              目前没有任何匹配项
            </div>
          }
        >
          <Match when={() => tab() === "a"}>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl text-indigo-700 dark:text-indigo-300 font-medium animate-in fade-in duration-300">
              选项 A 已激活
            </div>
          </Match>
          <Match when={() => tab() === "b"}>
            <div className="p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-xl text-violet-700 dark:text-violet-300 font-medium animate-in fade-in duration-300">
              选项 B 已激活
            </div>
          </Match>
        </Switch>
      </section>

      {/* 2. For (Keyed) */}
      <section className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold italic dark:text-slate-100">
          列表循环 (For)
        </h2>
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">
          适用于唯一标识符的列表，极致复用 DOM。
        </p>
        <ul className="space-y-2">
          <For
            each={fruits}
            fallback={
              <li className="text-red-500 dark:text-red-400 italic p-2 bg-red-50 dark:bg-red-900/20 rounded">
                暂无水果数据
              </li>
            }
          >
            {(item: string, index: () => number) => (
              <li className="p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center transition-colors">
                <span className="font-medium dark:text-slate-200">
                  {() => index() + 1}. {item}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFruits((prev) => prev.filter((f) => f !== item));
                  }}
                  className="px-3 py-1 text-xs font-bold bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-all"
                >
                  删除
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show
          when={() => fruits().includes("西瓜")}
          fallback={
            <button
              type="button"
              onClick={() => setFruits([...fruits(), "西瓜"])}
              className="text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline"
            >
              增加西瓜
            </button>
          }
        >
          <button
            type="button"
            onClick={() => setFruits(["苹果", "橙子", "香蕉"])}
            className="text-red-500 dark:text-red-400 font-bold text-sm hover:underline"
          >
            重置列表
          </button>
        </Show>
      </section>

      {/* 3. Index (Non-Keyed) */}
      <section className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold italic dark:text-slate-100">
          基于索引的循环 (Index)
        </h2>
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">
          适用于基础值列表（如数字数组）。
        </p>
        <div className="flex gap-2">
          <Index each={scores}>
            {(score: number, _index: () => number) => (
              <div className="p-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl w-12 h-12 flex items-center justify-center font-black shadow-lg shadow-indigo-100 dark:shadow-none animate-in zoom-in duration-300">
                {score}
              </div>
            )}
          </Index>
        </div>
        <button
          type="button"
          onClick={() => setScores((s) => s.map((v) => v + 5))}
          className="text-indigo-600 dark:text-indigo-400 font-bold text-sm hover:underline"
        >
          全部增加 5 分
        </button>
      </section>

      {/* 4. Show & Dynamic */}
      <section className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold italic dark:text-slate-100">
          显示控制 (Show) 与 动态组件 (Dynamic)
        </h2>
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen())}
          className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold text-sm hover:bg-indigo-100 transition-all"
        >
          {() => panelOpen() ? "关闭面板" : "开启面板"}
        </button>
        <Show when={panelOpen}>
          <div className="p-6 border border-slate-100 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-900/50 animate-in fade-in slide-in-from-top-2 duration-500">
            <h4 className="font-black mb-4 uppercase text-[10px] tracking-[0.2em] text-slate-400 dark:text-slate-500">
              内部面板 (Scoped Content)
            </h4>
            <div className="flex items-center gap-6">
              <span className="text-sm font-medium dark:text-slate-300">
                动态渲染标签：
              </span>
              <Dynamic
                component={emphasisTag}
                className="text-indigo-600 dark:text-indigo-400 font-black text-lg"
              >
                响应式动态内容
              </Dynamic>
              <button
                type="button"
                onClick={() =>
                  setEmphasisTag((t) => t === "em" ? "span" : "em")}
                className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:border-indigo-500 transition-all"
              >
                切换标签 (Current: {() => emphasisTag()})
              </button>
            </div>
          </div>
        </Show>
      </section>

      {/* 5. Context API */}
      <section className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm space-y-6 transition-colors">
        <header>
          <h2 className="text-xl font-bold italic dark:text-slate-100">
            上下文集成 (Context API)
          </h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 italic mt-1">
            通过根级 Provider 注入状态，任意深度的子组件均可获取其响应式数据。
          </p>
        </header>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUser({ name: "Admin", role: "superuser" })}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-lg hover:bg-indigo-700 transition-all active:scale-95"
          >
            登录为管理员
          </button>
          <button
            type="button"
            onClick={() => setUser({ name: "Guest", role: "none" })}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-all active:scale-95"
          >
            注销
          </button>
        </div>

        <UserContext.Provider value={user}>
          <MiddleLayer />
        </UserContext.Provider>
      </section>
    </section>
  );
}
