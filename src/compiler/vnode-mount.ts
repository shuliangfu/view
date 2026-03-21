/**
 * VNode → DOM 展开：normalizeChildren 与递归挂载仅在此模块使用，主包 `runtime.ts` 不再直接依赖
 * `dom/element` 的 normalizeChildren（3.1 迁出主文件职责）。嵌套响应式子项经 vnode-insert-bridge
 * 回调主 `insertReactive`。
 *
 * @module @dreamer/view/runtime/vnode-mount
 */

import { CONTEXT_SCOPE_TYPE, popContext, pushContext } from "../context.ts";
import { type ChildItem, normalizeChildren } from "../dom/element.ts";
import { isEmptyChild, isFragment, isVNodeLike } from "../dom/shared.ts";
import { isSignalGetter } from "../signal.ts";
import type { VNode } from "../types.ts";
import {
  type ActiveDocumentLike,
  getActiveDocument,
} from "./active-document.ts";
import type { InsertParent, InsertValue } from "./insert.ts";
import { scheduleFunctionRef } from "./ref-dom.ts";
import { valueToNode } from "./to-node.ts";
import {
  insertReactiveForVnodeSubtree,
  type ReactiveInsertNext,
} from "./vnode-insert-bridge.ts";

const append = (p: InsertParent, child: Node): void => {
  (p as { appendChild(n: unknown): unknown }).appendChild(child);
};

/** SVG 命名空间 URI；用于 createElementNS 创建可正确渲染的 SVG 元素 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** 需在 SVG 命名空间下创建的元素（createElement('svg') 在脚本中会变成 HTML 元素且不渲染图形） */
const SVG_TAG_NAMES = new Set([
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "defs",
  "g",
  "use",
  "clipPath",
  "pattern",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "text",
  "tspan",
  "image",
  "title",
  "desc",
]);

/**
 * 创建本征元素节点：SVG 系标签用 createElementNS 以保证在浏览器中正确渲染。
 * SSR 伪 document 无 createElementNS 时回退到 createElement。
 */
function createElementForIntrinsic(
  doc: ActiveDocumentLike,
  tagName: string,
): Element {
  const tag = tagName.toLowerCase();
  if (SVG_TAG_NAMES.has(tag)) {
    const d = doc as Document & {
      createElementNS?(uri: string, name: string): Element;
    };
    if (typeof d.createElementNS === "function") {
      return d.createElementNS(SVG_NS, tag) as Element;
    }
  }
  return doc.createElement(tagName) as Element;
}

/** 子树内部叶子转 DOM 节点（复用 to-node 共享逻辑，2.1 收敛） */
function toDomLeafNode(value: InsertValue): Node {
  return valueToNode(
    value as import("./to-node.ts").ValueToNodeInput,
    getActiveDocument(),
  );
}

/**
 * 将 VNode 上常见 DOM 属性写到元素（className、布尔 attribute、on* 事件）。
 * 对象型 style、子节点 children 等由 normalizeChildren / 子树挂载负责。
 *
 * @param el - 目标元素
 * @param props - VNode.props
 */
function applyIntrinsicVNodeProps(
  el: Element,
  props: Record<string, unknown>,
): void {
  for (const key of Object.keys(props)) {
    if (key === "children" || key === "key") continue;
    /** ref 在 append 之后由 bindIntrinsicRef 处理（与 compileSource 产物一致，且需 scheduleFunctionRef 支持离屏子树） */
    if (key === "ref") continue;
    const val = props[key];
    if (val == null) continue;
    if (typeof val === "function" && /^on[A-Z]/.test(key)) {
      const name = key.slice(2).toLowerCase();
      el.addEventListener(name, val as EventListener);
      continue;
    }
    if (typeof val === "object" && val !== null) continue;
    if (typeof val === "function") continue;
    if (val === true) {
      el.setAttribute(key, "");
      continue;
    }
    if (val === false) continue;
    if (key === "className") el.setAttribute("class", String(val));
    else if (key === "class") el.setAttribute("class", String(val));
    else if (key === "htmlFor") el.setAttribute("for", String(val));
    else el.setAttribute(key, String(val));
  }
}

