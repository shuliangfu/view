/**
 * @description
 * 运行时共享：createRoot、createReactiveRoot、removeCloak、createRender、resolveMountContainer 的通用实现，供 runtime / runtime-csr / runtime-hybrid 复用。
 * 各 runtime 仅注入各自的 effect、dom 等依赖，避免重复代码。
 * @internal 仅由上述 runtime 模块使用，不对外导出
 */

import type { ExpandedRoot } from "./dom/element.ts";
import type { Root, VNode } from "./types.ts";

/** 容器未找到或非 DOM 时 mount 返回的空 Root，避免重复创建对象 */
export const NOOP_ROOT: Root = { unmount: () => {}, container: null };

/**
 * 将 mount 的 container 参数解析为 Element。
 * - 若为 Element 直接返回；
 * - 若为 string 则用 document.querySelector 查找，找不到时根据 noopIfNotFound 返回 null 或抛错。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param noopIfNotFound 为 true 时查不到元素返回 null；为 false 时抛 Error
 * @returns 解析后的元素，或 null（仅当 noopIfNotFound 且未找到时）
 */
export function resolveMountContainer(
  container: string | Element,
  noopIfNotFound: boolean,
): Element | null {
  if (
    typeof container === "object" && container != null &&
    "nodeType" in container
  ) {
    return container as Element;
  }
  const doc = typeof globalThis !== "undefined"
    ? (globalThis as { document?: Document }).document
    : undefined;
  if (!doc) {
    if (noopIfNotFound) return null;
    throw new Error("Mount: document not available (non-DOM environment).");
  }
  const el = doc.querySelector(String(container));
  if (!el) {
    if (noopIfNotFound) return null;
    throw new Error(
      `Mount: container not found for selector "${String(container)}".`,
    );
  }
  return el;
}

/**
 * 移除容器及其子树上的 data-view-cloak 属性，配合 CSS [data-view-cloak]{display:none} 减少 FOUC。
 * createRoot 首次 append 后、hydrate 激活后均由运行时调用，业务侧无需手动移除。
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
    let lastVnodeRef: VNode | null = null;
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
        lastVnodeRef = null;
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
        // 根 VNode 引用未变且已挂载时跳过 expand/patch，减少无意义重算（如 memo 或稳定引用）
        if (
          vnode === lastVnodeRef &&
          mounted != null &&
          container.contains(mounted)
        ) {
          return;
        }
        lastVnodeRef = vnode;
        const newExpanded = expandVNode(vnode);
        if (mounted == null || !container.contains(mounted)) {
          mounted = createNodeFromExpanded(newExpanded);
          container.appendChild(mounted);
          lastExpanded = newExpanded;
          removeCloak(container);
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
 * 判断是否为 dweb 的 viewState 形态（含 page / props / layouts / skipLayouts），用于同状态去重。
 */
function isViewStateLike(
  s: unknown,
): s is {
  page: unknown;
  props?: Record<string, unknown>;
  layouts?: unknown[];
  skipLayouts?: boolean;
} {
  return (
    typeof s === "object" &&
    s !== null &&
    "page" in s
  );
}

/**
 * 对 dweb viewState 做等价比较：同 page、同 skipLayouts、props 浅比较、layouts 长度与每项 component 一致则视为相同，
 * 避免 setViewState 多次传入等价状态时根 effect 重复跑、子 createEffect 被多次执行。
 */
function viewStateEquals(
  a: {
    page: unknown;
    props?: Record<string, unknown>;
    layouts?: unknown[];
    skipLayouts?: boolean;
  },
  b: {
    page: unknown;
    props?: Record<string, unknown>;
    layouts?: unknown[];
    skipLayouts?: boolean;
  },
): boolean {
  if (a.page !== b.page || a.skipLayouts !== b.skipLayouts) return false;
  const ap = a.props ?? {};
  const bp = b.props ?? {};
  if (ap.params !== bp.params || ap.query !== bp.query) return false;
  const al = a.layouts ?? [];
  const bl = b.layouts ?? [];
  if (al.length !== bl.length) return false;
  for (let i = 0; i < al.length; i++) {
    const ac = (al[i] as { component?: unknown })?.component;
    const bc = (bl[i] as { component?: unknown })?.component;
    if (ac !== bc) return false;
  }
  return true;
}

/**
 * 根据「传入的 createRoot」实现 createReactiveRoot：由外部状态驱动，状态变化时在根内做细粒度 patch。
 * 当 state 为 dweb viewState 形态且与上次等价时跳过本次 buildTree，避免根 effect 重复执行、子 createEffect 只跑一次。
 */
export function createReactiveRootWith<T>(
  createRootFn: (fn: () => VNode, container: Element) => Root,
  container: Element,
  getState: () => T,
  buildTree: (state: T) => VNode,
): Root {
  let lastState: T | undefined = undefined;
  let lastVnode: VNode | null = null;

  return createRootFn(() => {
    const state = getState();
    if (
      lastState !== undefined && isViewStateLike(state) &&
      isViewStateLike(lastState)
    ) {
      if (viewStateEquals(state, lastState as typeof state)) {
        return lastVnode!;
      }
    }
    if (lastState === state) {
      return lastVnode!;
    }
    lastState = state;
    const vnode = buildTree(state);
    lastVnode = vnode;
    return vnode;
  }, container);
}
