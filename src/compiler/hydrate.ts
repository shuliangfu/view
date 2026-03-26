/**
 * 细粒度水合运行时：复用服务端 DOM、只绑 effect
 *
 * 与 createRoot 同一 fn(container) 约定：服务端 renderToString 出 HTML 后，
 * 客户端对同一容器调用 hydrate(fn, container)，按插入点顺序复用已有子节点，仅绑定 effect，不整树替换。
 *
 * @module @dreamer/view/runtime/hydrate
 */

import { KEY_VIEW_HYDRATE, KEY_VIEW_SSR_DOCUMENT } from "../constants.ts";
import { isVNodeLike } from "../dom/shared.ts";
import { createScopeWithDisposers, setCurrentScope } from "../effect.ts";
import { createEffect } from "../effect.ts";
import { getGlobal, setGlobal } from "../globals.ts";
import { removeCloak } from "../runtime-shared.ts";
import { isSignalGetter, unwrapSignalGetterValue } from "../signal.ts";
import type { Root, VNode } from "../types.ts";
import {
  type ActiveDocumentLike,
  setSSRShadowDocument,
} from "./active-document.ts";
import type { InsertValue } from "./insert.ts";
import { isMountFn } from "./mount-fn.ts";
import { mountVNodeTree } from "./vnode-mount.ts";

/** DOM Node.nodeType 常量，避免依赖全局 Node（Deno 等环境中可能未定义） */
const NODE_TYPE_ELEMENT = 1;
const NODE_TYPE_TEXT = 3;

/** 水合上下文：共享的深度优先迭代器 + 供 insert 委托的 hydrateInsert */
export type HydrateContext = {
  /** 深度优先消费下一个已有节点 */
  nextNode(): IteratorResult<Node>;
  /** 在 hydrate 模式下替代普通 insert：复用下一节点并绑 effect 或校验静态 */
  insert(parent: Node, value: InsertValue): void;
};

/**
 * 对 container 的直系子节点做深度优先遍历，依次 yield 每个节点（先自身，再递归子节点）。
 * 与编译产物 createElement/appendChild/insert 的调用顺序一致，用于按序复用服务端已有 DOM。
 * 使用 Array.from 避免 TS2488：NodeListOf 在部分 lib 下未声明 [Symbol.iterator]。
 */
function* walkDepthFirst(container: Node): Generator<Node> {
  const children = Array.from(container.childNodes);
  for (const child of children) {
    yield child;
    if (child.nodeType === NODE_TYPE_ELEMENT) {
      yield* walkDepthFirst(child);
    }
  }
}

/**
 * 将水合槽位 effect 中 getter 的求值结果转为可 `replaceChild` 的单个节点（或 DocumentFragment）。
 * 须覆盖 compileSource / `insertReactive` 同语义：VNode、标记 MountFn、零参壳函数；否则 Hybrid 水合后仅空文本，文档站等表现为整块空白。
 * 使用 nodeType 判断 Node，避免依赖全局 Node（Deno 等环境可能未定义）。
 *
 * @param value - 已解包 SignalRef / signal getter 后的展示值
 * @param doc - 真实 document（非迭代器代理），用于空占位文本节点
 */
function hydrateSlotValueToNode(value: unknown, doc: Document): Node {
  if (value == null) return doc.createTextNode("");
  if (typeof value === "string" || typeof value === "number") {
    return doc.createTextNode(String(value));
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "nodeType" in value &&
    typeof (value as Node).nodeType === "number"
  ) {
    return value as Node;
  }
  if (isVNodeLike(value)) {
    const frag = doc.createDocumentFragment();
    mountVNodeTree(frag, value as VNode);
    const ch = Array.from(frag.childNodes);
    if (ch.length === 0) return doc.createTextNode("");
    if (ch.length === 1) return ch[0] as Node;
    return frag as unknown as Node;
  }
  if (typeof value === "function" && isMountFn(value)) {
    const frag = doc.createDocumentFragment();
    (value as (p: Node) => void)(frag);
    const ch = Array.from(frag.childNodes);
    if (ch.length === 0) return doc.createTextNode("");
    if (ch.length === 1) return ch[0] as Node;
    return frag as unknown as Node;
  }
  /** 与 reactiveInsertNextFromGetterResult 对齐：剥一层零参非 signal 函数壳 */
  if (
    typeof value === "function" &&
    (value as () => unknown).length === 0 &&
    !isSignalGetter(value)
  ) {
    return hydrateSlotValueToNode((value as () => unknown)(), doc);
  }
  return doc.createTextNode("");
}

