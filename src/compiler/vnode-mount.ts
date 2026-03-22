/**
 * VNode → DOM 展开：normalizeChildren 与递归挂载仅在此模块使用，主包 `runtime.ts` 不再直接依赖
 * `dom/element` 的 normalizeChildren（3.1 迁出主文件职责）。嵌套响应式子项经 vnode-insert-bridge
 * 回调主 `insertReactive`。
 *
 * **手写 jsx() VNode（不经 compileSource）** 在本模块对齐的内置指令：
 * vIf、vElseIf、vElse（**根级**与 **Fragment 兄弟链**：**vIf/vElseIf** 含 SignalRef/无参 getter/signal getter 时整链 **insertReactive**）、
 * vCloak（data-view-cloak）、vOnce（子树 untrack）。
 * **bindIntrinsicReactiveDomProps**：受控 value/checked、布尔 DOM、**style**（含响应式对象）。
 * **自定义指令**（`registerDirective`、如 vFocus）在元素 `append` 且 `ref` 绑定之后调用
 * `directive.applyDirectives`，与 compileSource 产物顺序一致（与 `insert` 存在模块环，运行时由
 * Deno/打包器按已存 `isDirectiveProp` 方式解析）。
 *
 * @module @dreamer/view/runtime/vnode-mount
 */

import { CONTEXT_SCOPE_TYPE, popContext, pushContext } from "../context.ts";
import {
  warnIfMultiArgControlledProp,
  warnIfNestedStyleObject,
} from "../dev-runtime-warn.ts";
import {
  applyDirectives,
  isDirectiveProp,
  registerDirectiveUnmount,
} from "../directive.ts";
import { type ChildItem, normalizeChildren } from "../dom/element.ts";
import { isEmptyChild, isFragment, isVNodeLike } from "../dom/shared.ts";
import { createEffect, untrack } from "../effect.ts";
import {
  isSignalGetter,
  isSignalRef,
  unwrapSignalGetterValue,
} from "../signal.ts";
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

/**
 * 本征元素 VNode 上 vIf/v-if 是否应挂载子树（与 directive 模块中 getVIfValue 语义一致）。
 * 不直接 import directive 模块，避免 directive → insert → vnode-mount → directive 的循环依赖。
 *
 * @param props - VNode.props
 * @returns 为 false 时不应创建 DOM（与 compileSource 的 v-if 分支一致）
 */
function resolveVIfForIntrinsicMount(props: Record<string, unknown>): boolean {
  if (!("vIf" in props) && !("v-if" in props)) return true;
  const raw = props["vIf"] ?? props["v-if"];
  if (raw == null) return true;
  if (typeof raw === "function") {
    return Boolean((raw as () => unknown)());
  }
  if (isSignalGetter(raw)) {
    return Boolean((raw as () => unknown)());
  }
  return Boolean(raw);
}

/**
 * v-else-if 条件（与 directive.getVElseIfValue 一致，避免依赖 directive→insert 环）。
 *
 * @param props - VNode.props
 */
function resolveVElseIfForIntrinsicMount(
  props: Record<string, unknown>,
): boolean {
  const raw = props["vElseIf"] ?? props["v-else-if"];
  if (raw == null) return false;
  if (typeof raw === "function") {
    return Boolean((raw as () => unknown)());
  }
  if (isSignalGetter(raw)) {
    return Boolean((raw as () => unknown)());
  }
  return Boolean(raw);
}

/**
 * 是否带 v-once（无值亦视为启用，与编译器一致；显式 false 则关闭）。
 *
 * @param props - VNode.props
 */
function hasVOnceInProps(props: Record<string, unknown>): boolean {
  if ("vOnce" in props && props["vOnce"] === false) return false;
  if ("v-once" in props && props["v-once"] === false) return false;
  return "vOnce" in props || "v-once" in props;
}

/**
 * 去掉 v-if / v-else-if / v-else 相关 prop，供内层 `mountVNodeTree` 不再按链规则二次解析。
 *
 * @param vn - 本征 VNode
 * @returns 浅拷贝 props 后的 VNode
 */
