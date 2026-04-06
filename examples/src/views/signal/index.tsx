/**
 * @module views/signal
 * @description 展示 @dreamer/view 核心响应式原语：Signal、Memo、Effect，并演示 onCleanup、batch。
 *
 * 使用 `jsx: "runtime"`（esbuild react-jsx）时，插值若写 `{count()}` 会在本组件执行时立刻求值，
 * 传入 JSX 的是静态数字，insert 无法订阅 signal；须写成 `{() => count()}` 等形式，让运行时把函数交给 insert/createEffect。
 */
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "@dreamer/view";

export default function SignalDemo() {
  // 1. 创建基础信号
  const [count, setCount] = createSignal(0);
  /** 勿命名为 `name`：与 `<input>` 元素的 DOM 属性 `name` 同域时，`() => name()` 易解析错，导致 value 变成 undefined → 界面出现字面量 "undefined" */
  const [userName, setUserName] = createSignal("Dreamer");

  // 2. 派生状态 (Memo) - 只有依赖项变化时才重新计算
  const double = createMemo(() => count() * 2);

  // 3. 副作用 (Effect)
  createEffect(() => {
    console.log(`[Effect] 当前计数已变为: ${count()}`);
  });

  const greeting = createMemo(() => {
    const currentName = userName();
    return currentName ? `你好，${currentName}！` : "请输入名字";
  });

  /** onCleanup：effect 重跑前会执行上一次的清理（此处清除定时器，避免泄漏） */
  const [tick, setTick] = createSignal(0);
  createEffect(() => {
    const id = globalThis.setInterval(() => {
      setTick((n) => n + 1);
    }, 1000);
    onCleanup(() => globalThis.clearInterval(id));
  });

  /** batch：同一微任务内多次 setSignal，依赖方尽量合并刷新（effect 执行次数可观察） */
  const [bx, setBx] = createSignal(0);
  const [by, setBy] = createSignal(0);
  const [effectRuns, setEffectRuns] = createSignal(0);
  createEffect(() => {
    bx();
    by();
    setEffectRuns((n) => n + 1);
  });

  return (
    <section className="space-y-8">
      <div className="p-6 border rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold dark:text-slate-100">
          基础信号 (Signal)
        </h2>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg min-w-[120px]">
            <span className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold">
              当前值
            </span>
            <span className="text-3xl font-mono text-indigo-600 dark:text-indigo-400">
              {() => String(count())}
            </span>
          </div>
          <div className="flex flex-col items-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg min-w-[120px]">
            <span className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold">
              双倍值 (Memo)
            </span>
            <span className="text-3xl font-mono text-violet-600 dark:text-violet-400">
              {() => String(double())}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCount(count() + 1)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 dark:shadow-none"
          >
            增加计数
          </button>
          <button
            type="button"
            onClick={() => setCount(count() - 1)}
            className="px-4 py-2 border border-slate-200 dark:border-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
          >
            减少计数
          </button>
          <button
            type="button"
            onClick={() => setCount(0)}
            className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
          >
            重置
          </button>
        </div>
      </div>

      <div className="p-6 border rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold dark:text-slate-100">
          双向绑定模拟 (Input)
        </h2>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
            输入您的名字：
          </label>
          <input
            type="text"
            value={() => userName()}
            onInput={(e: any) => setUserName(e.currentTarget.value)}
            className="w-full border dark:border-slate-600 bg-transparent dark:text-slate-100 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            placeholder="在此输入..."
          />
        </div>
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
          {() => greeting()}
        </p>
      </div>

      <div className="p-6 border rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold dark:text-slate-100">
          onCleanup（定时器清理）
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          下方数字每秒 +1；依赖 effect 内{" "}
          <code className="text-xs bg-slate-100 dark:bg-slate-900 px-1 rounded">
            onCleanup
          </code>{" "}
          在 effect 重跑时清除 interval。
        </p>
        <p className="text-2xl font-mono text-emerald-600 dark:text-emerald-400">
          {() => String(tick())}
        </p>
      </div>

      <div className="p-6 border rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm space-y-4 transition-colors">
        <h2 className="text-xl font-bold dark:text-slate-100">
          batch（合并更新）
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          观察「effect 累计执行次数」：连续两次 set 会跑两次 effect；包在{" "}
          <code className="text-xs bg-slate-100 dark:bg-slate-900 px-1 rounded">
            batch
          </code>{" "}
          内两次 set 通常只触发一轮依赖刷新。
        </p>
        <div className="flex flex-wrap gap-4 items-center font-mono text-sm">
          <span className="text-slate-600 dark:text-slate-300">
            {() => `x=${bx()} y=${by()}`}
          </span>
          <span className="text-indigo-600 dark:text-indigo-400">
            {() => `effect 执行次数: ${effectRuns()}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setBx((x) => x + 1);
              setBy((y) => y + 1);
            }}
            className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            连续 set（无 batch）
          </button>
          <button
            type="button"
            onClick={() => {
              batch(() => {
                setBx((x) => x + 1);
                setBy((y) => y + 1);
              });
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            batch 内两次 set
          </button>
        </div>
      </div>
    </section>
  );
}
