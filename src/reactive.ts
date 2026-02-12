/**
 * @dreamer/view/reactive — 响应式对象（用于表单 model 等双向绑定）
 *
 * 职责单一：提供 createReactive(initial)，返回可读写、与 createEffect 联动的代理对象。
 * 不放在 store：store 负责完整状态（getters/actions/persist）；不放在 signal：signal 是 [get, set] 元组。
 *
 * 用法：const model = createReactive({ name: "", age: "" }); <Form model={model} />；表单内 model.name = value 即可双向更新。
 */

import { getCurrentEffect } from "./signal.ts";
import { schedule } from "./scheduler.ts";

type SubscriberSet = Set<() => void>;

/**
 * 为嵌套对象创建代理：get 登记当前 effect，set 通知订阅者
 */
function createNestedProxy<T extends object>(
  target: T,
  subscribers: SubscriberSet,
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

/**
 * 创建响应式对象（Proxy），读写与 createEffect 联动，适合作为表单 model 等「传一个变量、双向更新」的场景
 *
 * @param initial 初始对象（会被浅拷贝，不会直接修改入参）
 * @returns 响应式代理，在 effect 中读取会登记依赖，任意属性赋值会触发订阅更新
 *
 * @example
 * const model = createReactive({ name: "", age: "", sex: "" });
 * <Form model={model} />
 * // 表单内：props.model.name = e.target.value 即可
 */
export function createReactive<T extends Record<string, unknown>>(
  initial: T,
): T {
  const state = { ...initial };
  const subscribers: SubscriberSet = new Set();
  const proxyCache = new WeakMap<object, object>();
  return createNestedProxy(state, subscribers, proxyCache);
}
