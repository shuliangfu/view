/**
 * **插入点 API**实现（编译产物与 `@dreamer/view/compiler` 共用）：静态插入、`insertReactive`、以及水合模式下对 `KEY_VIEW_HYDRATE` 的委托。
 *
 * getter 在 `createEffect` 中求值，仅该插入点随 signal 依赖更新（细粒度 DOM 更新）。
 *
 * @module @dreamer/view/compiler/insert
 * @internal 请从 `@dreamer/view` 或 `@dreamer/view/compiler` 使用 `insert` / `insertReactive`，勿依赖本文件路径
 */

import { KEY_VIEW_HYDRATE } from "../constants.ts";
import { isVNodeLike } from "../dom/shared.ts";
import { createEffect, onCleanup, untrack } from "../effect.ts";
import { runInsertReactiveIntrinsicVNodeCleanup } from "./ir-clean.ts";
import {
  extractStableVNodeKeysFromCoercedItems,
  patchInsertReactiveArrayInPlaceOrKeyed,
} from "./ir-array-patch.ts";
import type { EffectDispose, VNode } from "../types.ts";
import { getActiveDocument } from "./active-document.ts";
import {
  captureNewChildrenSince,
  createReactiveInsertFragment,
  getChildNodesList,
  mountVNodeTreeAtSiblingAnchor,
  moveFragmentChildren,
  resolveSiblingAnchor,
} from "./insert-reactive-siblings.ts";
import {
  coalesceIrList,
  expandIrArray,
  type IrListOptions,
  readReactiveInsertRawFromGetter,
} from "./ir-coerce.ts";
import {
  beginInsertReactiveChildCollect,
  endInsertReactiveChildCollect,
  registerChildInsertReactiveDispose,
} from "./ir-nested.ts";
import { mountVNodeTree } from "./vnode-mount.ts";
import {
  noteInsertReactiveIntrinsicDomPatched,
  noteInsertReactiveIntrinsicDomReplaced,
} from "./ir-metrics.ts";
import { canPatchIntrinsic, patchIntrinsicSubtree } from "./vnode-reconcile.ts";
import { isMountFn as isMarkedDomMountFn, markMountFn } from "./mount-fn.ts";
import { valueToNode } from "./to-node.ts";
import type { SSRElement } from "./ssr-document.ts";

export { isMarkedDomMountFn as isMountFn, markMountFn };

/** 细粒度水合时挂到 KEY_VIEW_HYDRATE 的对象，insert 会委托给其 insert 方法 */
type HydrateContextLike = { insert(parent: Node, value: InsertValue): void };

/** 可接受插入的父节点：DOM Node 或 SSR 容器（同一 fn 在客户端/服务端复用） */
export type InsertParent = Node | SSRElement;

/** 插入点可接受的值：文本、数字、DOM 节点，或返回上述类型的 getter */
export type InsertValue =
  | string
  | number
  | Node
  | null
  | undefined
  | (() => InsertValue);

/**
 * `insertReactive` 的 getter 可返回的扩展类型：在扁平值之外支持编译器产出的挂载函数及挂载函数数组。
 */
export type InsertReactiveResult =
  | string
  | number
  | Node
  | null
  | undefined
  | VNode
  | (() => InsertReactiveResult)
  | ((parent: Node) => void)
  | readonly unknown[];

/** 将值转为 DOM 节点，复用 compiler 内共享的 valueToNode（2.1 收敛） */
function toNode(value: InsertValue): Node {
  return valueToNode(
    value as import("./to-node.ts").ValueToNodeInput,
    getActiveDocument(),
  );
}

const append = (p: InsertParent, child: Node): void => {
  (p as { appendChild(n: unknown): unknown }).appendChild(child);
};

/** 从实际 parentNode 摘除节点，避免 parent 引用不一致时残留；与 runtime 共用，由本模块导出（2.1 收敛） */
export function detachInsertReactiveTrackedChild(n: Node): void {
  const p = n.parentNode;
  if (p) p.removeChild(n);
}

