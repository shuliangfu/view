/**
 * 将当前请求的 `Cookie` 头放入 AsyncLocalStorage，供 SSR 安装 `document` 时写入
 * `document.cookie`。用 ALS 避免并发请求互相覆盖。
 *
 * 不静态导入 `node:async_hooks`：examples 客户端会打包 `renderToString`，
 * 静态 `node:` 导入会让 esbuild（platform: browser）失败。
 */
function createSsrCookieStore() {
  try {
    const ALS = (
      globalThis as {
        process?: {
          getBuiltinModule?: (name: string) => {
            AsyncLocalStorage: new <T>() => {
              run<R>(store: T, fn: () => R): R;
              getStore(): T | undefined;
            };
          };
        };
      }
    ).process?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage;
    if (ALS) return new ALS<string>();
  } catch {
    /* 浏览器打包环境没有 node builtins */
  }
  let current: string | undefined;
  return {
    run<T>(store: string, fn: () => T): T {
      const prev = current;
      current = store;
      try {
        return fn();
      } finally {
        current = prev;
      }
    },
    getStore: (): string | undefined => current,
  };
}

const ssrCookies = createSsrCookieStore();

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
