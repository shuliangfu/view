/**
 * 浏览器**运行时挂载与插入原语**（主包与 `compiled` 共用）：`mount` 解析容器后委托 `createRoot`；`insert` 组合静态 / 挂载函数 / 响应式插入。
 *
 * - `createRoot` / `render` / `mount`：`fn(container)` 只执行一次，内部通过 `insert` 建立 DOM。
 * - `insert`：支持 `(parent) => void`、静态值、或 getter → 上述；水合期间可委托 `KEY_VIEW_HYDRATE` 上下文。
 * - `insertReactive`：可处理 `MountFn`、数组、`VNode`、`DocumentFragment` 与文本节点等（与 Suspense / 编译产物配合）。
 */

import { KEY_VIEW_DATA, KEY_VIEW_HYDRATE } from "./constants.ts";
import { getActiveDocument } from "./compiler/active-document.ts";
import { isVNodeLike } from "./dom/shared.ts";
import {
  detachInsertReactiveTrackedChild,
  type InsertParent,
  type InsertValue,
  isMountFn,
} from "./compiler/insert.ts";
import { valueToNode } from "./compiler/to-node.ts";
import { mountVNodeTree } from "./compiler/vnode-mount.ts";
import {
  type ReactiveInsertNext,
  setInsertReactiveForVnodeMount,
} from "./compiler/vnode-insert-bridge.ts";
import type { VNode } from "./types.ts";

/**
 * 主包 `insert` 可接受的值：`InsertValue`（字符串、数字、节点等）或单参挂载函数 `(parent) => void`。
 * 供 `ErrorBoundary` 等与编译态 `insert` 对齐的类型导出。
 */
export type InsertValueWithMount = InsertValue | ((parent: Node) => void);

/**
 * insertReactive 的 getter 除 InsertValue 外还可返回 VNode（Suspense 内部 `resolved() ?? fallback` 等仍为 VNode），
 * 由 `runtime/vnode-mount` 的 mountVNodeTree 展开为真实 DOM；normalizeChildren 仅在该子模块使用（3.1）。
 */
import { createEffect, onCleanup } from "./effect.ts";
import { escapeForAttr } from "./escape.ts";
import { isSignalGetter } from "./signal.ts";
import { NOOP_ROOT, resolveMountContainer } from "./runtime-shared.ts";
import { createRoot, render } from "./compiler/mod.ts";
import type { MountOptions, Root } from "./types.ts";

/** 创建根并挂载，fn(container) 只执行一次，内部用 insert 等建立 DOM */
export { createRoot };

/** 便捷挂载入口，等同于 createRoot(fn, container) */
export { render };

/**
 * 统一挂载入口：支持选择器或 Element。
 * 容器为选择器且查不到时：options.noopIfNotFound 为 true 则返回空 Root，否则抛错。
 *
 * @param container 选择器（如 "#root"）或 DOM 元素
 * @param fn 根挂载函数 (container) => void，内部用 insert 等建立 DOM
 * @param options noopIfNotFound 查不到时静默返回空 Root
 * @returns Root 句柄
 */
export function mount(
  container: string | Element,
  fn: (container: Element) => void,
  options?: MountOptions,
): Root {
  const noopIfNotFound = options?.noopIfNotFound ?? false;
  const el = resolveMountContainer(container, noopIfNotFound);
  if (!el) {
    if (noopIfNotFound) {
      console.warn(
        "[view] mount 已跳过：未找到挂载容器 " +
          (typeof container === "string" ? container : "(Element)") +
          '，页面将为空。请确认 HTML 中存在该节点（如 <div id="root"></div>）且脚本在 DOM 就绪后执行。',
      );
    }
    return NOOP_ROOT;
  }
  return render(fn, el);
}

/** 细粒度水合时挂到 KEY_VIEW_HYDRATE 的对象，insert 会委托给其 insert 方法 */
type HydrateContextLike = {
  insert(parent: Node, value: InsertValueWithMount): void;
};

/**
 * 将插入值转为 DOM 节点（文本或元素）；不处理 VNode。
 * 复用 compiler 的 valueToNode；若收到 VNode 形态（组件未走 compileSource），开发时给出警告并插入空节点（2.1 收敛）。
 */
