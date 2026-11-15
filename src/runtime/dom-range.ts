/**
 * 共享的 DOM 区间操作：控制流与数组插入都按起止锚点清理／移动，避免各写一份。
 *
 * @module runtime/dom-range
 */

/**
 * 清除 `start` 与 `end` 之间的节点，保留起止锚点本身。
 */
export function clearBetweenAnchors(start: Node, end: Node): void {
  const parent = start.parentNode;
  if (!parent) return;
  let node: Node | null = start.nextSibling;
  while (node && node !== end) {
    const next: Node | null = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}

/**
 * 将 `start` 到 `end`（含）的节点依次 `insertBefore(parent, before)`，保持相对顺序。
 */
export function moveNodeRangeBefore(
  start: Node,
  end: Node,
  parent: Node,
  before: Node | null,
): void {
  let node: Node | null = start;
  while (node) {
    const next: Node | null = node.nextSibling;
    parent.insertBefore(node, before);
    if (node === end) break;
    node = next;
  }
}

/**
 * 移除 `start` 到 `end`（含）的全部节点。
 */
export function removeNodeRange(start: Node, end: Node): void {
  const p = start.parentNode;
  if (!p) return;
  let node: Node | null = start;
  while (node) {
    const next: Node | null = node.nextSibling;
    p.removeChild(node);
    if (node === end) break;
    node = next;
  }
}
