/**
 * insertReactive 在父节点已有其它兄弟（如侧栏 + main）时，更新阶段须在**原插入区间**内替换，
 * 不能一律 appendChild 到父末尾，否则 DOM 顺序会变成 [main, aside]（侧栏跑到右侧）。
 *
 * @module @dreamer/view/compiler/insert-reactive-siblings
 */

import { getActiveDocument } from "./active-document.ts";
import type { VNode } from "../types.ts";
import { mountVNodeTree } from "./vnode-mount.ts";

/** `Array.from(undefined)` 会读 `undefined.length`；与空父级子列表等价 */
const EMPTY_CHILD_LIST: ArrayLike<ChildNode> = Object.freeze([]);

/**
 * 安全读取 `parent.childNodes`：SSR 伪节点若未实现 `childNodes` 会得到 `undefined`，
 * `parent.childNodes.length` / `Array.from(parent.childNodes)` 会抛 `Cannot read properties of undefined (reading 'length')`。
 *
 * @param parent - DOM 或 SSR 父节点
 * @returns 可索引的子节点列表（缺失时等价空列表）
 */
export function getChildNodesList(parent: Node): ArrayLike<ChildNode> {
  const raw =
    (parent as unknown as { childNodes?: ArrayLike<ChildNode> | null })
      .childNodes;
  if (raw != null && typeof raw.length === "number") {
    return raw;
  }
  return EMPTY_CHILD_LIST;
}

/**
 * ActiveDocumentLike 类型未声明 createDocumentFragment，但浏览器 Document 与运行时均有；
 * insertReactive 锚点路径依赖 fragment 作临时容器。
 */
export function createReactiveInsertFragment(): DocumentFragment {
  return (getActiveDocument() as unknown as Document).createDocumentFragment();
}

/**
 * 由「跨轮保存的锚点」解析出本轮 insertBefore 目标；锚点已脱离 parent 时返回 null（回退 append）。
 */
export function resolveSiblingAnchor(
  parent: Node,
  stored: Node | null,
): Node | null {
  if (stored != null && stored.parentNode === parent) return stored;
  return null;
}

/**
 * 将 fragment 内子节点依次移到 parent，插在 anchor 之前；anchor 为 null 时等价于 append。
 *
 * @param parent - 目标父节点
 * @param frag - 临时承载 mountVNodeTree 产物的文档片段
 * @param anchor - insertBefore 锚点；null 则 appendChild
 * @returns 实际挂到 parent 上的节点列表（供 insertReactive 追踪）
 */
export function moveFragmentChildren(
  parent: Node,
  frag: DocumentFragment,
  anchor: Node | null,
): Node[] {
  const inserted: Node[] = [];
  let ch: ChildNode | null;
  if (anchor != null && anchor.parentNode === parent) {
    while ((ch = frag.firstChild)) {
      parent.insertBefore(ch, anchor);
      inserted.push(ch as Node);
    }
  } else {
    while ((ch = frag.firstChild)) {
      parent.appendChild(ch);
      inserted.push(ch as Node);
    }
  }
  return inserted;
}

/**
 * 收集 `parent` 在挂载前已有 `fromIndex` 个子节点之后新增的子节点（与 `getChildNodesList` 对齐，避免 `childNodes` 缺失时抛错）。
 *
 * @param parent - 挂载后的父节点
 * @param fromIndex - 挂载前子列表长度
 * @returns 本次新增的 DOM 节点
 */
export function captureNewChildrenSince(
  parent: Node,
  fromIndex: number,
): Node[] {
  const list: Node[] = [];
  const cn = getChildNodesList(parent);
  const len = cn.length;
  for (let i = fromIndex; i < len; i++) list.push(cn[i] as Node);
  return list;
}

/**
 * 将 VNode 挂到 parent：有合法锚点时插在锚点之前，否则 append。
 * 调用方须保证旧 DOM 已由 effect `onCleanup` 摘除；本函数不再 detach。
 *
 * @param parent - 父节点
 * @param vnode - 要挂载的 VNode
 * @param anchor - insertBefore 目标；null 则追加到 parent 末尾
 * @returns 新追踪节点列表
 */
export function mountVNodeTreeAtSiblingAnchor(
  parent: Node,
  vnode: VNode,
  anchor: Node | null,
): Node[] {
  if (anchor != null && anchor.parentNode === parent) {
    const frag = createReactiveInsertFragment();
    mountVNodeTree(frag, vnode);
    return moveFragmentChildren(parent, frag, anchor);
  }
  const beforeLen = getChildNodesList(parent).length;
  mountVNodeTree(parent, vnode);
  return captureNewChildrenSince(parent, beforeLen);
}
