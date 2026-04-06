/**
 * @module runtime/ssr-promises
 * @description 异步 SSR 期间由 createResource 等注册的 Promise 队列，供 `renderToStringAsync` / `renderToStream` 排空。
 *
 * 独立文件以避免 `resource.ts` 静态依赖 `server.ts`（SSR 入口体积与副作用隔离）。
 */

/** 待排空的全局 Promise 列表（由 `registerSSRPromise` 追加） */
export const ssrPromises: Promise<unknown>[] = [];

/**
 * 在异步数据加载路径中注册 Promise，供 SSR 异步渲染轮询完成。
 */
export function registerSSRPromise(p: Promise<unknown>) {
  ssrPromises.push(p);
}
