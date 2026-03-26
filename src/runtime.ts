/**
 * 浏览器**运行时挂载与插入原语**（主包与 `compiled` 共用）：`mount` 解析容器后委托 `createRoot`；`insert` 组合静态 / 挂载函数 / 响应式插入。
 *
 * - `createRoot` / `render` / `mount`：`fn(container)` 只执行一次，内部通过 `insert` 建立 DOM。
 * - `insert`：支持 `(parent) => void`、静态值、或 getter → 上述；水合期间可委托 `KEY_VIEW_HYDRATE` 上下文。
 * - `insertReactive` / `insertIrList`：可处理 `MountFn`、数组、`VNode`、`DocumentFragment` 与文本节点等；后者对齐 同类方案 可空列表源（`list() ?? []`）。
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
import {
  captureNewChildrenSince,
  createReactiveInsertFragment,
  getChildNodesList,
  mountVNodeTreeAtSiblingAnchor,
  moveFragmentChildren,
  resolveSiblingAnchor,
} from "./compiler/insert-reactive-siblings.ts";
import {
  coalesceIrList,
  expandIrArray,
  type IrListOptions,
  readReactiveInsertRawFromGetter,
} from "./compiler/ir-coerce.ts";
import { untrack } from "./effect.ts";
import {
  beginInsertReactiveChildCollect,
  endInsertReactiveChildCollect,
  registerChildInsertReactiveDispose,
} from "./compiler/ir-nested.ts";
import { runInsertReactiveIntrinsicVNodeCleanup } from "./compiler/ir-clean.ts";
import {
  extractStableVNodeKeysFromCoercedItems,
  patchInsertReactiveArrayInPlaceOrKeyed,
} from "./compiler/ir-array-patch.ts";
import { mountVNodeTree } from "./compiler/vnode-mount.ts";
import {
  noteInsertReactiveIntrinsicDomPatched,
  noteInsertReactiveIntrinsicDomReplaced,
} from "./compiler/ir-metrics.ts";
import {
  canPatchIntrinsic,
  patchIntrinsicSubtree,
} from "./compiler/vnode-reconcile.ts";
import {
  type ReactiveInsertNext,
  setInsertReactiveForVnodeMount,
} from "./compiler/vnode-insert-bridge.ts";
import { isSignalGetter } from "./signal.ts";
import type { EffectDispose, VNode } from "./types.ts";

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
        "[view] mount skipped: mount container not found " +
          (typeof container === "string" ? container : "(Element)") +
          '; the page will stay empty. Ensure the node exists in HTML (e.g. <div id="root"></div>) and the script runs after the DOM is ready.',
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
      "[view] component may not have been compiled: returned VNode instead of (parent)=>void; #root may stay empty.",
      "Uncompiled node type:",
      typeInfo,
      "(ensure the .tsx containing this component is processed by view-cli dev/build compileSource)",
      value,
    );
  }
  return node;
}

const append = (p: InsertParent, child: Node): void => {
  (p as { appendChild(n: unknown): unknown }).appendChild(child);
};

/**
 * 2.3 原语：仅静态插入，无 effect；供编译器或手写按需使用以利 tree-shaking。
 * 若误传入 VNode（与 `insert(parent, jsx(...))` 漏检同源），改为 `mountVNodeTree` 展开，避免空文本占位。
 */