/**
 * 在父节点上用 value 对应的新节点替换 current，并返回「当前槽位节点」供下次 effect 更新。
 * 首次传入服务端已有的 slot，之后传入上次 effect 插入的节点，保证每次只替换一个槽位。
 */
function replaceSlot(
  parent: Node | null,
  current: Node,
  value: unknown,
  doc: Document,
): Node {
  const next = hydrateSlotValueToNode(unwrapSignalGetterValue(value), doc);
  if (!parent) return next;
  if (next !== current) {
    parent.replaceChild(next, current);
  }
  return next;
}

/**
 * 创建细粒度水合用的 document 代理：createElement/createTextNode 从迭代器取已有节点并返回，不新建。
 * createDocumentFragment 返回真实 DocumentFragment（编译产物中仅用于组件 children 等，不参与迭代器消费）。
 */
/** 水合时替代 document 的 createElement/createTextNode/createDocumentFragment，返回类型与 Document 兼容 */
function createHydrateDocument(
  iterator: Generator<Node, void, unknown>,
  realDocument: Document,
): {
  createElement: Document["createElement"];
  createTextNode: Document["createTextNode"];
  createDocumentFragment: Document["createDocumentFragment"];
} {
  return {
    createElement(tag: string, _options?: ElementCreationOptions) {
      const result = iterator.next();
      if (result.done) {
        throw new Error(
          `[hydrate] createElement("${tag}"): no more server nodes (iterator exhausted). ` +
            "请确认容器内 HTML 与 `renderToString(fn)` / `renderToStream` 使用同一 `fn(container)` 产出；手写 VNode SSR 须与客户端插入顺序一致。",
        );
      }
      const node = result.value;
      const wantTag = tag.toLowerCase();
      const gotTag = node.nodeName.toLowerCase();
      if (node.nodeType !== NODE_TYPE_ELEMENT || gotTag !== wantTag) {
        throw new Error(
          `[hydrate] createElement("${tag}"): mismatch (expected <${wantTag}>, got ${
            node.nodeType === NODE_TYPE_ELEMENT ? gotTag : "non-element"
          }). ` +
            "标签或结构与 SSR 不一致时无法水合；请对齐服务端与客户端同一套挂载函数。",
        );
      }
      return node as ReturnType<Document["createElement"]>;
    },
    createTextNode(_text: string) {
      const result = iterator.next();
      if (result.done) {
        throw new Error(
          "[hydrate] createTextNode: no more server nodes (iterator exhausted). " +
            "文本节点数量与 SSR 不一致；请检查条件渲染或手写 VNode 是否与 `renderToString` 一致。",
        );
      }
      const node = result.value;
      if (node.nodeType !== NODE_TYPE_TEXT) {
        throw new Error(
          `[hydrate] createTextNode: mismatch (got nodeType ${node.nodeType}).`,
        );
      }
      return node as Text;
    },
    createDocumentFragment(): DocumentFragment {
      return realDocument.createDocumentFragment();
    },
  };
}

/**
 * 在 hydrate 模式下执行 insert：从共享迭代器取「下一个已有节点」作为槽位；
 * 若 value 为 getter 则在该槽位上绑 effect，否则仅消费该节点（静态内容视为已匹配）。
 */
function createHydrateInsert(
  iterator: Generator<Node, void, unknown>,
  realDocument: Document,
): (parent: Node, value: InsertValue) => void {
  return function hydrateInsert(parent: Node, value: InsertValue): void {
    /**
     * 单参 `MountFn` 须与 `runtime.insertMount` 一致：直接 `(parent)=>void`，由内部 `createElement` 按 DFS 消费迭代器。
     * 若误走下方「零参 getter」分支会执行 `fn()` 无参调用，导致挂载异常或迭代错位（手写 `insert(el, markMountFn(...))` 等）。
     */
    if (
      typeof value === "function" &&
      (value as (p?: Node) => void).length === 1 &&
      isMountFn(value as unknown)
    ) {
      (value as (p: Node) => void)(parent);
      return;
    }

    const result = iterator.next();
    if (result.done) {
      throw new Error(
        "[hydrate] insert: no more server nodes (iterator exhausted). " +
          "插入点数量与 SSR 不一致；同一容器须用同一 `fn` 生成 HTML 再 `hydrate(fn, container)`。",
      );
    }
    const slot = result.value;

    if (typeof value === "function") {
      const getter = value as () => unknown;
      let current: Node = slot;
      createEffect(() => {
        const p = current.parentNode;
        current = replaceSlot(p, current, getter(), realDocument);
      });
      return;
    }

    // 静态内容：槽位已由服务端渲染，仅消费迭代器，可选做内容校验（此处从简，仅消费）
    void parent;
  };
}

