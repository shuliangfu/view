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
  /** 节点入文档后对子树补绑事件，保证「先入文档再绑事件」 */
  bindDeferredEventListeners: (root: Node) => void;
};

/** hydrate 依赖：在 CreateRootDeps 基础上增加 hydrateFromExpanded、runDirectiveUnmountOnChildren（先 expand 再 hydrate，组件只跑一次） */
export type HydrateRootDeps = CreateRootDeps & {
  hydrateFromExpanded: (container: Element, expanded: ExpandedRoot) => void;
  runDirectiveUnmountOnChildren: (container: Element) => void;
};

/** 调试：仅当 globalThis.__VIEW_DEBUG__ 为 true 时打印根创建/effect 运行次数，生产包无噪音 */
function viewDebugLog(...args: unknown[]): void {
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as { __VIEW_DEBUG__?: boolean }).__VIEW_DEBUG__
  ) {
    console.log(...args);
  }
}

/** 当前时间戳（ms），用于防抖等 */
function getNow(): number {
  return typeof globalThis.performance !== "undefined" &&
      globalThis.performance.now
    ? globalThis.performance.now()
    : Date.now();
}

/** createRoot / hydrate 共用的 effect 内部状态，由 runBody 读写 */
type RootEffectState = {
  firstApplyTime: number;
  lastVnodeRef: VNode | null;
  mounted: Node | null;
  lastExpanded: ExpandedRoot | null;
  didHydrate?: boolean;
};

/**
 * 公共根 effect 循环：统一处理 disposed、readDeps、时间戳、setCurrentScope、防抖占位与 runBody 调用。
 * createRoot 与 createHydrateRoot 复用此循环，仅注入 readDeps、shouldSkip、runBody 等策略，减少重复。
 *
 * @param options.createEffect - 创建 effect 的函数
 * @param options.setCurrentScope - 设置当前 scope
 * @param options.getScopeForRun - 获取本次运行的 scope
 * @param options.disposed - 是否已销毁
 * @param options.fn - 根渲染函数，返回 VNode
 * @param options.getInitialState - 返回可变的 state 对象，runBody 会修改其字段
 * @param options.readDeps - 可选，建立 effect 依赖（如 createRoot 的 getTrigger）
 * @param options.shouldSkip - 可选，返回 true 时本次不执行 runBody（防抖或稳定引用跳过）
 * @param options.runBody - 本次要执行的主体逻辑，可读写 state
 * @param options.onBeforeRun - 可选，每次 effect 运行前调用（如调试计数 + 日志）
 * @returns effect 的 dispose 函数
 */
function createRootEffectLoop(options: {
  createEffect: (fn: () => void) => () => void;
  setCurrentScope: (
    scope: { addDisposer(dispose: () => void): void } | null,
  ) => void;
  getScopeForRun: () => { addDisposer(dispose: () => void): void };
  disposed: () => boolean;
  fn: () => VNode;
  getInitialState: () => RootEffectState;
  readDeps?: () => void;
  shouldSkip?: (now: number, vnode: VNode, state: RootEffectState) => boolean;
  runBody: (now: number, vnode: VNode, state: RootEffectState) => void;
  onBeforeRun?: () => void;
}): () => void {
  const state = options.getInitialState();
  return options.createEffect(() => {
    if (options.disposed()) return;
    options.readDeps?.();
    options.onBeforeRun?.();
    const now = getNow();
    options.setCurrentScope(options.getScopeForRun());
    try {
      const vnode = options.fn();
      if (options.shouldSkip?.(now, vnode, state)) return;
      if (state.firstApplyTime === 0) state.firstApplyTime = now;
      state.lastVnodeRef = vnode;
      options.runBody(now, vnode, state);
    } finally {
      options.setCurrentScope(null);
    }
  });
}

let hydrateRootCreateCount = 0;
let hydrateEffectRunCount = 0;

/**
 * 根据注入的依赖生成 hydrate，供 runtime、runtime-hybrid 等多入口复用。
 * 含首屏防抖（首次 apply 后 150ms 内跳过重复 apply）与调试日志。
 */
