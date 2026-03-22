/**
 * Resource：createResource（异步数据源）
 *
 * - 无 source：createResource(fetcher)，refetch 手动重新请求
 * - 有 source：createResource(source, fetcher)，source 变化时自动重新请求
 * - 返回 { data, loading, error, refetch }，可与 Suspense 配合
 */

import { createMemo, createSignal } from "@dreamer/view";
import { createResource } from "@dreamer/view/resource";
import { Suspense } from "@dreamer/view/boundary";
import type { VNode } from "@dreamer/view";

export const metadata = {
  title: "Resource",
  description: "createResource 异步数据与 Suspense 示例",
  keywords: "createResource, Suspense, 异步数据",
};

/**
 * 模拟 API：延迟 800ms 返回；name 使用「用户ID：1」格式，避免用 - 被误认为负数。
 * 约 1/3 概率 reject（随机数 % 3 === 0），用于演示 createResource 的 error 与 Suspense 子树需自行 catch。
 */
function fakeApi(id: number): Promise<{ id: number; name: string }> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.floor(Math.random() * 3) % 3 === 0) {
        reject(new Error(`模拟网络错误（id=${id}）`));
      } else {
        resolve({ id, name: `用户ID：${id}` });
      }
    }, 800);
  });
}

/** 无 source：单次请求，refetch 重新请求 */
const user = createResource(() => fakeApi(1));

/** 有 source：id 变化时自动重新请求 */
const userId = createSignal(1);
const userById = createResource(userId, (id) => fakeApi(id));

/**
 * 将无 source 的 createResource 结果格式化为单行展示文案。
 * 仅供下方 `userResourceLine`（createMemo）使用；不要在 JSX 里直接 `{formatUserResourceLine()}`（runtime 下会在 jsx 创建时快照）。
 */
function formatUserResourceLine(): string {
  const r = user();
  if (r.loading) return "加载中…";
  if (r.error) return `错误：${String(r.error)}`;
  return r.data ? `data: ${r.data.name}` : "无数据";
}

/**
 * 将有 source 的 createResource 结果格式化为单行展示文案。
 * 仅供 `userByIdLine`（createMemo）使用。
 */
function formatUserByIdResourceLine(): string {
  const r = userById();
  if (r.loading) return "加载中…";
  if (r.error) return `错误：${String(r.error)}`;
  return r.data ? `data: ${r.data.name}` : "无数据";
}

/**
 * 手写 jsx-runtime：子节点须为无参 getter（或 SignalRef），挂载时由 insertReactive 订阅依赖。
 * createMemo 返回已标记的 getter，JSX 写 `{userResourceLine}` 即可；勿写 `{userResourceLine()}`。
 */
const userResourceLine = createMemo(() => formatUserResourceLine());

/**
 * 与 `userResourceLine` 相同模式：依赖 userId 与 resource 状态，memo 内会读到双方 signal。
 */
const userByIdLine = createMemo(() => formatUserByIdResourceLine());

/** 统一按钮样式 */
const btn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600";
const block =
  "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-600/80 dark:bg-slate-700/30";
const subTitle =
  "mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

export function ResourceDemo(): VNode {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-lg backdrop-blur dark:border-slate-600/80 dark:bg-slate-800/90 sm:p-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
        Resource
      </p>
      <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
        createResource
      </h2>
      <div className="space-y-6">
        <div className={block}>
          <h3 className={subTitle}>无 source（refetch）</h3>
          <p className="mb-3">
            <button
              type="button"
              className={btn}
              onClick={() => user().refetch()}
            >
              重新请求
            </button>
          </p>
          <p className="font-mono text-sm text-slate-600 dark:text-slate-300">
            {userResourceLine}
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>有 source（id 变化自动请求）</h3>
          <p className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={userId.value === 1
                ? `${btn} ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30`
                : btn}
              onClick={() => (userId.value = 1)}
            >
              id=1
            </button>
            <button
              type="button"
              className={userId.value === 2
                ? `${btn} ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30`
                : btn}
              onClick={() => (userId.value = 2)}
            >
              id=2
            </button>
            <button
              type="button"
              className={userId.value === 3
                ? `${btn} ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30`
                : btn}
              onClick={() => (userId.value = 3)}
            >
              id=3
            </button>
          </p>
          <p className="font-mono text-sm text-slate-600 dark:text-slate-300">
            {userByIdLine}
          </p>
        </div>
        <div className={block}>
          <h3 className={subTitle}>Suspense + Promise</h3>
          <Suspense
            fallback={
              <p className="text-slate-500 dark:text-slate-400">
                Suspense 加载中…
              </p>
            }
          >
            {fakeApi(99)
              .then((d) => (
                <span className="text-slate-600 dark:text-slate-300">
                  加载到：{d.name}
                </span>
              ))
              .catch((err: unknown) => (
                <span className="text-red-600 dark:text-red-400">
                  错误：{String(err)}
                </span>
              ))}
          </Suspense>
        </div>
      </div>
    </section>
  );
}
export default ResourceDemo;