/**
 * 细粒度水合入口：复用 container 内已有服务端 DOM，按插入点顺序与 fn(container) 对齐，只绑 effect，不整树替换。
 *
 * 约定：服务端用同一 fn 通过 renderToString(fn) 产出 HTML 注入到 container，
 * 客户端在包含该 HTML 的 container 上调用本函数，传入同一 fn。fn 内仍使用 document.createElement、
 * appendChild、insert；在 hydrate 期间 document 与 insert 由本模块替换为「按序复用已有节点 + 仅绑 effect」的实现。
 *
 * @param fn - 与 createRoot / renderToString 相同的 (container) => void
 * @param container - 已包含服务端 HTML 的 DOM 容器（通常为 root 根元素）
 * @returns Root 句柄，unmount 时清理所有在该次水合中登记的 effect
 */
export function hydrate(
  fn: (container: Element) => void,
  container: Element,
): Root {
  if (container == null) {
    throw new Error(
      "hydrate: container is null or undefined. Ensure the server-rendered root exists.",
    );
  }

  const realDocument = globalThis.document;
  if (!realDocument) {
    throw new Error("hydrate: document is not available.");
  }

  const iterator = walkDepthFirst(container);
  const hydrateDoc = createHydrateDocument(iterator, realDocument);
  const hydrateInsertFn = createHydrateInsert(iterator, realDocument);

  const context: HydrateContext = {
    nextNode: () => iterator.next(),
    insert: hydrateInsertFn,
  };

  const scope = createScopeWithDisposers();
  const prevHydrate = (globalThis as Record<string, unknown>)[KEY_VIEW_HYDRATE];
  /** 恢复 globalThis.document 用；浏览器上 document 常为只读，仅走影子 document */
  const prevDocument =
    (globalThis as typeof globalThis & { document: Document })
      .document;
  /** 与 renderToString 共用 KEY_VIEW_SSR_DOCUMENT：水合前保存，结束后还原，避免嵌套 SSR 丢失 */
  const prevShadowDoc = getGlobal<ActiveDocumentLike>(KEY_VIEW_SSR_DOCUMENT);

  const documentProxy = new Proxy(realDocument, {
    get(target, prop: string) {
      if (prop === "createElement") {
        return hydrateDoc.createElement.bind(hydrateDoc);
      }
      if (prop === "createTextNode") {
        return hydrateDoc.createTextNode.bind(hydrateDoc);
      }
      if (prop === "createDocumentFragment") {
        return hydrateDoc.createDocumentFragment.bind(hydrateDoc);
      }
      return Reflect.get(target, prop);
    },
  }) as Document;

  (globalThis as Record<string, unknown>)[KEY_VIEW_HYDRATE] = context;

  /** 浏览器无法给 window.document 赋值时，经 getActiveDocument() 读影子代理（同 ssr.ts） */
  let patchedGlobalDocument = false;
  try {
    (globalThis as typeof globalThis & { document: Document }).document =
      documentProxy;
    patchedGlobalDocument = true;
  } catch {
    setSSRShadowDocument(documentProxy as ActiveDocumentLike);
  }

  setCurrentScope(scope);
  try {
    fn(container);
    removeCloak(container);
  } finally {
    setCurrentScope(null);
    (globalThis as Record<string, unknown>)[KEY_VIEW_HYDRATE] = prevHydrate;
    if (patchedGlobalDocument) {
      try {
        (globalThis as typeof globalThis & { document: Document }).document =
          prevDocument;
      } catch {
        // 与赋值阶段一致：极少数环境恢复失败时忽略，避免掩盖 fn 内真实错误
      }
    } else if (prevShadowDoc !== undefined) {
      setGlobal(KEY_VIEW_SSR_DOCUMENT, prevShadowDoc);
    } else {
      setSSRShadowDocument(undefined);
    }
  }

  return {
    unmount() {
      scope.runDisposers();
      /** hydrate 的 unmount 仅回收 effect，不清空 DOM：服务端 HTML 应保留，仅停止响应式更新 */
    },
    container,
  };
}
