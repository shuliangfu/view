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
 * - DOM：文本同位改 `textContent`；元素同引用跳过；数组/类数组共用 `insertNonNullChildrenIntoFragment` 后整体 `replaceChild`
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
 * 将数组/类数组中的非空子项依次插入 `fragment`，供 `Array` 与 `ArrayLike` 分支共用，避免重复维护。
 */
function insertNonNullChildrenIntoFragment(
  fragment: DocumentFragment,
  items: ArrayLike<InsertValue | null | undefined>,
): void {
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const child = items[i];
    if (child != null) insert(fragment, child as InsertValue);
  }
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
    if (current && current.parentNode) {
      current.parentNode.removeChild(current);
    }
    return null;
  }

  // 3. 处理字符串和数字（复用 TEXT_NODE 时勿先 createTextNode，减少热路径分配）
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value);
    if (current) {
      if (current.nodeType === 3) {
        current.textContent = s;
        return current;
      }
      if (current.parentNode) {
        const text = document.createTextNode(s);
        current.parentNode.replaceChild(text, current);
        return text;
      }
    }
    const text = document.createTextNode(s);
    parent.insertBefore(text, before || null);
    return text;
  }

  // 4. 处理 DOM 节点
  if (isDomNode(value)) {
    if (current !== value) {
      if (current && current.parentNode) {
        current.parentNode.replaceChild(value, current);
      } else {
        parent.insertBefore(value, before || null);
      }
    }
    return value;
  }

  // 5. 处理数组或类数组（与 `InsertValue` 分支顺序一致，避免把 bigint 等当类数组）
  if (Array.isArray(value)) {
    const fragment = document.createDocumentFragment();
    insertNonNullChildrenIntoFragment(fragment, value);
    if (current && current.parentNode) {
      current.parentNode.replaceChild(fragment, current);
    } else {
      parent.insertBefore(fragment, before || null);
    }
    return fragment;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !isDomNode(value) &&
    typeof (value as ArrayLike<unknown>).length === "number"
  ) {
    const fragment = document.createDocumentFragment();
    insertNonNullChildrenIntoFragment(
      fragment,
      value as ArrayLike<InsertValue | null | undefined>,
    );
    if (current && current.parentNode) {
      current.parentNode.replaceChild(fragment, current);
    } else {
      parent.insertBefore(fragment, before || null);
    }
    return fragment;
  }

  // 6. 其他情况转换为字符串
  const textNode = document.createTextNode(String(value));
  if (current && current.parentNode) {
    current.parentNode.replaceChild(textNode, current);
  } else {
    parent.insertBefore(textNode, before || null);
  }
  return textNode;
}
