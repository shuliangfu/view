/**
 * **插入点 API**实现（编译产物与 `@dreamer/view/compiler` 共用）：静态插入、`insertReactive`、以及水合模式下对 `KEY_VIEW_HYDRATE` 的委托。
 *
 * getter 在 `createEffect` 中求值，仅该插入点随 signal 依赖更新（细粒度 DOM 更新）。
 *
 * @module @dreamer/view/compiler/insert
 * @internal 请从 `@dreamer/view` 或 `@dreamer/view/compiler` 使用 `insert` / `insertReactive`，勿依赖本文件路径
 */

import { KEY_VIEW_HYDRATE } from "../constants.ts";
import { createEffect, onCleanup } from "../effect.ts";
import { unwrapSignalGetterValue } from "../signal.ts";
import type { EffectDispose } from "../types.ts";
import { getActiveDocument } from "./active-document.ts";
import { valueToNode } from "./to-node.ts";
import type { SSRElement } from "./ssr-document.ts";

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

/**
 * 判断是否为单参挂载函数 `(parent) => void`，供 insertReactive 与编译产物对齐。
 * 与 runtime 共用，由本模块导出（2.1 收敛）。
 *
 * @param value - getter 返回值
 * @returns 是否为挂载函数
 */
export function isMountFn(value: unknown): value is (parent: Node) => void {
  return typeof value === "function" &&
    (value as (p: unknown) => void).length === 1;
}

/** 从实际 parentNode 摘除节点，避免 parent 引用不一致时残留；与 runtime 共用，由本模块导出（2.1 收敛） */
export function detachInsertReactiveTrackedChild(n: Node): void {
  const p = n.parentNode;
  if (p) p.removeChild(n);
}

/** 2.3 原语：仅静态插入；供编译器按需使用以利 tree-shaking */
export function insertStatic(
  parent: InsertParent,
  value: string | number | Node | null | undefined,
): undefined {
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
  return createEffect(() => {
    /** 父已卸载或非法入参时跳过，避免 MountFn 内 appendChild 抛错 */
    if (parentNode == null) {
      return;
    }
    onCleanup(() => {
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
    });
    const next = unwrapSignalGetterValue(getter()) as InsertReactiveResult;
    if (isMountFn(next)) {
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
      const beforeLen = parentNode.childNodes.length;
      (next as (p: Node) => void)(parentNode);
      currentNodes = Array.from(parentNode.childNodes).slice(beforeLen);
      return;
    }
    if (Array.isArray(next)) {
      for (const n of currentNodes) {
        detachInsertReactiveTrackedChild(n);
      }
      currentNodes = [];
      const beforeLen = parentNode.childNodes.length;
      for (const fn of next) {
        if (isMountFn(fn)) (fn as (p: Node) => void)(parentNode);
      }
      currentNodes = Array.from(parentNode.childNodes).slice(beforeLen);
      return;
    }
    /**
     * 与主包 runtime.insertReactive 一致：仅用 appendChild 追加新节点，不用 replaceChildren 清父级，
     * 避免与兄弟静态/其它 insert 点共存时被误清空。
     */
    const node = toNode(next as InsertValue);
    for (const n of currentNodes) {
      detachInsertReactiveTrackedChild(n);
    }
    currentNodes = [node];
    parentNode.appendChild(node);
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
  if (hydrate?.insert) {
    hydrate.insert(parent as Node, value);
    return undefined;
  }
  if (typeof value === "function") {
    return insertReactive(parent, value);
  }
  insertStatic(parent, value);
  return undefined;
}
