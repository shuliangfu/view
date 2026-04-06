/**
 * @module runtime/ssr-promises
 * @description 异步 SSR 期间由 createResource 等注册的 Promise 队列，供 `renderToStringAsync` / `renderToStream` 排空。
 *
 * 独立文件以避免 `resource.ts` 静态依赖 `server.ts`（SSR 入口体积与副作用隔离）。
 */

/**
 * 异步 SSR 期间由 {@link registerSSRPromise} 收集的 Promise 队列，供 `renderToStringAsync` 等排空。
 */
export const ssrPromises: Promise<unknown>[] = [];

/**
 * 将资源加载 Promise 登记到全局队列，便于异步 SSR 轮次 `await` 全部完成。
 * @param p 任意 Promise（通常为 `fetch` 链）
 * @returns `void`
 */
export function registerSSRPromise(p: Promise<unknown>) {
  ssrPromises.push(p);
}
