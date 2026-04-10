/**
 * @module runtime/insert
 * @description 核心 DOM 插入逻辑，是整个框架的渲染引擎。
 *
 * **支持的功能：**
 * - ✅ 递归解包 Thunk (函数) 和 Signal
 * - ✅ 自动创建 Effect 监听响应式更新
 * - ✅ 支持 Fragment、数组、单个节点等多种类型
 * - ✅ 物理节点复用优化 (最小化 DOM 操作)
 * - ✅ 正确的清理机制 (onCleanup)
 *
 * **核心机制：**
 * - Thunk 扁平化：在**单个** `createEffect` 回调内用循环同步展平，直到非函数或带 `__VIEW_SIGNAL` 的 getter
 * - 响应式嵌套：展平后若仍是「可插入的函数值」，内层 `insert` 会再挂 Effect，属细粒度设计
 * - Signal 追踪：`value` 为函数时外包一层 Effect；重跑前会 `cleanNode` 释放子 Owner/Effect
 * - DOM：文本同位改 `textContent`；元素同引用跳过；数组子项**依次**直接插入 `parent`，避免 fragment 清空导致 effect 仍向脱离文档的 fragment 插节点（如 Password 多行）；用**注释锚点**包一段以便响应式重跑时整段替换
 * - 数组**不得**再套 `display:contents` 元素壳：壳仍是 `>` 选择器下的唯一直接子元素，会破坏 Tailwind `space-y-*`、`:first-child` 等依赖「多个直接子节点」的样式
 * - `<details>`：多子须直接挂在 `details` 下（首子须为 `summary`）；见 {@link insertArrayIntoDetailsElement}
 *
 * **刻意不在此做「整树 diff」：** 与无 VDOM、按 Signal 定点更新一致；列表键控与复用由 `For` / `Index` 等负责。
 *
 * **边界防护：** 同步 Thunk 链设深度上限，防止死循环拖死主线程；长期 Effect「泄漏」多因根未 `dispose`，非单点 `insert` 能单独修复。
 *
 * @usage
 * insert(parent, someReactiveValue, currentNode, beforeNode)
 */

import { createEffect } from "../reactivity/effect.ts";
import type { InsertCurrent, InsertValue, ViewSignalTagged } from "../types.ts";

/** 与 `ssr-dom.ts` 中 `SSR_VIEW_TREE_NODE` 同址，避免主包静态依赖 SSR 实现文件 */
const SSR_VIEW_TREE_NODE = Symbol.for("@dreamer/view/ssrTreeNode");

/** 数组插入段尾注释 `data`（DOM 中形如 `<!--view:array-end-->`）；作为 `insert` 返回值，effect 重跑时据此摘除整段 */
const VIEW_ARRAY_END = "view:array-end";
/**
 * 尾注释 → 本段第一个插入节点；不在 DOM 再放首注释，避免破坏 `:first-child` / 首个元素子选择器。
 */
const viewArrayBlockFirst = new WeakMap<Comment, Node>();

/**
 * 单次 `insert` 所建 Effect 的**回调里**，同步「再调用一层函数」的上限。
 *
 * **含义**：只有当你传入 `insert(parent, () => …)`，且该函数**同步地**一层层返回「还是函数、还要继续调」时才会计数；
 * 普通页面的组件层级、DOM 深度、路由页数量**不计入这里**——那些是多处 `insert`/多个 Effect，每层各自展平，通常只有几步。
 *
 * **4096 够不够**：真实 UI 里合法的同步 Thunk 链一般极短（0～几层）；上千层几乎一定是 bug（例如误写成无限 `() => () => …`）。
 * 本常量是防死循环的保险丝，不是「大网站容量」限制；若你有极深**静态**函数包装（非 bug），再考虑调大或改为可配置。
 */
const MAX_SYNC_THUNK_DEPTH = 4096;

/**
 * 判断是否为 DOM 节点：浏览器 `Node` 或 SSR 自研树节点（无全局 `Node` 时 `instanceof` 不可用）。
 */
function isDomNode(v: unknown): v is Node {
  if (v === null || typeof v !== "object") return false;
  if (typeof Node !== "undefined" && v instanceof Node) return true;
  return (v as Record<symbol, unknown>)[SSR_VIEW_TREE_NODE] === true;
}

/**
 * 判断是否为 HTML `<details>`：其**第一个元素子节点**必须是 `<summary>`。
 * 若在 `details` 下对多子使用 `data-view-array-shell` 的包裹层，该层会成为首子，
 * 浏览器不满足 content model，会显示本地化默认文案（如中文「详情」），而真正的 `summary` 会落到展开区内。
 */
function isHtmlDetailsElement(parent: Node): boolean {
  return parent.nodeName === "DETAILS";
}

/**
 * 是否为数组插入段尾锚注释（{@link VIEW_ARRAY_END}）。
 */
