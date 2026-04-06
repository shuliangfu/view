/**
 * @module runtime/component
 * @description 高级组件原语：lazy 加载与 Dynamic 组件。
 *
 * **支持的功能：**
 * - ✅ lazy() - 懒加载组件 (代码分割)
 * - ✅ Dynamic() - 动态组件 (运行时切换组件)
 * - ✅ 与 Suspense 的集成
 * - ✅ 异步组件加载
 *
 * **核心机制：**
 * - 使用 createResource 实现懒加载
 * - 动态组件渲染
 * - 加载状态管理
 *
 * **范围说明：**
 * - 加载 UI 由 `Suspense`/`fallback` 与业务组件提供；`prefetch` 可对 `lazy()` 返回的 Promise 手动触发。
 *
 * @usage
 * const LazyComp = lazy(() => import("./Comp.tsx"))
 * <Suspense fallback={<Loading/>}>
 *   <LazyComp/>
 * </Suspense>
 */

import { untrack } from "../reactivity/signal.ts";
import { createResource, type Resource } from "../integrations/resource.ts";
import { spread } from "./props.ts";
import { insert } from "./insert.ts";

/** dev HMR：登记每个 `lazy()` 实例，热更时清空缓存避免继续用旧 `import()` 结果 */
type LazyHmrEntry = { reset: () => void };
const viewLazyHmrRegistry = new Set<LazyHmrEntry>();

/**
 * 开发模式 HMR：清空所有 `lazy()` 包装器的内部缓存，下次渲染会重新执行 `loader()`。
 * 与 `__VIEW_HMR_APPLY__`（路由侧）配合，compiler / jsx-runtime 两条构建路径共用。
 */
export function invalidateViewLazyModules(): void {
  for (const entry of viewLazyHmrRegistry) {
    try {
      entry.reset();
    } catch {
      /* 忽略单个 lazy 重置异常 */
    }
  }
}

/**
 * 懒加载组件。
 * 配合 Suspense 使用，实现代码分割。
 * @param loader 返回 Promise<{ default: Component }> 的函数
 */
export function lazy<T>(
  loader: () => Promise<{ default: (props: T) => any }>,
) {
  let Component: ((props: T) => any) | undefined;
  let resource: Resource<((props: T) => any)> | undefined;

  const hmrEntry: LazyHmrEntry = {
    reset() {
      Component = undefined;
      resource = undefined;
    },
  };
  viewLazyHmrRegistry.add(hmrEntry);

  return (props: T) => {
    if (!resource) {
      resource = createResource<((props: T) => any)>(async () => {
        if (Component) return Component;
        const mod = await loader();
        Component = mod.default;
        return Component;
      });
    }

    return () => {
      const Comp = resource!();
      if (Comp) {
        return untrack(() => Comp(props));
      }
      return document.createTextNode("");
    };
  };
}

/**
 * 动态组件。
 * 根据 component 属性的值切换渲染不同的组件或标签。
 */
export function Dynamic<T>(props: {
  component:
    | string
    | ((props: T) => any)
    | (() => string | ((props: T) => any));
  [key: string]: unknown;
}) {
  return () => {
    let component = props.component;
    // 如果 component 是信号，先解包
    if (typeof component === "function" && component.length === 0) {
      component = (component as any)();
    }

    const [, otherProps] = splitProps(props, ["component"]);

    if (typeof component === "function") {
      return untrack(() => (component as any)(otherProps as T));
    } else if (typeof component === "string") {
      const el = document.createElement(component);
      const { children, ...rest } = otherProps as any;
      spread(el, rest);
      if (children !== undefined) {
        insert(el, children);
      }
      return el;
    }
    return document.createTextNode("");
  };
}

/**
 * 辅助工具：拆分 Props。
 */
export function splitProps<
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  props: T,
  keys: K[],
): [Pick<T, K>, Omit<T, K>] {
  const selectors = new Set(keys);
  const result: [Record<string, unknown>, Record<string, unknown>] = [{}, {}];
  for (const key in props) {
    if (selectors.has(key as unknown as K)) {
      (result[0] as Record<string, unknown>)[key] = props[key];
    } else {
      (result[1] as Record<string, unknown>)[key] = props[key];
    }
  }
  return result as unknown as [Pick<T, K>, Omit<T, K>];
}

type Omit<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P];
};
