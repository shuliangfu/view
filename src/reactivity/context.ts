/**
 * @module reactivity/context
 * @description 全局状态共享 (Context API)。
 *
 * **支持的功能：**
 * - ✅ createContext() - 创建上下文对象
 * - ✅ Provider - 提供上下文值 (支持 value 是函数或信号)
 * - ✅ useContext() - 消费上下文 (支持 Proxy 响应式访问)
 * - ✅ 支持信号作为上下文值 (value={signal})
 * - ✅ 透明 Provider (不创建新的 Owner)
 *
 * **核心机制：**
 * - Owner 链上的上下文查找
 * - Proxy 实现响应式访问
 * - 支持 [getter, setter] 元组
 * - 正确的 this 绑定处理
 *
 * **范围说明：**
 * - 嵌套 Provider 按 Owner 链就近覆盖；类型推导随 TS 版本迭代；Proxy 开销在典型场景可接受。
 *
 * @usage
 * const UserContext = createContext()
 * <UserContext.Provider value={user}>
 *   <UserProfile/>
 * </UserContext.Provider>
 */

import { getOwner } from "./owner.ts";

/** Context 对象接口 */
export interface Context<T> {
  Provider: (
    props: { value: T | (() => T) | [() => T, any]; children: any },
  ) => any;
  id: symbol;
  defaultValue?: T;
}

/**
 * 创建一个上下文对象。
 */
export function createContext<T>(defaultValue?: T): Context<T> {
  const id = Symbol("context");

  const context = {
    id,
    defaultValue,
    Provider(props: { value: T | (() => T) | [() => T, any]; children: any }) {
      // 关键修复：不在新的 Owner 中执行，而是在当前 Owner 上设置上下文
      const owner = getOwner();

      // 智能解析 value，支持 createSignal 的两种用法
      let contextValue = props.value;

      if (Array.isArray(props.value) && props.value.length >= 1) {
        // [getter, setter] 元组的情况
        contextValue = props.value[0];
      } else if (typeof props.value === "function") {
        // 直接传入 getter 函数的情况
        contextValue = props.value;
      }

      if (owner) {
        if (!owner.contexts) owner.contexts = new Map();
        owner.contexts.set(id, contextValue);
      }

      // 直接返回 children，不创建新的 Owner
      return props.children;
    },
  };

  // 标记 Provider 为透明组件，不创建新的 Owner
  (context.Provider as any).__IS_TRANSPARENT_PROVIDER = true;

  return context;
}

/**
 * 在当前作用域获取上下文。
 */
export function useContext<T>(context: Context<T>): T {
  const id = context.id;
  let current = getOwner();

  while (current) {
    if (current.contexts && current.contexts.has(id)) {
      let value = current.contexts.get(id);

      // 如果 value 是函数，执行它获取实际值
      if (typeof value === "function") {
        value = value();
      }

      if (value && (typeof value === "object" || typeof value === "function")) {
        return new Proxy(value, {
          get(target, prop) {
            let data = target;
            if (typeof target === "function") {
              data = target();
            }

            if (data == null) return undefined;

            const res = Reflect.get(data, prop);

            if (typeof res === "function") {
              if ((res as any).__VIEW_SIGNAL) {
                (res as any)(); // 显式追踪
                return res;
              }
              return res.bind(data);
            }
            return res;
          },
          set(target, prop, val) {
            let data = target;
            if (typeof target === "function") {
              data = target();
            }
            if (data && typeof data === "object") {
              data[prop] = val;
              return true;
            }
            return false;
          },
        }) as T;
      }
      return value;
    }
    current = current.owner;
  }

  return context.defaultValue as T;
}