export function insertStatic(
  parent: InsertParent,
  value: string | number | Node | null | undefined,
): undefined {
  const v = value as unknown;
  if (isVNodeLike(v)) {
    mountVNodeTree(parent as Node, v as VNode);
    return undefined;
  }
  append(parent, toNodeForInsert(value as InsertValue));
  return undefined;
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
  /**
   * 上一轮数组 commit 的稳定 VNode key 列（与 `currentNodes` 下标对齐），供 key 重排 patch。
   */
  let prevArrayVNodeKeys: string[] | null = null;
  /**
   * 下一轮须在 `insertBefore(anchor)` 插入：effect 重跑前 onCleanup 会清空 `currentNodes`，
   * 锚点只能每轮挂载后记 `tracked[last].nextSibling`（见 ui-view 侧栏 + main 兄弟序）。
   */
  let siblingAnchorForNextRun: Node | null = null;
  /**
   * 上一轮本插入块「第一个追踪节点」的前一个兄弟（仍在 parent 内时通常稳定）。
   * 当 `siblingAnchorForNextRun` 指向的「后兄弟」被其它 insertReactive 整节点替换而脱离文档时，
   * `resolveSiblingAnchor` 会得到 null，若直接 append 会把整块插到父末尾（如文档站 Table 跑到 CodeBlock 下）。
   */
  let stablePreviousSiblingSnapshot: Node | null = null;
  /** 用户显式 dispose 时须完整清理，不可保留 DOM 走 patch */
  let forceFullInsertReactiveCleanup = false;
  /**
   * 上一轮 effect 体结束时的 `currentNodes.length`；重跑时 cleanup 会先清空数组，
   * insertReactive metrics 依赖此快照判断 `hadPriorDom`。
   */
  let prevCommitTrackedLen = 0;
  const innerDispose = createEffect(() => {
    /** 同步挂载阶段更深 `insertReactive` 的 dispose，须在 detach 本层 DOM 前先执行（见 ir-nested） */
    const childInsertDisposers: EffectDispose[] = [];
    beginInsertReactiveChildCollect(childInsertDisposers);
    try {
      /** 父已卸载或非法入参时跳过，避免 MountFn 内 appendChild 抛错（Suspense 竞态等） */
      if (parentNode == null) {
        return;
      }
      let anchor = resolveSiblingAnchor(parentNode, siblingAnchorForNextRun);
      if (anchor === null && siblingAnchorForNextRun !== null) {
        const prev = stablePreviousSiblingSnapshot;
        if (prev != null && prev.parentNode === parentNode) {
          anchor = prev.nextSibling;
        } else {
          anchor = parentNode.firstChild;
        }
      }
      const commitTracked = (nodes: Node[]) => {
        currentNodes = nodes;
        const refreshAnchor = () => {
          siblingAnchorForNextRun = currentNodes.length > 0
            ? currentNodes[currentNodes.length - 1]!.nextSibling
            : null;
        };
        refreshAnchor();
        /**
         * 同一同步挂载函数里若先 `insertReactive` 再 `appendChild` 兄弟，首帧结束时 `nextSibling` 仍为 null；
         * 微任务阶段兄弟已挂上，再读一次锚点（见 runtime 单测与文档侧栏 + main）。
         */
        if (
          siblingAnchorForNextRun === null &&
          currentNodes.length > 0 &&
          typeof globalThis.queueMicrotask === "function"
        ) {
          globalThis.queueMicrotask(refreshAnchor);
        }
      };
      /** 是否上一轮提交后曾有追踪节点（见 `prevCommitTrackedLen`，供 metrics） */
      const hadPriorDom = prevCommitTrackedLen > 0;
      /** 与 compiler/insert、`ir-coerce` 共用解包语义 */
      const next = readReactiveInsertRawFromGetter(
        getter as () => unknown,
      ) as ReactiveInsertNext;
      /**
       * 与 vnode-mount 的 mountChildItemForVnode 一致：compileSource 可能产出未打标的 `(parent)=>void`
       * （如 `{() => (() => (parent)=>{ insertReactive(parent, …) })()}` 外层），若仅认 isMountFn 会落入 toNodeForInsert，
       * 函数被当成非法插入值 → 相册预览等含 role="dialog" 的子树永不挂载。
       */
      const nextIsDomMountFn = typeof next === "function" &&
        (isMountFn(next) ||
          ((next as (p: Node) => void).length === 1 && !isSignalGetter(next)));
      if (nextIsDomMountFn) {
        prevArrayVNodeKeys = null;
        const mountFn = next as (parent: Node) => void;
        let nodes: Node[];
        /**
         * MountFn 在 `createEffect` 体内同步调用：若此处不 `untrack`，fn 内读到的 signal 会登记到**本层**
         * insertReactive effect，导致整段挂载被误订阅（如 Transfer 搜索框键入即整列 detach 失焦）。
         * 内层 `insertReactive` / `createEffect` 仍会各自 `setCurrentEffect` 并正常收集依赖。
         */
        if (anchor != null) {
          const frag = createReactiveInsertFragment();
          untrack(() => {
            mountFn(frag);
          });
          nodes = moveFragmentChildren(parentNode, frag, anchor);
        } else {
          const beforeLen = getChildNodesList(parentNode).length;
          untrack(() => {
            mountFn(parentNode);
          });
          nodes = captureNewChildrenSince(parentNode, beforeLen);
        }
        commitTracked(nodes);
        if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
      } else if (Array.isArray(next)) {
        /**
         * 数组分支：`expandIrArray` 扁平嵌套数组、原始值→文本 VNode、读 SignalRef，
         * **VNode 与 MountFn 可混排**（与 jsx-runtime 手写列表一致）。
         */
        const items = expandIrArray(next as unknown[]);
        if (items.length === 0) {
          commitTracked([]);
          prevArrayVNodeKeys = null;
          if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
        } else if (
          currentNodes.length > 0 &&
          patchInsertReactiveArrayInPlaceOrKeyed(
            items,
            currentNodes,
            prevArrayVNodeKeys,
          )
        ) {
          commitTracked(currentNodes);
          prevArrayVNodeKeys = extractStableVNodeKeysFromCoercedItems(items);
          if (hadPriorDom) noteInsertReactiveIntrinsicDomPatched();
        } else {
          let nodes: Node[];
          if (anchor != null) {
            const frag = createReactiveInsertFragment();
            for (const item of items) {
              if (typeof item === "function") {
                untrack(() => {
                  (item as (parent: Node) => void)(frag);
                });
              } else {
                mountVNodeTree(frag, item);
              }
            }
            nodes = moveFragmentChildren(parentNode, frag, anchor);
          } else {
            const beforeLen = getChildNodesList(parentNode).length;
            for (const item of items) {
              if (typeof item === "function") {
                untrack(() => {
                  (item as (parent: Node) => void)(parentNode);
                });
              } else {
                mountVNodeTree(parentNode, item);
              }
            }
            nodes = captureNewChildrenSince(parentNode, beforeLen);
          }
          commitTracked(nodes);
          prevArrayVNodeKeys = extractStableVNodeKeysFromCoercedItems(items);
          if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
        }
      } else if (isVNodeLike(next)) {
        prevArrayVNodeKeys = null;
        const vn = next as VNode;
        if (
          currentNodes.length === 1 &&
          currentNodes[0]!.nodeType === 1 &&
          canPatchIntrinsic(currentNodes[0]!, vn)
        ) {
          patchIntrinsicSubtree(currentNodes[0] as Element, vn);
          commitTracked([currentNodes[0]!]);
          if (hadPriorDom) noteInsertReactiveIntrinsicDomPatched();
        } else {
          commitTracked(
            mountVNodeTreeAtSiblingAnchor(parentNode, vn, anchor),
          );
          if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
        }
      } else if (
        typeof next === "object" &&
        next !== null &&
        typeof (next as Node).nodeType === "number" &&
        (next as Node).nodeType === 11
      ) {
        prevArrayVNodeKeys = null;
        /**
         * DocumentFragment：appendChild 后子节点会从 fragment 移入父节点，fragment 随即为空。
         * 只把**实际挂到父上的子节点**记入 currentNodes；空 fragment 须 commitTracked([]) 以便与本轮 detach 对齐。
         */
        const frag = next as DocumentFragment;
        if (getChildNodesList(frag as unknown as Node).length === 0) {
          commitTracked([]);
          if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
        } else {
          let nodes: Node[];
          if (anchor != null) {
            nodes = moveFragmentChildren(parentNode, frag, anchor);
          } else {
            const beforeLen = getChildNodesList(parentNode).length;
            parentNode.appendChild(frag);
            nodes = captureNewChildrenSince(parentNode, beforeLen);
          }
          commitTracked(nodes);
          if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
        }
      } else {
        prevArrayVNodeKeys = null;
        /**
         * 文本/数字/单节点等：只替换本 effect 曾插入的 currentNodes，禁止 replaceChildren(parent)
         * 否则同一父下若有兄弟（如先 insertMount 了 Form、再 insertReactive 条件分支），
         * getter 返回 false/null 时会清空整父节点，典型：`<div><Form/>{submitted() && <p/>}</div>` 白屏。
         */
        const node = toNodeForInsert(next as InsertValue);
        if (anchor != null) {
          /** 与 compiler/insert 一致：父节点无 insertBefore 时回退 appendChild */
          const ins = (parentNode as unknown as {
            insertBefore?: (n: Node, ref: Node | null) => void;
          }).insertBefore;
          if (typeof ins === "function") {
            ins.call(parentNode, node, anchor);
          } else {
            (parentNode as Node).appendChild(node);
          }
        } else {
          parentNode.appendChild(node);
        }
        commitTracked([node]);
        if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
      }
      /**
       * 与 `compiler/insert.ts` 中 `insertReactive` 一致：detach 的 onCleanup 须排在 MountFn 同步挂载完成之后登记，
       * 使 MountFn 内嵌套的 insertReactive 所登记的 onCleanup 先执行（FIFO），避免父先摘 DOM 而子 effect 未 dispose 导致重复挂载。
       *
       * VNode 子树内嵌套 `insertReactive` 与外层同读一 signal 时，须先逆序 dispose 子层（ir-nested）。
       */
      onCleanup(() => {
        if (currentNodes.length > 0) {
          stablePreviousSiblingSnapshot = currentNodes[0]!.previousSibling;
        } else {
          stablePreviousSiblingSnapshot = null;
        }
        runInsertReactiveIntrinsicVNodeCleanup({
          forceFullCleanup: forceFullInsertReactiveCleanup,
          getter: getter as () => unknown,
          currentNodes,
          prevArrayVNodeKeys,
          childInsertDisposers,
          detachTracked: detachInsertReactiveTrackedChild,
        });
      });
    } finally {
      if (parentNode != null) {
        prevCommitTrackedLen = currentNodes.length;
      }
      endInsertReactiveChildCollect();
    }
  });
  const dispose = (): void => {
    forceFullInsertReactiveCleanup = true;
    try {
      innerDispose();
    } finally {
      forceFullInsertReactiveCleanup = false;
    }
  };
  registerChildInsertReactiveDispose(dispose);
  return dispose;
}