/**
 * 2.3 原语：仅静态插入；供编译器按需使用以利 tree-shaking。
 * 与主包 {@link runtime.ts} 一致：若收到 VNode 则 `mountVNodeTree` 展开。
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
  append(parent, toNode(value));
  return undefined;
}

/** 2.3 原语：仅 getter 响应式插入；供编译器按需使用以利 tree-shaking */
export function insertReactive(
  parent: InsertParent,
  getter: () => InsertReactiveResult,
): EffectDispose {
  const parentNode = parent as Node | null;
  let currentNodes: Node[] = [];
  /**
   * 上一轮数组 commit 的稳定 VNode key 列（与 `currentNodes` 下标对齐），供下一轮 key 重排 patch；
   * 非数组返回值路径会置 null。
   */
  let prevArrayVNodeKeys: string[] | null = null;
  let siblingAnchorForNextRun: Node | null = null;
  /** 与主包 `runtime.insertReactive` 一致：后兄弟整节点替换导致尾锚点失效时，用前兄弟恢复插入位置 */
  let stablePreviousSiblingSnapshot: Node | null = null;
  /**
   * 用户显式 dispose 整个插入点时为 true，使 onCleanup 走完整子 dispose + detach（不可走「保留 DOM patch」分支）。
   */
  let forceFullInsertReactiveCleanup = false;
  /**
   * 上一轮 effect 体结束时的 `currentNodes.length`；effect 重跑时 onCleanup 会先清空 `currentNodes`，
   * metrics 的「是否曾有追踪节点」须读此快照而非读当下的 `currentNodes`。
   */
  let prevCommitTrackedLen = 0;
  const innerDispose = createEffect(() => {
    /** 同步挂载阶段 deeper `insertReactive` 的 dispose，须在 detach 本层 DOM 前先执行 */
    const childInsertDisposers: EffectDispose[] = [];
    beginInsertReactiveChildCollect(childInsertDisposers);
    try {
      /** 父已卸载或非法入参时跳过，避免 MountFn 内 appendChild 抛错 */
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
        if (
          siblingAnchorForNextRun === null &&
          currentNodes.length > 0 &&
          typeof globalThis.queueMicrotask === "function"
        ) {
          globalThis.queueMicrotask(refreshAnchor);
        }
      };
      /**
       * 上一轮提交后是否曾有追踪节点（见 `prevCommitTrackedLen`）；用于开发向 metrics。
       */
      const hadPriorDom = prevCommitTrackedLen > 0;
      /** 与主包 `runtime.insertReactive`、`ir-coerce` 共用解包语义 */
      const next = readReactiveInsertRawFromGetter(
        getter as () => unknown,
      ) as InsertReactiveResult;
      if (isMarkedDomMountFn(next)) {
        prevArrayVNodeKeys = null;
        let nodes: Node[];
        /**
         * 与主包 `runtime.insertReactive` 一致：MountFn 同步执行须 `untrack`，避免 fn 内 signal 读挂到本层 effect。
         */
        if (anchor != null) {
          const frag = createReactiveInsertFragment();
          untrack(() => {
            (next as (p: Node) => void)(frag);
          });
          nodes = moveFragmentChildren(parentNode, frag, anchor);
        } else {
          const beforeLen = getChildNodesList(parentNode).length;
          untrack(() => {
            (next as (p: Node) => void)(parentNode);
          });
          nodes = captureNewChildrenSince(parentNode, beforeLen);
        }
        commitTracked(nodes);
        if (hadPriorDom) noteInsertReactiveIntrinsicDomReplaced();
      } else if (Array.isArray(next)) {
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
          /** 与单根 patch 一致：保留兄弟引用，仅更新本征子树（含 key 重排） */
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
                  (item as (p: Node) => void)(frag);
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
                  (item as (p: Node) => void)(parentNode);
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
        /**
         * getter 返回 VNode：默认可 mount；若上一轮已保留单根本征 DOM 且结构兼容，则 patch 而非整段重挂。
         */
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
         * DocumentFragment：append/insertBefore 后子节点移入父节点，fragment 变空。
         * 与 `runtime.insertReactive` 同语义，避免仅编译产物路径把 fragment 打成空文本节点。
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
         * 与主包 runtime.insertReactive 一致：仅用 appendChild 追加新节点，不用 replaceChildren 清父级，
         * 避免与兄弟静态/其它 insert 点共存时被误清空。
         */
        const node = toNode(next as InsertValue);
        if (anchor != null) {
          /** 部分环境父节点非 Element（如 Text）或 SSRElement 未实现 insertBefore 时回退 appendChild，避免 hydrate 细粒度更新抛错 */
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
       * 须在同步挂载（含 MountFn 内嵌套的 insertReactive）全部结束后再登记 detach 清理：
       * 否则子 insertReactive 的 onCleanup 会排在父 detach 之后（链表 FIFO），父先摘掉 DOM 时子 effect 未 dispose，
       * 下一轮重跑会重复挂载（compileSource 下 markMountFn 内文本插值 + 外层 value 刷新时可复现，如 DatePicker）。
       *
       * VNode 子树内 `insertReactive` 与外层同读一 signal 时，须先逆序 dispose 子层 insertReactive（ir-nested）。
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
 * 与同类方案 `<For each={list()}>` / `mapArray` 的 `list() ?? []` 同向：将 accessor 可能返回的
 * null/undefined 规范为空数组后再走 {@link insertReactive} 的数组分支；可选 `fallback` 对齐 `<For fallback={…}>`。
 *
 * @param parent - 插入父节点
 * @param accessor - 返回列表源，可为 null/undefined
 * @param options - 如 `fallback`，列表展开为空时调用
 */
export function insertIrList(
  parent: InsertParent,
  accessor: () => readonly unknown[] | null | undefined,
  options?: IrListOptions,
): EffectDispose {
  return insertReactive(parent, () => {
    const raw = coalesceIrList(accessor());
    if (options?.fallback != null) {
      const flat = expandIrArray(raw);
      if (flat.length === 0) {
        return options.fallback() as InsertReactiveResult;
      }
    }
    return raw as InsertReactiveResult;
  });
}

/**
 * 在 parent 下插入静态内容或响应式绑定点；内部委托给 insertStatic/insertReactive。
 *
 * @param parent - 父节点（DOM Node 或 SSR 时的 SSRElement）
 * @param value - 静态值或 getter
 * @returns getter 时返回 effect 的 dispose，静态值时返回 undefined
 */
export function insert(
  parent: InsertParent,
  value: InsertValue,
): EffectDispose | undefined {
  const hydrate = (globalThis as Record<string, unknown>)[KEY_VIEW_HYDRATE] as
    | HydrateContextLike
    | undefined;

  /**
   * 单参 `markMountFn((p)=>void)` 与主包 `runtime.insert` 一致：直接执行挂载函数，不得包进 `insertReactive`。
   * 否则 `getter()` 会变成无参调用 MountFn，手写 `insert(el, markMountFn(...))` 在 CSR/SSR 均会静默失败。
   */
  if (
    typeof value === "function" &&
    (value as (p?: unknown) => void).length === 1 &&
    isMarkedDomMountFn(value)
  ) {
    if (hydrate?.insert) {
      hydrate.insert(parent as Node, value);
      return undefined;
    }
    (value as (p: Node) => void)(parent as Node);
    return undefined;
  }

  if (hydrate?.insert) {
    /**
     * 静态 VNode 须走 insertReactive（replaceSlot + mountVNodeTree），不可仅 hydrate.insert 消费槽位。
     * 与主包 {@link runtime.ts} `insert` 水合分支对齐。
     */
    if (typeof value !== "function" && isVNodeLike(value)) {
      return insertReactive(parent, () => value as InsertReactiveResult);
    }
    hydrate.insert(parent as Node, value);
    return undefined;
  }
  if (typeof value === "function") {
    return insertReactive(parent, value);
  }
  /**
   * 与主包 {@link runtime.ts} 的 `insert` 一致：静态 VNode（手写/打包器 `insert(parent, jsx(...))`）须走响应式分支以 `mountVNodeTree` 展开。
   */
  if (isVNodeLike(value)) {
    return insertReactive(parent, () => value as InsertReactiveResult);
  }
  insertStatic(parent, value);
  return undefined;
}
