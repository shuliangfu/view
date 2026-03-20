/**
 * 路线 C SSR — 服务端用「伪 DOM」执行编译后 fn(container)，再序列化为 HTML。
 * 与客户端同一套编译产物：服务端优先替换 globalThis.document；浏览器不可写时由 active-document 影子键提供伪 document，
 * 执行 fn(container) 后对 container 做 innerHTML 序列化。
 *
 * @module @dreamer/view/runtime/ssr-document
 */

import { escapeForAttr, escapeForText } from "../escape.ts";

/** 自闭合标签，不生成闭合标签 */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** SSR 序列化节点：元素或文本 */
export type SSRNode = SSRElement | SSRTextNode;

/** 文本节点：仅序列化为转义文本 */
export class SSRTextNode {
  nodeValue: string;
  constructor(text: string) {
    this.nodeValue = String(text ?? "");
  }
  /** 序列化为 HTML 文本内容（转义） */
  serialize(): string {
    return escapeForText(this.nodeValue);
  }
}

/** 元素节点：标签 + 属性 + 子节点，可序列化为 HTML */
export class SSRElement {
  tagName: string;
  attributes: Record<string, string> = {};
  children: SSRNode[] = [];
  constructor(tag: string) {
    this.tagName = String(tag).toLowerCase();
  }
  /** 追加子节点，与 DOM appendChild 语义一致 */
  appendChild(node: SSRNode): SSRNode {
    this.children.push(node);
    return node;
  }
  /** 设置属性，值会转为字符串；与编译产物 setAttribute(name, value) 一致 */
  setAttribute(name: string, value: string | number | boolean): void {
    if (value == null || value === false) return;
    const str = value === true ? "" : String(value);
    this.attributes[name] = str;
  }
  /** 子节点的 HTML 串联 */
  get innerHTML(): string {
    return this.children.map((c) => c.serialize()).join("");
  }
  /** 自身 + 子节点的完整 HTML（含标签与属性） */
  get outerHTML(): string {
    const tag = this.tagName;
    const attrs = Object.entries(this.attributes)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        if (v === "") return k;
        return `${k}="${escapeForAttr(v)}"`;
      })
      .join(" ");
    const attrStr = attrs ? " " + attrs : "";
    if (VOID_ELEMENTS.has(tag)) {
      return `<${tag}${attrStr}>`;
    }
    return `<${tag}${attrStr}>${this.innerHTML}</${tag}>`;
  }
  serialize(): string {
    return this.outerHTML;
  }
}

/** 创建供 SSR 使用的伪 document：createElement、createTextNode 返回可序列化节点 */
export function createSSRDocument(): {
  createElement: (tag: string) => SSRElement;
  createTextNode: (text: string) => SSRTextNode;
} {
  return {
    createElement(tag: string): SSRElement {
      return new SSRElement(tag);
    },
    createTextNode(text: string): SSRTextNode {
      return new SSRTextNode(text);
    },
  };
}