export function createHydrateRoot(
  deps: HydrateRootDeps,
): (fn: () => VNode, container: Element) => Root {
  const {
    createEffect,
    createRunDisposersCollector,
    setCurrentScope,
    isDOMEnvironment,
    expandVNode,
    createNodeFromExpanded,
    patchRoot,
    runDirectiveUnmount,
    bindDeferredEventListeners,
    hydrateFromExpanded,
    runDirectiveUnmountOnChildren,
  } = deps;
  // removeCloak 为本模块导出，直接使用，不通过 deps 注入

  const INITIAL_DEBOUNCE_MS = 150;

  return function hydrate(fn: () => VNode, container: Element): Root {
    hydrateRootCreateCount += 1;
    viewDebugLog("[view] hydrate() root created #", hydrateRootCreateCount);
    if (!isDOMEnvironment()) {
      return { unmount: () => {}, container: null };
    }
    let disposed = false;
    const disposers: Array<() => void> = [];
    const { runDisposers, getScopeForRun } = createRunDisposersCollector();
    const state: RootEffectState = {
      firstApplyTime: 0,
      lastVnodeRef: null,
      mounted: null,
      lastExpanded: null,
      didHydrate: false,
    };

    const root: Root = {
      container,
      unmount() {
        disposed = true;
        disposers.forEach((d) => d());
        disposers.length = 0;
        runDisposers.forEach((d) => d());
        runDisposers.length = 0;
        if (state.mounted != null) {
          if (state.mounted === container) {
            runDirectiveUnmountOnChildren(container as Element);
            (container as Element).textContent = "";
          } else if ((container as Element).contains(state.mounted)) {
            runDirectiveUnmount(state.mounted);
            (container as Element).removeChild(state.mounted);
          }
        }
        state.mounted = null;
        state.lastExpanded = null;
      },
    };

    const disposeRoot = createRootEffectLoop({
      createEffect,
      setCurrentScope,
      getScopeForRun,
      disposed: () => disposed,
      fn,
      getInitialState: () => state,
      shouldSkip: (now, vnode, s) =>
        !!s.didHydrate &&
        s.firstApplyTime > 0 &&
        now - s.firstApplyTime < INITIAL_DEBOUNCE_MS &&
        vnode === s.lastVnodeRef,
      runBody: (_now, vnode, s) => {
        const hasExisting = (container as Element).hasChildNodes();
        if (hasExisting && !s.didHydrate) {
          const expanded = expandVNode(vnode);
          hydrateFromExpanded(container as Element, expanded);
          bindDeferredEventListeners(container as Element);
          s.didHydrate = true;
          s.firstApplyTime = getNow();
          removeCloak(container as Element);
          s.lastExpanded = expanded;
          s.mounted = Array.isArray(expanded)
            ? (container as Element)
            : (container as Element).firstChild;
        } else {
          const newExpanded = expandVNode(vnode);
          if (
            s.mounted != null &&
            s.lastExpanded != null &&
            container.contains(s.mounted)
          ) {
            patchRoot(
              container as Element,
              s.mounted,
              s.lastExpanded,
              newExpanded,
            );
            bindDeferredEventListeners(container as Element);
            s.lastExpanded = newExpanded;
            s.mounted = Array.isArray(newExpanded)
              ? (container as Element)
              : (container as Element).firstChild;
          } else {
            if (s.mounted != null) {
              if (s.mounted === container) {
                runDirectiveUnmountOnChildren(container as Element);
                (container as Element).textContent = "";
              } else if ((container as Element).contains(s.mounted)) {
                runDirectiveUnmount(s.mounted);
                (container as Element).removeChild(s.mounted);
              }
            }
            s.mounted = createNodeFromExpanded(newExpanded);
            (container as Element).appendChild(s.mounted);
            bindDeferredEventListeners(s.mounted);
            s.lastExpanded = newExpanded;
            s.didHydrate = true;
          }
        }
      },
      onBeforeRun: () => {
        hydrateEffectRunCount += 1;
        viewDebugLog("[view] hydrate root effect run #", hydrateEffectRunCount);
      },
    });
    disposers.push(disposeRoot);
    return root;
  };
}

let createRootCreateCount = 0;
let createRootEffectRunCount = 0;

const CREATE_ROOT_DEBOUNCE_MS = 150;