/**
 * 为「本征 DOM」VNode 绑定 ref：`react-jsx` 运行时路径不经 compileSource，`ref` 不能仅靠 applyIntrinsicProps。
 *
 * - 函数 ref：交给 `scheduleFunctionRef`，与编译器路径一致。
 * - 对象 ref（含 `createRef()` 的 `{ get/set current }`）：写回 `.current`，卸载时机由节点摘除与 scheduleFunctionRef 行为覆盖。
 *
 * @param el - 已创建且即将或已经挂到父节点下的元素
 * @param props - VNode.props（读取 `ref`）
 */
function bindIntrinsicRef(el: Element, props: Record<string, unknown>): void {
  const refVal = props.ref;
  if (refVal == null) return;
  if (typeof refVal === "function") {
    scheduleFunctionRef(el, refVal as (node: Element | null) => void);
    return;
  }
  if (typeof refVal === "object" && "current" in refVal) {
    const holder = refVal as { current: Element | null };
    scheduleFunctionRef(el, (n) => {
      holder.current = n;
    });
  }
}

/**
 * 将 normalizeChildren 的一项挂到 parent：VNode 递归展开；函数 / signal getter 走 insertReactive。
 *
 * @param parent - 父 DOM 节点
 * @param item - 子项（VNode、getter 或原始值）
 */
function mountChildItemForVnode(parent: Node, item: ChildItem): void {
  /**
   * 单参 `(parent)=>void` 为编译器传入的挂载函数（Form、Provider、自定义组件子树等）。
   * 经 `insertReactiveForVnodeSubtree` 包一层，与 `runtime.insertReactive` 的 MountFn 分支一致：
   * 依赖变更时先 onCleanup 再重跑挂载，避免 v-if/signal 在「仅同步直调」时与子树 DOM 脱节（如 dweb 根树下深层布局）。
   * 不可当作无参 getter 调用，否则子树丢失。
   */
  if (
    typeof item === "function" &&
    (item as (p?: unknown) => unknown).length === 1 &&
    !isSignalGetter(item)
  ) {
    const mountFn = item as (p: Node) => void;
    insertReactiveForVnodeSubtree(parent, () => mountFn);
    return;
  }
  if (typeof item === "function" || isSignalGetter(item)) {
    const rawGetter = item as () => unknown;
    insertReactiveForVnodeSubtree(parent, () => {
      const x = rawGetter();
      if (isVNodeLike(x)) return x as ReactiveInsertNext;
      if (isEmptyChild(x)) return "";
      if (
        typeof x === "object" &&
        x !== null &&
        "nodeType" in x &&
        typeof (x as Node).nodeType === "number"
      ) {
        return x as Node;
      }
      return String(x) as ReactiveInsertNext;
    });
    return;
  }
  if (isVNodeLike(item)) {
    mountVNodeTree(parent, item as VNode);
    return;
  }
  append(parent, toDomLeafNode(item as unknown as InsertValue));
}

/**
 * 将一棵 VNode 树挂载到 parent 末尾（由外层 insertReactive 负责清理兄弟节点）。
 * 用于展开文本/元素/Fragment（含 Fragment 内 signal getter 子节点）。
 *
 * @param parent - 父 DOM 节点
 * @param vnode - 虚拟节点或可被 toDomLeafNode 接受的值
 */
