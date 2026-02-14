/**
 * @description
 * 运行时共享：createRoot、createReactiveRoot、removeCloak、createRender 的通用实现，供 runtime / runtime-csr / runtime-hybrid 复用。
 * 各 runtime 仅注入各自的 effect、dom 等依赖，避免重复代码。
 * @internal 仅由上述 runtime 模块使用，不对外导出
 */

import type { ExpandedRoot } from "./dom/element.ts";
import type { Root, VNode } from "./types.ts";

/**
 * 移除容器及其子树上的 data-view-cloak 属性，配合 CSS [data-view-cloak]{display:none} 减少 FOUC。
 * hydrate 或首次挂载后由 runtime / runtime-hybrid 调用。
 */
export function removeCloak(container: Element): void {
  const list = Array.from(container.querySelectorAll("[data-view-cloak]"));
  if (container.hasAttribute("data-view-cloak")) list.unshift(container);
  for (const el of list) el.removeAttribute("data-view-cloak");
}

/**
 * 根据 createRoot 生成 render 函数，供三处 runtime 复用，避免重复「return createRoot(fn, container)」。
 */
export function createRender(
  createRootFn: (fn: () => VNode, container: Element) => Root,
): (fn: () => VNode, container: Element) => Root {
  return (fn, container) => createRootFn(fn, container);
}

/**
 * 渲染触发 signal 工厂：返回 [getter, setter]，effect 依赖 getter，外部调用 setter(t=>t+1) 触发重跑。
 * 由各 runtime 用 createSignal(0) 注入。
 */
export type CreateRenderTriggerSignal = () => [
  get: () => number,
  set: (value: number | ((prev: number) => number)) => void,
];

/** createRoot 依赖：effect 与 dom 能力由各 runtime 注入 */
export type CreateRootDeps = {
  createEffect: (fn: () => void) => () => void;
  createRunDisposersCollector: () => {
    runDisposers: Array<() => void>;
    getScopeForRun: () => { addDisposer(dispose: () => void): void };
  };
  setCurrentScope: (
    scope: { addDisposer(dispose: () => void): void } | null,
  ) => void;
  isDOMEnvironment: () => boolean;
  /** 用于 forceRender：创建 [getTrigger, setTrigger]，effect 读 getTrigger，forceRender 调 setTrigger(t=>t+1) */
  createRenderTriggerSignal: CreateRenderTriggerSignal;
  expandVNode: (vnode: VNode) => ExpandedRoot;
  createNodeFromExpanded: (expanded: ExpandedRoot) => Node;
  patchRoot: (
    container: Element,
    mounted: Node,
    lastExpanded: ExpandedRoot,
    newExpanded: ExpandedRoot,
  ) => void;
  runDirectiveUnmount: (node: Node) => void;
};

/**
 * 根据注入的依赖生成 createRoot，供各 runtime 复用同一套实现。
 */
export function createCreateRoot(
  deps: CreateRootDeps,
): (fn: () => VNode, container: Element) => Root {
  const {
    createEffect,
    createRunDisposersCollector,
    setCurrentScope,
    isDOMEnvironment,
    createRenderTriggerSignal,
    expandVNode,
    createNodeFromExpanded,
    patchRoot,
    runDirectiveUnmount,
  } = deps;

  return function createRoot(fn: () => VNode, container: Element): Root {
    if (!isDOMEnvironment()) {
      return { unmount: () => {}, container: null };
    }

    const [getTrigger, setTrigger] = createRenderTriggerSignal();
    let mounted: Node | null = null;
    let lastExpanded: ExpandedRoot | null = null;
    let disposed = false;
    const disposers: Array<() => void> = [];
    const { runDisposers, getScopeForRun } = createRunDisposersCollector();

    const root: Root = {
      container,
      unmount() {
        disposed = true;
        disposers.forEach((d) => d());
        disposers.length = 0;
        runDisposers.forEach((d) => d());
        runDisposers.length = 0;
        if (mounted && container.contains(mounted)) {
          runDirectiveUnmount(mounted);
          container.removeChild(mounted);
        }
        mounted = null;
        lastExpanded = null;
      },
      forceRender() {
        setTrigger((t) => t + 1);
      },
    };

    const disposeRoot = createEffect(() => {
      if (disposed) return;
      getTrigger(); // 建立依赖，forceRender 更新 trigger 时 effect 重跑
      setCurrentScope(getScopeForRun());
      try {
        const vnode = fn();
        const newExpanded = expandVNode(vnode);
        if (mounted == null || !container.contains(mounted)) {
          mounted = createNodeFromExpanded(newExpanded);
          container.appendChild(mounted);
          lastExpanded = newExpanded;
        } else {
          patchRoot(container, mounted, lastExpanded!, newExpanded);
          lastExpanded = newExpanded;
        }
      } finally {
        setCurrentScope(null);
      }
    });
    disposers.push(disposeRoot);

    return root;
  };
}

/**
 * 根据「传入的 createRoot」实现 createReactiveRoot：由外部状态驱动，状态变化时在根内做细粒度 patch。
 */
export function createReactiveRootWith<T>(
  createRootFn: (fn: () => VNode, container: Element) => Root,
  container: Element,
  getState: () => T,
  buildTree: (state: T) => VNode,
): Root {
  return createRootFn(() => buildTree(getState()), container);
}