function toNodeForInsert(value: InsertValue): Node {
  const node = valueToNode(
    value as import("./compiler/to-node.ts").ValueToNodeInput,
    getActiveDocument(),
  );
  if (isVNodeLike(value)) {
    const v = value as { type?: unknown; props?: Record<string, unknown> };
    const typeInfo = typeof v.type === "function"
      ? (v.type as { name?: string }).name || "Function"
      : String(v.type);
    console.error(
      "[view] 组件可能未走编译：返回了 VNode 而非 (parent)=>void，导致 #root 为空。",
      "未编译的节点 type:",
      typeInfo,
      "（请确认包含该组件的 .tsx 已由 view-cli dev/build 的 compileSource 处理）",
      value,
    );
  }
  return node;
}

const append = (p: InsertParent, child: Node): void => {
  (p as { appendChild(n: unknown): unknown }).appendChild(child);
};

/** 2.3 原语：仅静态插入，无 effect；供编译器或手写按需使用以利 tree-shaking */
export function insertStatic(
  parent: InsertParent,
  value: string | number | Node | null | undefined,
): undefined {
  append(parent, toNodeForInsert(value));
  return undefined;
}

/**
 * 仅收集 parent 上 fromIndex 起的新子节点，避免 Array.from(childNodes).slice(fromIndex) 的临时数组（见 ANALYSIS_OPTIMIZATION.md 1.2）。
 */
function captureNewChildren(parent: Node, fromIndex: number): Node[] {
  const list: Node[] = [];
  const len = parent.childNodes.length;
  for (let i = fromIndex; i < len; i++) list.push(parent.childNodes[i]);
  return list;
}

/**
 * **响应式插入点**：在 `parent` 上根据 `getter()` 的返回值更新 DOM，并在依赖的 signal 变化时由调度器重新执行。
 *
 * 支持返回值类型包括：单参 `(parent) => void`、`MountFn` 数组、`VNode`（内部 `mountVNodeTree`）、`DocumentFragment`、以及普通 `InsertValue`（文本/节点等）。
 * 仅替换本 effect 曾插入的节点，不会 `replaceChildren` 清空兄弟节点。
 *
 * @param parent - 父节点（与编译器 `InsertParent` 一致）
 * @param getter - 返回下一帧应展示的内容；若返回 signal getter 会先解包再处理
 * @returns `createEffect` 的 dispose，用于显式卸载时停止更新
 */
