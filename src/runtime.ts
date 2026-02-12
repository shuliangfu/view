/**
 * View 模板引擎 — 运行时
 *
 * createRoot / render（客户端挂载，根为响应式）、renderToString（SSR/SSG）、hydrate（Hybrid 激活）。
 * unmount 时会回收该根下所有 effect，避免泄漏。
 */

/** hydrate 后移除 data-view-cloak，配合 CSS [data-view-cloak]{display:none} 减少 FOUC */
function removeCloak(container: Element): void {
  if (container.hasAttribute("data-view-cloak")) {
    container.removeAttribute("data-view-cloak");
  }
  for (const el of Array.from(container.querySelectorAll("[data-view-cloak]"))) {
    el.removeAttribute("data-view-cloak");
  }
}

import { createEffect, setCurrentScope } from "./effect.ts";
import {
  createElement,
  createElementToString,
  createNodeFromExpanded,
  expandVNode,
  hydrateElement,
  patchRoot,
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom.ts";
import type { ExpandedRoot, SSROptions } from "./dom.ts";
import { isDOMEnvironment } from "./types.ts";
import type { Root, VNode } from "./types.ts";

/**
 * 创建根实例并挂载到容器（浏览器）
 * 根为响应式：fn 内读到的 signal 变化时会重新执行 fn 并更新挂载内容。
 * unmount 时回收该树下创建的所有 effect。
 *
 * @param fn 根组件函数，返回 VNode（或 JSX）
 * @param container 挂载的 DOM 容器
 * @returns Root 句柄，可调用 unmount 卸载
 */
export function createRoot(fn: () => VNode, container: Element): Root {
  if (!isDOMEnvironment()) {
    return {
      unmount: () => {},
      container: null,
    };
  }

  let mounted: Node | null = null;
  let lastExpanded: ExpandedRoot | null = null;
  let disposed = false;
  const disposers: Array<() => void> = [];

  const root: Root = {
    container,
    unmount() {
      disposed = true;
      disposers.forEach((d) => d());
      disposers.length = 0;
      if (mounted && container.contains(mounted)) {
        runDirectiveUnmount(mounted);
        container.removeChild(mounted);
      }
      mounted = null;
      lastExpanded = null;
    },
  };

  // 根 effect：首次挂载用 expand + createNodeFromExpanded；之后用 patchRoot 原地更新，不整树替换，表单不重挂、不丢焦点
  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope({ addDisposer: (d) => disposers.push(d) });
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
}

/**
 * 便捷方法：创建根并挂载（等同于 createRoot(fn, container)）
 *
 * @param fn 根组件函数
 * @param container 挂载的 DOM 容器
 * @returns Root 句柄
 */
export function render(fn: () => VNode, container: Element): Root {
  return createRoot(fn, container);
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
  /** 挂到 window 上的键名，默认 __VIEW_DATA__ */
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
    dataKey = "__VIEW_DATA__",
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
 * 首次复用后，后续响应式更新仍做整树替换。无子节点时与 createRoot 行为一致。
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
  let disposed = false;
  let didHydrate = false;
  const disposers: Array<() => void> = [];

  const root: Root = {
    container,
    unmount() {
      disposed = true;
      disposers.forEach((d) => d());
      disposers.length = 0;
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
    },
  };

  const disposeRoot = createEffect(() => {
    if (disposed) return;
    setCurrentScope({ addDisposer: (d) => disposers.push(d) });
    try {
      const vnode = fn();
      const hasExisting = (container as Element).hasChildNodes();
      if (hasExisting && !didHydrate) {
        hydrateElement(container as Element, vnode);
        didHydrate = true;
        mounted = container as Element;
        removeCloak(container as Element);
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
        mounted = createElement(vnode);
        (container as Element).appendChild(mounted);
      }
    } finally {
      setCurrentScope(null);
    }
  });
  disposers.push(disposeRoot);
  return root;
}