/**
 * 与同类方案 `<For each={list()}>` / `mapArray` 内 `list() ?? []` 同向：将 accessor 可能返回的
 * `null`/`undefined` 规范为**空数组**后再走 {@link insertReactive} 的数组分支（keyed 协调等语义不变）。
 * 可选 `fallback` 对齐 同类方案 `<For fallback={…}>`：扁平后**无项**时展示占位而非空列表。
 *
 * @param parent - 插入父节点（与 `insertReactive` 一致）
 * @param accessor - 返回列表源，可为 null/undefined（如异步数据未就绪）
 * @param options - 如 `fallback`，列表展开为空时调用
 * @returns `createEffect` 的 dispose
 */
export function insertIrList(
  parent: InsertParent,
  accessor: () => readonly unknown[] | null | undefined,
  options?: IrListOptions,
): import("./types.ts").EffectDispose {
  return insertReactive(parent, () => {
    const raw = coalesceIrList(accessor());
    if (options?.fallback != null) {
      /** 与同类方案 一致：仅当「无可见子项」时走 fallback，须与 `expandIrArray` 判定一致 */
      const flat = expandIrArray(raw);
      if (flat.length === 0) {
        return options.fallback() as ReactiveInsertNext;
      }
    }
    return raw as ReactiveInsertNext;
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
    /**
     * 零参 getter（含返回 VNode、signal、文本）须走 insertReactive + mountVNodeTree，
     * 与 getActiveDocument 代理按 DFS 消费迭代器。hydrate.insert 会先 next 单节点再 replaceSlot，
     * 无法展开 VNode，会导致水合后容器为空或错位。
     */
    if (typeof value === "function" && value.length === 0) {
      return insertReactive(parent, value as () => ReactiveInsertNext);
    }
    /**
     * 静态 VNode（jsx-runtime / 打包器 `insert(parent, jsx(...))`）亦不能交给 hydrate.insert：
     * 后者对非 getter 仅「消费迭代器」不挂载，与 CSR 下 insertStatic 误伤同根因。
     */
    if (typeof value !== "function" && isVNodeLike(value)) {
      return insertReactive(parent, () => value as ReactiveInsertNext);
    }
    hydrate.insert(parent as Node, value);
    return undefined;
  }
  /**
   * 单参 `(parent)=>void`：编译产物多为 `markMountFn`；未打标时仍按历史行为直挂（与 insertReactive 内 MountFn 识别一致）。
   */
  if (typeof value === "function" && value.length === 1) {
    return insertMount(parent, value as (p: Node) => void);
  }
  /**
   * 非函数：除文本/节点外，可能是 **esbuild/TS 对静态 JSX** 生成的 `insert(parent, jsx(...))`（第二参为 VNode）。
   * 若走 insertStatic→toNodeForInsert 会误报「returned VNode」且根节点空白；须走 insertReactive + mountVNodeTree。
   */
  if (typeof value !== "function") {
    if (isVNodeLike(value)) {
      return insertReactive(parent, () => value as ReactiveInsertNext);
    }
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