export function insertReactive(
  parent: InsertParent,
  getter: () => ReactiveInsertNext,
): import("./types.ts").EffectDispose {
  const parentNode = parent as Node | null;
  let currentNodes: Node[] = [];
  return createEffect(() => {
    /** 父已卸载或非法入参时跳过，避免 MountFn 内 appendChild 抛错（Suspense 竞态等） */
    if (parentNode == null) {
      return;
    }
    onCleanup(() => {
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
    });
    // 热路径：MountFn 最常见，已置于首分支（见 ANALYSIS_OPTIMIZATION.md 1.2）
    // getter 返回 getter 引用时需解包以订阅 signal，见 unwrapSignalGetterValue
    const raw = getter();
    const next = (typeof raw === "function" && isSignalGetter(raw)
      ? (raw as () => unknown)()
      : raw) as ReactiveInsertNext;
    if (isMountFn(next)) {
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
      const beforeLen = parentNode.childNodes.length;
      (next as (parent: Node) => void)(parentNode);
      currentNodes = captureNewChildren(parentNode, beforeLen);
      return;
    }
    // getter 返回 MountFn 数组（如 .map(() => (parent)=>...)）时依次挂载并追踪子节点
    if (Array.isArray(next)) {
      for (const n of currentNodes) {
        if (n.parentNode === parentNode) {
          parentNode.removeChild(n);
        }
      }
      currentNodes = [];
      const beforeLen = parentNode.childNodes.length;
      for (const fn of next) {
        if (isMountFn(fn)) {
          (fn as (parent: Node) => void)(parentNode);
        }
      }
      currentNodes = captureNewChildren(parentNode, beforeLen);
      return;
    }

    // getter 返回 VNode（如 Suspense 的 fallback/resolved）时在此展开
    if (isVNodeLike(next)) {
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
      const beforeLen = parentNode.childNodes.length;
      mountVNodeTree(parentNode, next as VNode);
      currentNodes = captureNewChildren(parentNode, beforeLen);
      return;
    }

    /**
     * DocumentFragment：appendChild/replaceChildren 后子节点会从 fragment 移入父节点，fragment 随即为空。
     * 若走下方 replaceChildren(fragment) 且把 fragment 记入 currentNodes，下一轮 effect 会对「空 fragment」再次
     * replaceChildren，把父节点清空（遗留：旧版曾把组件 children 编成 DocumentFragment；现编译器已改为 (parent)=>void 挂载函数）。
     * 因此：用 appendChild 移动子树，并只把**实际挂到父上的子节点**记入 currentNodes。
     */
    if (
      typeof next === "object" &&
      next !== null &&
      typeof (next as Node).nodeType === "number" &&
      (next as Node).nodeType === 11
    ) {
      const frag = next as DocumentFragment;
      if (frag.childNodes.length === 0) {
        return;
      }
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
      const beforeLen = parentNode.childNodes.length;
      parentNode.appendChild(frag);
      currentNodes = captureNewChildren(parentNode, beforeLen);
      return;
    }

    /**
     * 文本/数字/单节点等：只替换本 effect 曾插入的 currentNodes，禁止 replaceChildren(parent)
     * 否则同一父下若有兄弟（如先 insertMount 了 Form、再 insertReactive 条件分支），
     * getter 返回 false/null 时会清空整父节点，典型：`<div><Form/>{submitted() && <p/>}</div>` 白屏。
     */
    const node = toNodeForInsert(next as InsertValue);
    for (const n of currentNodes) {
      detachInsertReactiveTrackedChild(n);
    }
    currentNodes = [node];
    parentNode.appendChild(node);
  });
}

/** 2.3 原语：仅挂载函数 (parent) => void；供编译器或手写按需使用（与 mount(container, fn) 入口区分，故命名 insertMount） */
export function insertMount(
  parent: InsertParent,
  fn: (p: Node) => void,
): undefined {
  fn(parent as Node);
  return undefined;
}

/**
 * insert：支持 (parent) => void、string/number/Node 或 getter→上述；内部委托给 insertMount/insertStatic/insertReactive。
 * 供编译根与 portal 等从主包（@dreamer/view）拉取。
 *
 * @param parent - 父节点（DOM 或 SSR 容器）
 * @param value - 静态值、挂载函数 (parent) => void，或 getter→上述
 * @returns getter 时返回 effect 的 dispose，静态/挂载函数时返回 undefined
 */
export function insert(
  parent: InsertParent,
  value: InsertValueWithMount,
): import("./types.ts").EffectDispose | undefined {
  const hydrate = (globalThis as Record<string, unknown>)[KEY_VIEW_HYDRATE] as
    | HydrateContextLike
    | undefined;
  if (hydrate?.insert) {
    hydrate.insert(parent as Node, value);
    return undefined;
  }
  if (typeof value === "function" && value.length === 1) {
    return insertMount(parent, value as (p: Node) => void);
  }
  if (typeof value !== "function") {
    return insertStatic(parent, value);
  }
  return insertReactive(parent, value as () => ReactiveInsertNext);
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
 * 服务端在 HTML 末尾插入此返回值后，客户端可读取 window[dataKey] 并用 createRoot/render 挂载。
 *
 * @param options 可选；data 为初始数据，scriptSrc 为客户端 bundle 地址，nonce 用于 CSP
 * @returns 一段 HTML 字符串（一个或多个 <script> 标签）
 *
 * @example
 * const html = renderToString((el) => { insert(el, () => <App />); });
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
  const nonceAttr = nonce ? ` nonce="${escapeForAttr(String(nonce))}"` : "";
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
        escapeForAttr(String(scriptSrc))
      }"${nonceAttr}></script>`,
    );
  }
  return parts.join("");
}

// VNode 子树内嵌套 insertReactive 依赖主实现；须在 insertReactive 定义之后注册（打破与 vnode-mount 的循环依赖）
setInsertReactiveForVnodeMount(insertReactive);