function isViewArrayEndComment(node: InsertCurrent): node is Comment {
  return (
    node != null &&
    typeof Node !== "undefined" &&
    node instanceof Node &&
    node.nodeType === Node.COMMENT_NODE &&
    (node as Comment).data === VIEW_ARRAY_END
  );
}

/**
 * 是否为旧版 `data-view-array-shell` 包裹层（迁移时整节点移除）。
 */
function isViewArrayShell(node: InsertCurrent): node is HTMLElement {
  return (
    node != null &&
    typeof Node !== "undefined" &&
    node instanceof HTMLElement &&
    node.getAttribute("data-view-array-shell") === ""
  );
}

/**
 * 按尾锚移除整段：自 {@link viewArrayBlockFirst} 记录的节点起顺序删到 `end`（含）。
 * 若无映射（空数组等），仅移除尾锚本身。
 */
function clearViewArrayBlockByEndComment(end: Comment): void {
  const p = end.parentNode;
  if (!p) return;
  const first = viewArrayBlockFirst.get(end);
  viewArrayBlockFirst.delete(end);
  if (first != null && first.parentNode === p) {
    let n: Node | null = first;
    while (n) {
      const nx: ChildNode | null = n.nextSibling;
      p.removeChild(n);
      if (n === end) break;
      n = nx;
    }
    return;
  }
  p.removeChild(end);
}

/**
 * 在把 `current` 当作「单节点占位」替换或删除前：若为数组段尾锚或旧 shell，先整段摘掉。
 * @returns 摘掉后的 `current`（可能为 `null`）
 */
function detachArrayInsertionHandle(current: InsertCurrent): InsertCurrent {
  if (current == null) return current;
  if (isViewArrayEndComment(current)) {
    clearViewArrayBlockByEndComment(current);
    return null;
  }
  if (isViewArrayShell(current)) {
    current.remove();
    return null;
  }
  return current;
}

/**
 * 将数组/类数组中的非空子项依次插入真实父节点 `parent`，保持顺序。
 * 不使用「先 fragment 再一次性 append」：插入文档后子节点会从 fragment 移走，fragment 变空且不再挂在树上，
 * 但各子项上的 `createEffect` 仍闭包引用该 fragment，重跑时新 DOM 会挂到脱离文档的 fragment 上，用户看不到。
 */
function insertNonNullChildrenIntoParent(
  parent: Node,
  items: ArrayLike<InsertValue | null | undefined>,
  before: Node | null | undefined,
): InsertCurrent {
  const n = items.length;
  /** 下一项的 `insertBefore` 锚点：首项用调用方 `before`，其后插在上一产出节点之后 */
  let nextBefore: Node | null = before ?? null;
  let lastOut: InsertCurrent = null;
  for (let i = 0; i < n; i++) {
    const child = items[i];
    if (child == null) continue;
    lastOut = insert(
      parent,
      child as InsertValue,
      undefined,
      nextBefore ?? undefined,
    );
    if (
      lastOut != null && typeof Node !== "undefined" && lastOut instanceof Node
    ) {
      nextBefore = lastOut.nextSibling;
    }
  }
  return lastOut;
}

/**
 * 向 `<details>` 插入多子：禁止套 array shell，必要时先清空旧子树（与 effect 重跑、旧版壳层兼容）。
 * @param before 若非空则不走「整棵清空」，直接按锚点顺序插入（极少用；与通用 shell 分支互斥）
 */
function insertArrayIntoDetailsElement(
  details: Node,
  items: ArrayLike<InsertValue | null | undefined>,
  before: Node | null | undefined,
): InsertCurrent {
  if (before == null) {
    while (details.firstChild) {
      details.removeChild(details.firstChild);
    }
  }
  return insertNonNullChildrenIntoParent(
    details,
    items,
    before ?? null,
  );
}

/**
 * 将数组子项**直接**插入 `parent`（不经元素壳）；仅追加尾注释作 effect 锚点，首节点记入 {@link viewArrayBlockFirst}。
 */
function insertArrayAsDirectChildren(
  parent: Node,
  items: ArrayLike<InsertValue | null | undefined>,
  current: InsertCurrent,
  before: Node | null | undefined,
): InsertCurrent {
  if (current != null) {
    if (isViewArrayEndComment(current)) {
      clearViewArrayBlockByEndComment(current);
    } else if (isViewArrayShell(current)) {
      current.remove();
    } else if (current.parentNode === parent) {
      parent.removeChild(current);
    }
  }

  const end = document.createComment(VIEW_ARRAY_END) as Comment;
  parent.insertBefore(end, before ?? null);

  const n = items.length;
  let nextBefore: Node | null = end;
  let lastOut: InsertCurrent = null;
  let firstInBlock: Node | null = null;
  for (let i = 0; i < n; i++) {
    const child = items[i];
    if (child == null) continue;
    lastOut = insert(
      parent,
      child as InsertValue,
      undefined,
      nextBefore ?? undefined,
    );
    if (
      firstInBlock == null &&
      lastOut != null &&
      typeof Node !== "undefined" &&
      lastOut instanceof Node
    ) {
      firstInBlock = lastOut;
    }
    if (
      lastOut != null &&
      typeof Node !== "undefined" &&
      lastOut instanceof Node
    ) {
      nextBefore = lastOut.nextSibling;
    }
  }
  if (firstInBlock != null) {
    viewArrayBlockFirst.set(end, firstInBlock);
  }
  return end;
}

