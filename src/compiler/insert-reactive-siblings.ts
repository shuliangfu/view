/**
 * insertReactive 在父节点已有其它兄弟（如侧栏 + main）时，更新阶段须在**原插入区间**内替换，
 * 不能一律 appendChild 到父末尾，否则 DOM 顺序会变成 [main, aside]（侧栏跑到右侧）。
 *
 * @module @dreamer/view/compiler/insert-reactive-siblings
 */

import { getActiveDocument } from "./active-document.ts";
import type { VNode } from "../types.ts";
import { mountVNodeTree } from "./vnode-mount.ts";

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
  const beforeLen = parent.childNodes.length;
  mountVNodeTree(parent, vnode);
  const list: Node[] = [];
  const len = parent.childNodes.length;
  for (let i = beforeLen; i < len; i++) list.push(parent.childNodes[i]!);
  return list;
}
