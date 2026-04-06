/**
 * @module views/store
 * @description 展示 @dreamer/view 深度状态管理：produce、reconcile；持久化见 `stores/user.ts`，写操作见 `hooks/user.ts`。
 */
import { createStore, For, produce } from "@dreamer/view";
import {
  incrementLoginCount,
  loginUser,
  logoutUser,
  setUserName,
} from "../../hooks/user.ts";
import { USER_STORE_PERSIST_KEY, userStore } from "../../stores/user.ts";

/** 删除用户演示的 localStorage 并刷新，便于验收 hydrate */
function clearPersistedUser() {
  try {
    globalThis.localStorage?.removeItem(USER_STORE_PERSIST_KEY);
  } catch {
    /* 非浏览器或禁用存储时忽略 */
  }
  globalThis.location?.reload();
}

export default function StoreDemo() {
  // 1. 初始化深度嵌套的状态
  interface Todo {
    id: number;
    text: string;
    completed: boolean;
  }
  // 数组根不支持 [store, setState] 元组解构（与下标 0/1 冲突）；使用代理本身 + setState。
  const todos = createStore<Todo[]>([
    { id: 1, text: "学习 @dreamer/view 核心架构", completed: true },
    { id: 2, text: "掌握 createStore 的精确更新", completed: false },
    { id: 3, text: "性能对比 Solid.js 1.x", completed: false },
  ]);
  const setTodos = todos.setState;

  // 2. 使用 produce 就地修改数组元素（路径式 setter 面向对象根，不适用于「按 id 查找」）
  const toggleTodo = (id: number) => {
    setTodos(
      produce((draft: Todo[]) => {
        const item = draft.find((t) => t.id === id);
        if (item) item.completed = !item.completed;
      }),
    );
  };

  const addTodo = (text: string) => {
    if (!text.trim()) return;
    setTodos((
      prev: Todo[],
    ) => [...prev, { id: Date.now(), text, completed: false }]);
  };

  /**
   * 只序列化业务字段快照，避免对根代理整棵 `stringify` 带来的环引用等问题。
   */
  const todosJson = () =>
    JSON.stringify(
      todos.map((t: Todo) => ({
        id: t.id,
        text: t.text,
        completed: t.completed,
      })),
      null,
      2,
    );

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold dark:text-slate-100">
        深度状态管理 (Store)
      </h2>
      <p className="text-gray-500 dark:text-slate-400 font-medium">
        点击列表项可精确更新其状态。基于路径的响应式更新仅触发受影响节点的重绘。
      </p>

      <section className="max-w-xl space-y-4 p-5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20">
        <div>
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-200">
            <code className="font-mono text-sm">stores/user.ts</code> 只放状态 +
            {" "}
            <code className="font-mono text-xs">persist</code>； 按钮逻辑在{" "}
            <code className="font-mono text-sm">hooks/user.ts</code>
          </h3>
          <p className="text-sm text-indigo-800/80 dark:text-indigo-300/80 mt-1">
            <code className="font-mono text-xs">loginCount</code>{" "}
            等字段持久化到 localStorage；展示用{" "}
            <code className="font-mono text-xs">userStore</code> 字段推导即可。
          </p>
        </div>

        <dl className="grid gap-2 text-sm">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <dt className="text-indigo-600/80 dark:text-indigo-400/90 shrink-0">
              展示文案（视图推导）
            </dt>
            <dd className="font-medium text-indigo-950 dark:text-indigo-100">
              {() => `${userStore.name} (${userStore.role.toUpperCase()})`}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <dt className="text-indigo-600/80 dark:text-indigo-400/90 shrink-0">
              登录次数（持久化）
            </dt>
            <dd className="font-mono tabular-nums text-indigo-950 dark:text-indigo-100">
              {() => userStore.loginCount}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <dt className="text-indigo-600/80 dark:text-indigo-400/90 shrink-0">
              最近登录
            </dt>
            <dd className="text-indigo-950 dark:text-indigo-100">
              {() => userStore.lastLogin ?? "—"}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
            <dt className="text-indigo-600/80 dark:text-indigo-400/90 shrink-0">
              管理员
            </dt>
            <dd>
              <span
                className={() =>
                  userStore.role === "admin"
                    ? "text-xs font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                    : "text-xs text-indigo-700/70 dark:text-indigo-300/70"}
              >
                {() => (userStore.role === "admin" ? "是" : "否")}
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loginUser("Demo User", "user")}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
          >
            loginUser(&quot;Demo User&quot;)
          </button>
          <button
            type="button"
            onClick={() => loginUser("Admin", "admin")}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
          >
            loginUser(…, &quot;admin&quot;)
          </button>
          <button
            type="button"
            onClick={() => incrementLoginCount()}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
          >
            incrementLoginCount()
          </button>
          <button
            type="button"
            onClick={() => logoutUser()}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors"
          >
            logoutUser()
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="新昵称 → setUserName"
            className="flex-1 min-w-[12rem] border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key !== "Enter") return;
              const v = (e.currentTarget as HTMLInputElement).value.trim();
              if (v) setUserName(v);
              (e.currentTarget as HTMLInputElement).value = "";
            }}
          />
        </div>

        <button
          type="button"
          onClick={clearPersistedUser}
          className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
        >
          清除用户持久化并刷新（验收用）
        </button>
      </section>

      <ul className="space-y-2 max-w-md">
        <For each={() => todos}>
          {(todo: Todo) => (
            <li
              onClick={() => toggleTodo(todo.id)}
              className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors bg-white dark:bg-slate-800/50"
            >
              <input
                type="checkbox"
                checked={() => todo.completed}
                className="w-4 h-4 text-indigo-600 rounded bg-transparent border-slate-300 dark:border-slate-600"
                readOnly
              />
              <span
                className={() =>
                  `text-sm transition-colors ${
                    todo.completed
                      ? "line-through text-gray-400 dark:text-slate-500"
                      : "text-slate-700 dark:text-slate-200 font-medium"
                  }`}
              >
                {todo.text}
              </span>
            </li>
          )}
        </For>
      </ul>

      <div className="flex gap-2 max-w-md">
        <input
          type="text"
          placeholder="添加新的待办..."
          className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              addTodo((e.currentTarget as HTMLInputElement).value);
              (e.currentTarget as HTMLInputElement).value = "";
            }
          }}
        />
      </div>

      <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-xl text-xs font-mono transition-colors">
        <h3 className="uppercase text-gray-400 dark:text-slate-500 font-black mb-3 tracking-widest">
          底层 JSON (响应式追踪)
        </h3>
        <pre className="dark:text-indigo-300 overflow-x-auto">{todosJson}</pre>
      </div>
    </section>
  );
}