/**
 * 根据注入的依赖生成 createRoot，供各 runtime 复用同一套实现。
 * 含首屏防抖：首次 apply 后 CREATE_ROOT_DEBOUNCE_MS 内跳过重复 apply，避免 dweb Hybrid 首屏 createReactiveRoot 的 effect 被触发 3 次时子组件 createEffect 跑 3 次。
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
    bindDeferredEventListeners,
  } = deps;

  return function createRoot(fn: () => VNode, container: Element): Root {
    if (!isDOMEnvironment()) {
      return { unmount: () => {}, container: null };
    }
    createRootCreateCount += 1;
    viewDebugLog("[view] createRoot() root created #", createRootCreateCount);

    const [getTrigger, setTrigger] = createRenderTriggerSignal();
    let disposed = false;
    const disposers: Array<() => void> = [];
    const { runDisposers, getScopeForRun } = createRunDisposersCollector();
    const state: RootEffectState = {
      firstApplyTime: 0,
      lastVnodeRef: null,
      mounted: null,
      lastExpanded: null,
    };

    const root: Root = {
      container,
      unmount() {
        disposed = true;
        disposers.forEach((d) => d());
        disposers.length = 0;
        runDisposers.forEach((d) => d());
        runDisposers.length = 0;
        if (state.mounted && container.contains(state.mounted)) {
          runDirectiveUnmount(state.mounted);
          container.removeChild(state.mounted);
        }
        state.mounted = null;
        state.lastExpanded = null;
        state.lastVnodeRef = null;
      },
      forceRender() {
        setTrigger((t) => t + 1);
      },
    };

    const disposeRoot = createRootEffectLoop({
      createEffect,
      setCurrentScope,
      getScopeForRun,
      disposed: () => disposed,
      fn,
      getInitialState: () => state,
      readDeps: getTrigger,
      shouldSkip: (now, vnode, s) => {
        if (
          s.firstApplyTime > 0 &&
          now - s.firstApplyTime < CREATE_ROOT_DEBOUNCE_MS &&
          vnode === s.lastVnodeRef
        ) {
          return true;
        }
        if (
          vnode === s.lastVnodeRef &&
          s.mounted != null &&
          container.contains(s.mounted)
        ) {
          return true;
        }
        return false;
      },
      runBody: (_now, vnode, s) => {
        const newExpanded = expandVNode(vnode);
        const isEmptyFragment = s.mounted != null &&
          (s.mounted as Node).nodeType === 11 &&
          (s.mounted as DocumentFragment).childNodes.length === 0;
        const shouldMount = s.mounted == null ||
          (!container.contains(s.mounted!) && !isEmptyFragment);
        if (shouldMount) {
          s.mounted = createNodeFromExpanded(newExpanded);
          container.appendChild(s.mounted);
          bindDeferredEventListeners(s.mounted);
          s.lastExpanded = newExpanded;
          removeCloak(container);
        } else {
          patchRoot(container, s.mounted!, s.lastExpanded!, newExpanded);
          bindDeferredEventListeners(container);
          s.lastExpanded = newExpanded;
        }
      },
      onBeforeRun: () => {
        createRootEffectRunCount += 1;
      },
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
 * 对 params/query 做浅层按值比较（hydrate 与 renderCurrentRoute 可能传入不同对象引用、内容相同）
 */
function shallowEqualObj(
  x: unknown,
  y: unknown,
): boolean {
  if (x === y) return true;
  if (
    x == null || y == null || typeof x !== "object" || typeof y !== "object"
  ) {
    return false;
  }
  const xo = x as Record<string, unknown>;
  const yo = y as Record<string, unknown>;
  const xk = Object.keys(xo);
  const yk = Object.keys(yo);
  if (xk.length !== yk.length) return false;
  for (const k of xk) {
    if (!Object.prototype.hasOwnProperty.call(yo, k) || xo[k] !== yo[k]) {
      return false;
    }
  }
  return true;
}

/**
 * 对 viewState 做等价比较：同 page、同 skipLayouts、props 的 params/query 按值浅比较、layouts 长度与每项 component 一致则视为相同，
 * 避免 setViewState 多次传入等价状态时根 effect 重复跑、子 createEffect 被多次执行。
 */
/** 规范化空对象：undefined / null 与 {} 视为等价，便于 props.params、props.query 比较一致 */
function normalEmpty(
  x: unknown,
): Record<string, unknown> | null | undefined {
  if (x == null) return undefined;
  if (typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  return Object.keys(o).length === 0 ? undefined : o;
}

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
  const aParams = normalEmpty(ap.params) ?? {};
  const bParams = normalEmpty(bp.params) ?? {};
  const aQuery = normalEmpty(ap.query) ?? {};
  const bQuery = normalEmpty(bp.query) ?? {};
  if (!shallowEqualObj(aParams, bParams) || !shallowEqualObj(aQuery, bQuery)) {
    return false;
  }
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
    // 单实例：已建树且状态等价时直接返回 lastVnode，不再 buildTree，避免根 effect 多次触发时重复创建子组件实例
    if (lastVnode != null && lastState !== undefined) {
      if (lastState === state) return lastVnode;
      if (
        isViewStateLike(state) && isViewStateLike(lastState) &&
        viewStateEquals(state, lastState as typeof state)
      ) {
        return lastVnode;
      }
    }
    lastState = state;
    const vnode = buildTree(state);
    lastVnode = vnode;
    return vnode;
  }, container);
}