function intrinsicVnodeStripIfChainProps(vn: VNode): VNode {
  const p = { ...(vn.props ?? {}) } as Record<string, unknown>;
  delete p.vIf;
  delete p["v-if"];
  delete p.vElseIf;
  delete p["v-else-if"];
  delete p.vElse;
  delete p["v-else"];
  return { ...vn, props: p };
}

/**
 * v-cloak：与 compileSource 一致写 data-view-cloak，供首屏 CSS 隐藏与 createRoot 后 removeCloak。
 *
 * @param el - 目标元素
 * @param props - VNode.props
 */
function applyIntrinsicVCloak(
  el: Element,
  props: Record<string, unknown>,
): void {
  if (!("vCloak" in props) && !("v-cloak" in props)) return;
  const raw = props["vCloak"] ?? props["v-cloak"];
  if (raw === false) return;
  el.setAttribute("data-view-cloak", "");
}

/**
 * Fragment 规范化子项列表：处理 vIf / vElseIf / vElse 兄弟链（与 compileSource 单槽语义对齐）。
 *
 * @param parent - 父节点
 * @param items - normalizeChildren 结果
 */
function mountNormalizedChildrenWithIfChain(
  parent: Node,
  items: ChildItem[],
): void {
  let chain: { matched: boolean } | null = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!isVNodeLike(item)) {
      chain = null;
      mountChildItemForVnode(parent, item);
      continue;
    }
    const vn = item as VNode;
    const p = (vn.props ?? {}) as Record<string, unknown>;
    const hasIf = "vIf" in p || "v-if" in p;
    const hasElseIf = "vElseIf" in p || "v-else-if" in p;
    const hasElse = "vElse" in p || "v-else" in p;

    if (!hasIf && !hasElseIf && !hasElse) {
      chain = null;
      mountVNodeTree(parent, vn);
      continue;
    }

    if (hasIf) {
      const chainIdx = collectIfChainSiblingIndices(items, i);
      if (ifChainHasReactiveCondition(items, chainIdx)) {
        insertReactiveForVnodeSubtree(parent, () => {
          const picked = pickWinningVNodeForIfChain(items, chainIdx);
          if (picked === "") return "";
          return picked;
        });
        i = chainIdx[chainIdx.length - 1]!;
        continue;
      }
      chain = { matched: false };
      if (resolveVIfForIntrinsicMount(p)) {
        mountVNodeTree(parent, vn);
        chain.matched = true;
      }
      continue;
    }

    if (hasElseIf) {
      if (chain == null) continue;
      if (chain.matched) continue;
      if (resolveVElseIfForIntrinsicMount(p)) {
        mountVNodeTree(parent, vn, { allowStructuralElseBranch: true });
        chain.matched = true;
      }
      continue;
    }

    if (hasElse) {
      if (chain == null) continue;
      if (chain.matched) continue;
      mountVNodeTree(parent, vn, { allowStructuralElseBranch: true });
      chain.matched = true;
      continue;
    }
  }
}

