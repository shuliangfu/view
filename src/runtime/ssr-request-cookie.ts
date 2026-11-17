/**
 * 将当前请求的 `Cookie` 头放入 AsyncLocalStorage，供 SSR 安装 `document` 时写入
 * `document.cookie`。用 ALS 避免并发请求互相覆盖。
 */
import { AsyncLocalStorage } from "node:async_hooks";

const ssrCookies = new AsyncLocalStorage<string>();

/**
 * 在回调期间把 `Cookie` 头设为当前 SSR 请求的 cookie 来源。
 * @param header - 请求 `Cookie` 头，可为空
 * @param fn - 同步或返回 Promise 的渲染函数
 */
export function runWithSsrCookies<T>(
  header: string | undefined | null,
  fn: () => T,
): T {
  return ssrCookies.run(header ?? "", fn);
}

/** 当前 SSR 请求的 `Cookie` 头；不在 {@link runWithSsrCookies} 内时为空字符串。 */
export function getSsrCookieHeader(): string {
  return ssrCookies.getStore() ?? "";
}
