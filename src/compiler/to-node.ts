/**
 * 共享：将「已求值」的插入值转为 DOM 节点（文本或元素）。
 * 供 compiler/insert、vnode-mount、insert-replacing 及 runtime 的 toNodeForInsert 复用，
 * 避免 toNode / toDomLeafNode 逻辑重复（2.1 收敛）。
 *
 * @module @dreamer/view/compiler/to-node
 */

/** 已求值、可转为 Node 的类型（不含 getter 与 MountFn） */
export type ValueToNodeInput =
  | string
  | number
  | Node
  | null
  | undefined;

/** 最小文档接口：与 active-document 的 ActiveDocumentLike 兼容（createTextNode 返回 unknown） */
export type DocumentLike = { createTextNode(data: string): unknown };

/**
 * 将值转为 DOM 节点（空值/文本/数字→文本节点，已是 Node 则原样返回）。
 * 使用 nodeType 判断 Node，避免依赖全局 Node（Deno 等环境可能未定义）。
 *
 * @param value - 已求值的插入值
 * @param doc - 文档对象（通常为 getActiveDocument()）
 * @returns 对应的 DOM 节点
 */
export function valueToNode(
  value: ValueToNodeInput,
  doc: DocumentLike,
): Node {
  if (value == null) {
    return doc.createTextNode("") as Node;
  }
  if (typeof value === "string" || typeof value === "number") {
    return doc.createTextNode(String(value)) as Node;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    typeof (value as Node).nodeType === "number"
  ) {
    return value as Node;
  }
  return doc.createTextNode("") as Node;
}
