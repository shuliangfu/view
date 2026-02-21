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
  hydrateFromExpanded,
  patchRoot,
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "./dom.ts";
import { bindDeferredEventListeners } from "./dom/props.ts";
import type { SSROptions } from "./dom.ts";
import { KEY_VIEW_DATA, KEY_VIEW_SSR } from "./constants.ts";
import { setGlobal } from "./globals.ts";
import {
  createCreateRoot,
  createHydrateRoot,
  createReactiveRootWith,
  createRender,
  NOOP_ROOT,
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
    bindDeferredEventListeners,
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
 * 执行期间设置 KEY_VIEW_SSR，便于 getDocument() 等在误用 document 时抛出明确错误。
 *
 * @param fn 根组件函数
 * @param options allowRawHtml 为 false 时 v-html 输出转义文本（安全场景）；默认 v-html 在服务端不转义
 * @returns HTML 字符串
 */
const SSR_DOCUMENT_MESSAGE =
  "document is not available during server-side rendering. Do not use document or window in components rendered with renderToString() or renderToStream(). Use conditional checks (e.g. if (typeof document !== 'undefined')) or move the logic to client-only code (e.g. createEffect, onMount).";

function createSSRDocumentGuard(): Document {
  return new Proxy({} as Document, {
    get() {
      throw new Error(SSR_DOCUMENT_MESSAGE);
    },
  });
}

/**
 * 尝试将 globalThis.document 替换为 guard（仅当运行环境允许写入时，如 Node/Deno 服务端）。
 * 浏览器中 window.document 为只读 getter，赋值会抛错，此时返回 null 表示未替换。
 */
function trySwapDocumentForSSR(guard: Document): Document | null {
  const g = globalThis as { document?: Document };
  try {
    const orig = g.document;
    g.document = guard;
    return orig ?? null;
  } catch {
    return null;
  }
}

export function renderToString(
  fn: () => VNode,
  options?: SSROptions,
): string {
  setGlobal(KEY_VIEW_SSR, true);
  const g = globalThis as {
    document?: Document;
    __VIEW_ORIG_DOCUMENT__?: Document;
  };
  const guard = createSSRDocumentGuard();
  const origDoc = trySwapDocumentForSSR(guard);
  try {
    const vnode = fn();
    return createElementToString(vnode, undefined, options);
  } finally {
    if (origDoc !== null) g.document = origDoc;
    setGlobal(KEY_VIEW_SSR, false);
  }
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
 * 实现与调试逻辑由 runtime-shared.createHydrateRoot 统一提供。
 */
export const hydrate: (fn: () => VNode, container: Element) => Root =
  createHydrateRoot({
    createEffect,
    createRunDisposersCollector,
    setCurrentScope,
    isDOMEnvironment,
    createRenderTriggerSignal: () => createSignal(0),
    expandVNode,
    createNodeFromExpanded,
    patchRoot,
    runDirectiveUnmount,
    bindDeferredEventListeners,
    hydrateFromExpanded,
    runDirectiveUnmountOnChildren,
  });

/**
 * 创建响应式单根并首屏水合：首屏用 hydrate 激活已有服务端 HTML，后续状态变化时在根内做细粒度 patch。
 * 用于 Hybrid 首屏只做一次激活、不卸根不重建，避免 hydrate 后再 createReactiveRoot 导致组件树执行两遍。
 *
 * @param container 挂载的 DOM 容器（首屏时通常已有子节点）
 * @param getState 获取当前状态（建议为 createSignal 的 getter）
 * @param buildTree 根据状态构建根 VNode
 * @returns Root 句柄
 */
export function createReactiveRootHydrate<T>(
  container: Element,
  getState: () => T,
  buildTree: (state: T) => VNode,
): Root {
  return createReactiveRootWith(hydrate, container, getState, buildTree);
}