/** mountVNodeTree 可选配置：供 vElse/vElseIf 在兄弟链内挂载（孤节点仍跳过） */
export type MountVNodeTreeOptions = {
  allowStructuralElseBranch?: boolean;
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
    /** 指令类 prop 不写真实 DOM 属性（与 directive.isDirectiveProp 对齐） */
    if (isDirectiveProp(key)) continue;
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
 * 与 compileSource 一致：从 `value`/`checked`/布尔 prop 的「活」值读当前展示用值（signal、无参 getter、SignalRef）。
 *
 * @param val - props 上的原始值
 */
function readLiveControlledValue(val: unknown): unknown {
  if (typeof val === "function") {
    if (isSignalGetter(val)) {
      return (val as () => unknown)();
    }
    const f = val as (...args: unknown[]) => unknown;
    if (f.length === 0) {
      return f();
    }
    return undefined;
  }
  return unwrapSignalGetterValue(val);
}

/**
 * 是否应对该 prop 建立 `createEffect` 同步（applyIntrinsicVNodeProps 已跳过 function / 部分 object）。
 *
 * @param val - props 原始值
 */
function needsReactiveDomProp(val: unknown): boolean {
  if (val == null) return false;
  if (isSignalRef(val) || isSignalGetter(val)) return true;
  if (typeof val === "function") {
    const f = val as (...args: unknown[]) => unknown;
    return f.length === 0;
  }
  return false;
}

/**
 * 在 effect / insertReactive getter 内读 vIf 条件，响应式表达式走 `readLiveControlledValue`。
 *
 * @param raw - `vIf` / `v-if` 的原始值
 */
function readVIfConditionTracked(raw: unknown): boolean {
  if (raw == null) return true;
  if (needsReactiveDomProp(raw)) {
    return Boolean(readLiveControlledValue(raw));
  }
  if (typeof raw === "function") {
    return Boolean((raw as () => unknown)());
  }
  if (isSignalGetter(raw)) {
    return Boolean((raw as () => unknown)());
  }
  return Boolean(raw);
}

/**
 * 在 effect / insertReactive getter 内读 v-else-if 条件。
 *
 * @param raw - `vElseIf` / `v-else-if` 的原始值
 */
function readElseIfConditionTracked(raw: unknown): boolean {
  if (raw == null) return false;
  if (needsReactiveDomProp(raw)) {
    return Boolean(readLiveControlledValue(raw));
  }
  if (typeof raw === "function") {
    return Boolean((raw as () => unknown)());
  }
  if (isSignalGetter(raw)) {
    return Boolean((raw as () => unknown)());
  }
  return Boolean(raw);
}

/**
 * 从带 `vIf` 的项起，收集同一兄弟链上的 `vElseIf`/`vElse` 子项下标（遇新的 `vIf` 或非链节点则结束）。
 *
 * @param items - `normalizeChildren` 结果
 * @param startIfIndex - 当前项下标（须为链头 `vIf`）
 */
function collectIfChainSiblingIndices(
  items: ChildItem[],
  startIfIndex: number,
): number[] {
  const indices = [startIfIndex];
  for (let j = startIfIndex + 1; j < items.length; j++) {
    const item = items[j]!;
    if (!isVNodeLike(item)) break;
    const p = ((item as VNode).props ?? {}) as Record<string, unknown>;
    const hasIf = "vIf" in p || "v-if" in p;
    if (hasIf) break;
    const hasElseIf = "vElseIf" in p || "v-else-if" in p;
    const hasElse = "vElse" in p || "v-else" in p;
    if (hasElseIf || hasElse) indices.push(j);
    else break;
  }
  return indices;
}

/**
 * 兄弟链中是否至少有一段条件依赖 signal / 无参 getter（需整链包 `insertReactive`）。
 *
 * @param items - 子项列表
 * @param indices - `collectIfChainSiblingIndices` 返回值
 */
function ifChainHasReactiveCondition(
  items: ChildItem[],
  indices: number[],
): boolean {
  for (const idx of indices) {
    const p = ((items[idx] as VNode).props ?? {}) as Record<string, unknown>;
    const hasIf = "vIf" in p || "v-if" in p;
    const hasElseIf = "vElseIf" in p || "v-else-if" in p;
    if (hasIf) {
      const raw = p["vIf"] ?? p["v-if"];
      if (needsReactiveDomProp(raw)) return true;
    }
    if (hasElseIf) {
      const raw = p["vElseIf"] ?? p["v-else-if"];
      if (needsReactiveDomProp(raw)) return true;
    }
  }
  return false;
}

/**
 * 按当前各条件求值，选出应挂载的一条分支（已剥离链上指令 prop）。
 *
 * @param items - 子项列表
 * @param indices - 链覆盖的下标
 */
function pickWinningVNodeForIfChain(
  items: ChildItem[],
  indices: number[],
): VNode | "" {
  const head = items[indices[0]!] as VNode;
  const hp = (head.props ?? {}) as Record<string, unknown>;
  const vifRaw = hp["vIf"] ?? hp["v-if"];
  if (readVIfConditionTracked(vifRaw)) {
    return intrinsicVnodeStripIfChainProps(head);
  }
  for (let k = 1; k < indices.length; k++) {
    const vn = items[indices[k]!] as VNode;
    const p = (vn.props ?? {}) as Record<string, unknown>;
    const hasElseIf = "vElseIf" in p || "v-else-if" in p;
    const hasElse = "vElse" in p || "v-else" in p;
    if (hasElseIf) {
      const raw = p["vElseIf"] ?? p["v-else-if"];
      if (readElseIfConditionTracked(raw)) {
        return intrinsicVnodeStripIfChainProps(vn);
      }
      continue;
    }
    if (hasElse) {
      return intrinsicVnodeStripIfChainProps(vn);
    }
  }
  return "";
}

/** 与 jsx-compiler BOOLEAN_ATTRS 对齐：布尔 DOM 属性，无参函数/signal 时需 effect 同步 */
const BOOLEAN_REACTIVE_PROP_NAMES = new Set([
  "disabled",
  "hidden",
  "readOnly",
  "readonly",
  "selected",
  "multiple",
  "autofocus",
  "contentEditable",
  "contenteditable",
  "draggable",
  "spellCheck",
  "spellcheck",
]);

/**
 * 将 JSX 布尔 prop 名映射到 DOM 对象上的属性名（与 compileSource 一致）。
 *
 * @param name - JSX 中的 prop 名
 */
function booleanPropToDomKey(name: string): string {
  if (name === "readonly") return "readOnly";
  if (name === "contenteditable") return "contentEditable";
  if (name === "spellcheck") return "spellCheck";
  return name;
}

/**
 * 手写 jsx-runtime 路径：补齐 compileSource 在构建期做的受控表单、style 对象、布尔 signal/无参函数绑定。
 * 在 `applyIntrinsicVNodeProps` 之后调用；依赖元素已带上静态 `type` 等 attribute。
 *
 * @param el - 本征元素
 * @param props - VNode.props
 * @param inOnceSubtree - 是否在 v-once 子树内（与编译器一致：effect 内 untrack 写 DOM）
 */
function bindIntrinsicReactiveDomProps(
  el: Element,
  props: Record<string, unknown>,
  inOnceSubtree: boolean,
): void {
  const schedule = (sync: () => void) => {
    if (inOnceSubtree) {
      createEffect(() => {
        untrack(sync);
      });
    } else {
      createEffect(sync);
    }
  };

  const tag = el.tagName.toLowerCase();

  const st = props.style;
  const styleValueIsDomNode = typeof globalThis.Node === "function" &&
    st != null &&
    typeof st === "object" &&
    st instanceof globalThis.Node;
  /**
   * 响应式 style：每轮用新对象覆盖（先移除 style 属性），避免上一轮 `Object.assign` 留下的键在对象变窄后仍残留。
   */
  if (needsReactiveDomProp(st)) {
    schedule(() => {
      const o = readLiveControlledValue(st);
      if (o == null || typeof o !== "object" || Array.isArray(o)) return;
      if (
        typeof globalThis.Node === "function" && o instanceof globalThis.Node
      ) {
        return;
      }
      warnIfNestedStyleObject(tag, o as object);
      const h = el as HTMLElement;
      h.removeAttribute("style");
      try {
        Object.assign(h.style, o as Record<string, string>);
      } catch {
        /* 忽略非法 style 对象 */
      }
    });
  } else if (
    st != null && typeof st === "object" && !Array.isArray(st) &&
    !styleValueIsDomNode
  ) {
    warnIfNestedStyleObject(tag, st as object);
    try {
      Object.assign((el as HTMLElement).style, st as Record<string, string>);
    } catch {
      /* 忽略非法 style 对象 */
    }
  }

  if ("value" in props) {
    const val = props.value;
    if (tag === "input" || tag === "textarea" || tag === "select") {
      warnIfMultiArgControlledProp(tag, "value", val, isSignalGetter);
    }
    if (
      needsReactiveDomProp(val) &&
      (tag === "input" || tag === "textarea" || tag === "select")
    ) {
      schedule(() => {
        const v = readLiveControlledValue(val);
        (el as HTMLInputElement).value = String(v ?? "");
      });
    }
  }

  if ("checked" in props) {
    const val = props.checked;
    if (tag === "input") {
      warnIfMultiArgControlledProp(tag, "checked", val, isSignalGetter);
    }
    if (needsReactiveDomProp(val) && tag === "input") {
      const inp = el as HTMLInputElement;
      const tp = (inp.getAttribute("type") || "text").toLowerCase();
      if (tp === "checkbox" || tp === "radio") {
        schedule(() => {
          const v = readLiveControlledValue(val);
          inp.checked = Boolean(v);
        });
      }
    }
  }

  for (const name of BOOLEAN_REACTIVE_PROP_NAMES) {
    if (!(name in props)) continue;
    const val = props[name];
    warnIfMultiArgControlledProp(tag, name, val, isSignalGetter);
    if (!needsReactiveDomProp(val)) continue;
    const domKey = booleanPropToDomKey(name);
    schedule(() => {
      const v = readLiveControlledValue(val);
      (el as unknown as Record<string, boolean>)[domKey] = Boolean(v);
    });
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
 * @param options - 可选；vElse/vElseIf 仅在 Fragment 兄弟链内需 `allowStructuralElseBranch`
 */
export function mountVNodeTree(
  parent: Node,
  vnode: unknown,
  options?: MountVNodeTreeOptions,
): void {
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
        mountNormalizedChildrenWithIfChain(parent, items);
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
    mountNormalizedChildrenWithIfChain(parent, items);
    return;
  }
  if (typeof v.type === "string") {
    const p = (v.props ?? {}) as Record<string, unknown>;
    const hasIfKey = "vIf" in p || "v-if" in p;
    const hasElseIfOnly = ("vElseIf" in p || "v-else-if" in p) && !hasIfKey;
    const hasElseOnly = ("vElse" in p || "v-else" in p) && !hasIfKey;
    /**
     * vElse / vElseIf 无对应 vIf 时属兄弟链节点：须由 Fragment 的 mountNormalizedChildrenWithIfChain 传入
     * allowStructuralElseBranch；孤节点跳过避免误渲染。
     */
    if (
      (hasElseIfOnly || hasElseOnly) && !options?.allowStructuralElseBranch
    ) {
      return;
    }
    const vifRaw = p["vIf"] ?? p["v-if"];
    const hasReactiveVIf = ("vIf" in p || "v-if" in p) &&
      needsReactiveDomProp(vifRaw);
    /**
     * 根级本征：vIf 为 SignalRef / 无参函数 / signal getter 时与编译器一致包 insertReactive，
     * 条件变化时卸载或重挂子树（内层 VNode 去掉 vIf 以免递归）。
     */
    if (hasReactiveVIf) {
      insertReactiveForVnodeSubtree(parent, () => {
        if (!readLiveControlledValue(vifRaw)) return "";
        return intrinsicVnodeStripIfChainProps(v);
      });
      return;
    }
    /** 与 compileSource 一致：vIf 为假时不挂载本节点及子树（Hybrid SSR 避免闪屏） */
    if (!resolveVIfForIntrinsicMount(p)) {
      return;
    }
    /** 真实 DOM 为 Element；SVG 系须用 createElementNS 才能正确渲染，SSR 伪 document 无 createElementNS 时回退 createElement */
    const el = createElementForIntrinsic(doc, v.type);
    applyIntrinsicVNodeProps(el, p);
    const inOnce = hasVOnceInProps(p);
    /**
     * `<select>` 的受控 value 须在 option 子节点挂入后再同步：`createEffect` 首次会立即执行，
     * 若先于 mountChildren 设 `select.value`，无匹配 option 时浏览器会回退到首项，导致 Signal 初值丢失。
     */
    const deferReactiveDomProps = String(v.type).toLowerCase() === "select";
    if (!deferReactiveDomProps) {
      /** 手写 jsx-runtime：受控 value/checked、style 对象、布尔 signal/无参函数，与 compileSource 对齐 */
      bindIntrinsicReactiveDomProps(el as Element, p, inOnce);
    }
    applyIntrinsicVCloak(el, p);
    const mountChildren = (): void => {
      const items = normalizeChildren(p.children);
      mountNormalizedChildrenWithIfChain(el as Node, items);
    };
    if (inOnce) {
      untrack(mountChildren);
    } else {
      mountChildren();
    }
    if (deferReactiveDomProps) {
      bindIntrinsicReactiveDomProps(el as Element, p, inOnce);
    }
    append(parent, el as Node);
    bindIntrinsicRef(el as Element, p);
    /** 与 compileSource 一致：自定义指令在 ref 之后、由 applyDirectives + createEffect 驱动 */
    applyDirectives(
      el as Element,
      p,
      createEffect,
      registerDirectiveUnmount,
    );
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
