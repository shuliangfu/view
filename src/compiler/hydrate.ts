/**
 * 路线 C 运行时 — 细粒度水合（复用服务端 DOM、只绑 effect）
 *
 * 与 createRoot 同一 fn(container) 约定：服务端 renderToString 出 HTML 后，
 * 客户端对同一容器调用 hydrate(fn, container)，按插入点顺序复用已有子节点，仅绑定 effect，不整树替换。
 *
 * @module @dreamer/view/runtime/hydrate
 */

import { KEY_VIEW_HYDRATE } from "../constants.ts";
import { createScopeWithDisposers, setCurrentScope } from "../effect.ts";
import { createEffect } from "../effect.ts";
import { removeCloak } from "../runtime-shared.ts";
import type { InsertValue } from "./insert.ts";
import type { Root } from "../types.ts";

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
 * 将 value 转为真实 DOM 节点（用于 effect 内更新槽位）。
 * 始终使用全局 document，避免在 effect 中误用 hydrate 用的伪 document。
 * 使用 nodeType 判断 Node，避免依赖全局 Node（Deno 等环境可能未定义）。
 */
function valueToNode(value: InsertValue, doc: Document): Node {
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
  return doc.createTextNode("");
}

/**
 * 在父节点上用 value 对应的新节点替换 current，并返回「当前槽位节点」供下次 effect 更新。
 * 首次传入服务端已有的 slot，之后传入上次 effect 插入的节点，保证每次只替换一个槽位。
 */
function replaceSlot(
  parent: Node | null,
  current: Node,
  value: InsertValue,
  doc: Document,
): Node {
  const next = valueToNode(value, doc);
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
          `[hydrate] createElement("${tag}"): no more server nodes (iterator exhausted).`,
        );
      }
      const node = result.value;
      const wantTag = tag.toLowerCase();
      const gotTag = node.nodeName.toLowerCase();
      if (node.nodeType !== NODE_TYPE_ELEMENT || gotTag !== wantTag) {
        throw new Error(
          `[hydrate] createElement("${tag}"): mismatch (got ${
            node.nodeType === NODE_TYPE_ELEMENT ? gotTag : "non-element"
          }).`,
        );
      }
      return node as ReturnType<Document["createElement"]>;
    },
    createTextNode(_text: string) {
      const result = iterator.next();
      if (result.done) {
        throw new Error(
          "[hydrate] createTextNode: no more server nodes (iterator exhausted).",
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
    const result = iterator.next();
    if (result.done) {
      throw new Error(
        "[hydrate] insert: no more server nodes (iterator exhausted).",
      );
    }
    const slot = result.value;

    if (typeof value === "function") {
      const getter = value;
      let current: Node = slot;
      createEffect(() => {
        const parent = current.parentNode;
        current = replaceSlot(parent, current, getter(), realDocument);
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
  const prevDocument =
    (globalThis as typeof globalThis & { document: Document })
      .document;

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
  (globalThis as typeof globalThis & { document: Document }).document =
    documentProxy;

  setCurrentScope(scope);
  try {
    fn(container);
    removeCloak(container);
  } finally {
    setCurrentScope(null);
    (globalThis as Record<string, unknown>)[KEY_VIEW_HYDRATE] = prevHydrate;
    (globalThis as typeof globalThis & { document: Document }).document =
      prevDocument;
  }

  return {
    unmount() {
      scope.runDisposers();
    },
    container,
  };
}