export function mountVNodeTree(parent: Node, vnode: unknown): void {
  if (isEmptyChild(vnode)) return;
  if (!isVNodeLike(vnode)) {
    append(parent, toDomLeafNode(vnode as InsertValue));
    return;
  }
  const v = vnode as VNode;
  const doc = getActiveDocument();
  if (v.type === "#text") {
    append(
      parent,
      doc.createTextNode(
        String((v.props as { nodeValue?: unknown })?.nodeValue ?? ""),
      ) as Node,
    );
    return;
  }
  if (v.type === CONTEXT_SCOPE_TYPE) {
    const p = (v.props ?? {}) as {
      id: symbol;
      value: unknown;
      children?: unknown;
    };
    pushContext(p.id, p.value);
    try {
      const ch = p.children;
      if (
        typeof ch === "function" &&
        (ch as (n?: unknown) => unknown).length === 1
      ) {
        (ch as (parent: Node) => void)(parent);
      } else if (
        typeof ch === "object" &&
        ch !== null &&
        typeof (ch as Node).nodeType === "number" &&
        (ch as Node).nodeType === 11
      ) {
        parent.appendChild(ch as DocumentFragment);
      } else {
        const items = normalizeChildren(ch);
        for (let i = 0; i < items.length; i++) {
          mountChildItemForVnode(parent, items[i]!);
        }
      }
    } finally {
      popContext(p.id);
    }
    return;
  }
  if (isFragment(v)) {
    const raw = (v.props as { children?: unknown })?.children ??
      (v as { children?: unknown }).children;
    if (typeof raw === "function" || isSignalGetter(raw)) {
      const g = raw as () => unknown;
      insertReactiveForVnodeSubtree(parent, () => {
        const inner = g();
        if (isVNodeLike(inner)) return inner as ReactiveInsertNext;
        if (isEmptyChild(inner)) return "";
        if (
          typeof inner === "object" &&
          inner !== null &&
          "nodeType" in inner &&
          typeof (inner as Node).nodeType === "number"
        ) {
          return inner as Node;
        }
        return String(inner) as ReactiveInsertNext;
      });
      return;
    }
    const items = normalizeChildren(raw);
    for (let i = 0; i < items.length; i++) {
      mountChildItemForVnode(parent, items[i]!);
    }
    return;
  }
  if (typeof v.type === "string") {
    /** 真实 DOM 为 Element；SVG 系须用 createElementNS 才能正确渲染，SSR 伪 document 无 createElementNS 时回退 createElement */
    const el = createElementForIntrinsic(doc, v.type);
    const p = (v.props ?? {}) as Record<string, unknown>;
    applyIntrinsicVNodeProps(el, p);
    const items = normalizeChildren(p.children);
    for (let i = 0; i < items.length; i++) {
      mountChildItemForVnode(el as Node, items[i]!);
    }
    append(parent, el as Node);
    bindIntrinsicRef(el as Element, p);
    return;
  }
  if (typeof v.type === "function") {
    const p = (v.props ?? {}) as Record<string, unknown>;
    const out = (v.type as (props: Record<string, unknown>) => unknown)(p);
    /**
     * 编译产物：组件经 compileSource 后返回单参 MountFn `(parent) => void`。
     * 不再在此同步直调：改为走 `insertReactiveForVnodeSubtree`，使组件内 v-if / signal 与独立 effect 对齐，
     * 避免在「根 insert + VNode 展开」场景下出现状态已 false 而 DOM 仍残留等问题。
     */
    if (typeof out === "function" && (out as (p: Node) => void).length === 1) {
      const mountFn = out as (parent: Node) => void;
      insertReactiveForVnodeSubtree(parent, () => mountFn);
      return;
    }
    /**
     * 手写/库组件返回 `() => VNode`（零参 getter，与 ui-view Form 等一致）：不能当作 MountFn，也不能交给
     * toDomLeafNode（会变成空文本）。与 Fragment 的 children 为函数相同，走响应式子树展开。
     */
    if (typeof out === "function") {
      const fn = out as () => unknown;
      if (fn.length === 0) {
        insertReactiveForVnodeSubtree(parent, () => {
          const inner = fn();
          if (isVNodeLike(inner)) return inner as ReactiveInsertNext;
          if (isEmptyChild(inner)) return "";
          if (
            typeof inner === "object" &&
            inner !== null &&
            "nodeType" in inner &&
            typeof (inner as Node).nodeType === "number"
          ) {
            return inner as Node;
          }
          return String(inner) as ReactiveInsertNext;
        });
        return;
      }
    }
    if (Array.isArray(out)) {
      for (let i = 0; i < out.length; i++) {
        mountVNodeTree(parent, out[i]);
      }
    } else {
      mountVNodeTree(parent, out);
    }
  }
}
