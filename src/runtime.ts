/**
 * View 模板引擎 — 运行时
 *
 * createRoot / render（客户端挂载，根为响应式）、renderToString（SSR/SSG）、hydrate（Hybrid 激活）。
 * unmount 时会回收该根下所有 effect，避免泄漏。
 */

import {
  createEffect,
  createRunDisposersCollector,
  setCurrentScope,
} from "./effect.ts";
import {
  createElementToString,
  createNodeFromExpanded,
  expandVNode,
  hydrateElement,
  patchRoot,
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom.ts";
import type { ExpandedRoot } from "./dom.ts";
import type { SSROptions } from "./dom.ts";
import { KEY_VIEW_DATA } from "./constants.ts";
import {
  createCreateRoot,
  createReactiveRootWith,
  createRender,
  NOOP_ROOT,
  removeCloak,
  resolveMountContainer,
} from "./runtime-shared.ts";
import { createSignal } from "./signal.ts";
import { isDOMEnvironment } from "./types.ts";
import type { MountOptions, Root, VNode } from "./types.ts";

/** 创建根并挂载（实现来自 runtime-shared，依赖从 dom/effect 注入） */
export const createRoot: (fn: () => VNode, container: Element) => Root =
  createCreateRoot({
    createEffect,
    createRunDisposersCollector,
    setCurrentScope,
    isDOMEnvironment,
    createRenderTriggerSignal: () => createSignal(0),
    expandVNode,
    createNodeFromExpanded,
    patchRoot,
    runDirectiveUnmount,
  });

/** 便捷方法：创建根并挂载（等同于 createRoot(fn, container)），由 runtime-shared.createRender 统一实现 */
export const render: (fn: () => VNode, container: Element) => Root =
  createRender(createRoot);

/**
 * 统一挂载入口：支持选择器或 Element；有子节点则 hydrate 否则 render，减少分支与心智负担。
 * 容器为选择器且查不到时：options.noopIfNotFound 为 true 则返回空 Root，否则抛错。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param fn 根组件函数
 * @param options hydrate 强制 hydrate/render；noopIfNotFound 查不到时静默返回空 Root
 * @returns Root 句柄
 */
export function mount(
  container: string | Element,
  fn: () => VNode,
  options?: MountOptions,
): Root {
  const el = resolveMountContainer(
    container,
    options?.noopIfNotFound ?? false,
  );
  if (!el) return NOOP_ROOT;
  const useHydrate = options?.hydrate === true
    ? true
    : options?.hydrate === false
    ? false
    : el.hasChildNodes();
  return useHydrate ? hydrate(fn, el) : render(fn, el);
}

/**
 * 创建响应式单根：由外部状态驱动，状态变化时在根内做细粒度 patch，不整树卸载。
 * 适用于 SPA 路由等「状态 → 整树」由外部维护、View 只负责根据状态渲染并增量更新的场景。
 *
 * @param container 挂载的 DOM 容器
 * @param getState 获取当前状态（建议为 createSignal 的 getter，以便 effect 追踪）
 * @param buildTree 根据状态构建根 VNode
 * @returns Root 句柄，可调用 unmount 卸载
 */
export function createReactiveRoot<T>(
  container: Element,
  getState: () => T,
  buildTree: (state: T) => VNode,
): Root {
  return createReactiveRootWith(createRoot, container, getState, buildTree);
}

/**
 * 将根组件渲染为 HTML 字符串（SSR/SSG，无浏览器 API）
 *
 * @param fn 根组件函数
 * @param options allowRawHtml 为 false 时 v-html 输出转义文本（安全场景）；默认 v-html 在服务端不转义
 * @returns HTML 字符串
 */
export function renderToString(
  fn: () => VNode,
  options?: SSROptions,
): string {
  const vnode = fn();
  return createElementToString(vnode, undefined, options);
}

/** Hybrid 注入脚本的配置：初始数据与客户端脚本路径等 */
export type HydrationScriptOptions = {
  /** 注入到 window 的初始数据，客户端可通过同一 dataKey 读取 */
  data?: unknown;
  /** 挂到 window 上的键名，默认见 constants.KEY_VIEW_DATA */
  dataKey?: string;
  /** 客户端入口脚本 URL（type="module"），可选 */
  scriptSrc?: string;
  /** CSP nonce，可选 */
  nonce?: string;
};

/**
 * 生成 Hybrid 注入脚本 HTML：将 data 写入 window[dataKey]，并可选注入客户端入口脚本
 * 服务端在 HTML 末尾插入此返回值后，客户端可读取 window[dataKey] 并调用 hydrate(fn, container)。
 *
 * @param options 可选；data 为初始数据，scriptSrc 为客户端 bundle 地址，nonce 用于 CSP
 * @returns 一段 HTML 字符串（一个或多个 <script> 标签）
 *
 * @example
 * const html = renderToString(() => <App />);
 * const scripts = generateHydrationScript({ data: { user }, scriptSrc: "/client.js" });
 * return `<!DOCTYPE html><html><body><div id="root">${html}</div>${scripts}</body></html>`;
 */
export function generateHydrationScript(
  options: HydrationScriptOptions = {},
): string {
  const {
    data,
    dataKey = KEY_VIEW_DATA,
    scriptSrc,
    nonce,
  } = options;
  const parts: string[] = [];
  const nonceAttr = nonce
    ? ` nonce="${String(nonce).replace(/"/g, "&quot;")}"`
    : "";
  if (data !== undefined) {
    const payload = JSON.stringify(data);
    const scriptBody = `window.${dataKey}=JSON.parse(${
      JSON.stringify(payload)
    })`;
    const safe = scriptBody.replace(/<\/script/gi, "\\u003c/script");
    parts.push(`<script${nonceAttr}>${safe}</script>`);
  }
  if (scriptSrc) {
    parts.push(
      `<script type="module" src="${
        String(scriptSrc).replace(/"/g, "&quot;")
      }"${nonceAttr}></script>`,
    );
  }
  return parts.join("");
}

/**
 * 在已有服务端 HTML 的容器上激活（Hybrid）
 * 若 container 已有子节点，则与 fn() 的 VNode 一一对应复用 DOM（完整 hydrate）；
 * 首次复用后，后续响应式更新与 createRoot 一致，走 patchRoot 细粒度 patch，不整树替换。
 * 无子节点时与 createRoot 行为一致。
 *
 * @param fn 根组件函数（与 SSR 时相同）
 * @param container 已有 SSR 内容的 DOM 容器
 * @returns Root 句柄
 */
export function hydrate(fn: () => VNode, container: Element): Root {
  if (!isDOMEnvironment()) {
    return { unmount: () => {}, container: null };
  }
  let mounted: Node | Element | null = null;
  let lastExpanded: ExpandedRoot | null = null;
  let disposed = false;
  let didHydrate = false;
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
      if (mounted != null) {
        if (mounted === container) {
          runDirectiveUnmountOnChildren(container as Element);
          (container as Element).textContent = "";
        } else if ((container as Element).contains(mounted)) {
          runDirectiveUnmount(mounted);
          (container as Element).removeChild(mounted);
        }
      }
      mounted = null;
      lastExpanded = null;
    },
  };

  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope(getScopeForRun());
    try {
      const vnode = fn();
      const hasExisting = (container as Element).hasChildNodes();
      if (hasExisting && !didHydrate) {
        hydrateElement(container as Element, vnode);
        didHydrate = true;
        removeCloak(container as Element);
        const expanded = expandVNode(vnode);
        lastExpanded = expanded;
        mounted = Array.isArray(expanded)
          ? (container as Element)
          : (container as Element).firstChild;
      } else {
        const newExpanded = expandVNode(vnode);
        if (
          mounted != null && lastExpanded != null && container.contains(mounted)
        ) {
          patchRoot(
            container as Element,
            mounted,
            lastExpanded,
            newExpanded,
          );
          lastExpanded = newExpanded;
          mounted = Array.isArray(newExpanded)
            ? (container as Element)
            : (container as Element).firstChild;
        } else {
          if (mounted != null) {
            if (mounted === container) {
              runDirectiveUnmountOnChildren(container as Element);
              (container as Element).textContent = "";
            } else if ((container as Element).contains(mounted)) {
              runDirectiveUnmount(mounted);
              (container as Element).removeChild(mounted);
            }
          }
          mounted = createNodeFromExpanded(newExpanded);
          (container as Element).appendChild(mounted);
          lastExpanded = newExpanded;
          didHydrate = true;
        }
      }
    } finally {
      setCurrentScope(null);
    }
  });
  disposers.push(disposeRoot);
  return root;
}
