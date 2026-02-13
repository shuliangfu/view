/**
 * 嵌套响应式 Proxy：get 登记 effect，set 通知订阅者；供 store / reactive 复用
 */

import { schedule } from "./scheduler.ts";
import { getCurrentEffect } from "./signal.ts";

export function createNestedProxy<T extends object>(
  target: T,
  subscribers: Set<() => void>,
  proxyCache: WeakMap<object, object>,
): T {
  const cached = proxyCache.get(target);
  if (cached) return cached as T;
  const proxy = new Proxy(target, {
    get(t, key: string) {
      const effect = getCurrentEffect();
      if (effect) subscribers.add(effect);
      const value = Reflect.get(t, key);
      if (value !== null && typeof value === "object") {
        return createNestedProxy(
          value as object,
          subscribers,
          proxyCache,
        ) as T[keyof T];
      }
      return value;
    },
    set(t, key: string, value: unknown) {
      const ok = Reflect.set(t, key, value);
      if (ok) subscribers.forEach((run) => schedule(run));
      return ok;
    },
  }) as T;
  proxyCache.set(target, proxy);
  return proxy;
}