/**
 * 将 `value` 渲染进 `parent`：解包函数/thunk、追踪 signal，并返回当前占位节点引用供后续更新。
 * @param parent 父 DOM 节点
 * @param value 可插入内容（节点、字符串、数组、VNode thunk 等）
 * @param current 上一轮插入的当前节点/锚点，用于最小更新
 * @param before 可选锚点兄弟节点，`insertBefore` 语义
 * @returns 更新后的当前占位（类型见 {@link InsertCurrent}）
 */
export function insert(
  parent: Node,
  value: InsertValue,
  current?: InsertCurrent,
  before?: Node,
): InsertCurrent {
  if (before && before.parentNode && before.parentNode !== parent) {
    parent = before.parentNode;
  }

  // 如果传入的 parent 是注释节点（如编译器的动态绑定占位符 <!--]-->），
  // 则自动将其视为 before 锚点，并重定向 parent 为其真实的父节点。
  if (parent && parent.nodeType === 8) {
    before = parent;
    parent = before.parentNode!;
  }

  if (value === current) return current;

  // 1. 处理函数 (Thunks 或 Signals)
  if (typeof value === "function") {
    // 强制追踪
    createEffect(() => {
      const latestParent =
        (before && before.parentNode && before.parentNode !== parent)
          ? before.parentNode
          : parent;

      let nextValue = value();

      // Thunk 扁平化：循环同步解包（非递归），带深度上限防死循环
      let depth = 0;
      while (
        typeof nextValue === "function" &&
        !(nextValue as ViewSignalTagged).__VIEW_SIGNAL &&
        depth < MAX_SYNC_THUNK_DEPTH
      ) {
        nextValue = (nextValue as () => unknown)();
        depth++;
      }
      if (
        typeof nextValue === "function" &&
        !(nextValue as ViewSignalTagged).__VIEW_SIGNAL
      ) {
        throw new Error(
          `[@dreamer/view] insert: 同步 Thunk 嵌套超过 ${MAX_SYNC_THUNK_DEPTH} 层，请检查是否无限返回函数`,
        );
      }

      current = insert(
        latestParent,
        nextValue as InsertValue,
        current,
        before,
      );
    });
    return current;
  }

  // 2. 处理 null/undefined/boolean
  if (value == null || typeof value === "boolean") {
    const cur = detachArrayInsertionHandle(current);
    if (cur && cur.parentNode) {
      cur.parentNode.removeChild(cur);
    }
    return null;
  }

  // 3. 处理字符串和数字（复用 TEXT_NODE 时勿先 createTextNode，减少热路径分配）
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value);
    const cur = detachArrayInsertionHandle(current);
    if (cur) {
      if (cur.nodeType === 3) {
        cur.textContent = s;
        return cur;
      }
      if (cur.parentNode) {
        const text = document.createTextNode(s);
        cur.parentNode.replaceChild(text, cur);
        return text;
      }
    }
    const text = document.createTextNode(s);
    parent.insertBefore(text, before || null);
    return text;
  }

  // 4. 处理 DOM 节点
  if (isDomNode(value)) {
    const cur = detachArrayInsertionHandle(current);
    if (cur !== value) {
      if (cur && cur.parentNode) {
        cur.parentNode.replaceChild(value, cur);
      } else {
        parent.insertBefore(value, before || null);
      }
    }
    return value;
  }

  // 5. 处理数组或类数组（与 `InsertValue` 分支顺序一致，避免把 bigint 等当类数组）
  if (Array.isArray(value)) {
    if (isHtmlDetailsElement(parent) && before == null) {
      return insertArrayIntoDetailsElement(parent, value, before);
    }
    return insertArrayAsDirectChildren(parent, value, current, before ?? null);
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !isDomNode(value) &&
    typeof (value as ArrayLike<unknown>).length === "number"
  ) {
    if (isHtmlDetailsElement(parent) && before == null) {
      return insertArrayIntoDetailsElement(
        parent,
        value as ArrayLike<InsertValue | null | undefined>,
        before,
      );
    }
    return insertArrayAsDirectChildren(
      parent,
      value as ArrayLike<InsertValue | null | undefined>,
      current,
      before ?? null,
    );
  }

  // 6. 其他情况转换为字符串
  const textNode = document.createTextNode(String(value));
  const cur6 = detachArrayInsertionHandle(current);
  if (cur6 && cur6.parentNode) {
    cur6.parentNode.replaceChild(textNode, cur6);
  } else {
    parent.insertBefore(textNode, before || null);
  }
  return textNode;
}
