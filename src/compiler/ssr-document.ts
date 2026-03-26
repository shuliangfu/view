/**
 * 编译路径 SSR：服务端用「伪 DOM」执行编译后的 fn(container)，再序列化为 HTML。
 * 与客户端同一套编译产物：服务端优先替换 globalThis.document；浏览器不可写时由 active-document 影子键提供伪 document，
 * 执行 fn(container) 后对 container 做 innerHTML 序列化。
 *
 * @module @dreamer/view/runtime/ssr-document
 */

import { safeTextForDom } from "../dom/shared.ts";
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

/** SSR 序列化节点：元素、文本，或 {@link SSRRawHtmlNode}（innerHTML 赋值产生的原始 HTML 片段） */
export type SSRNode = SSRElement | SSRTextNode | SSRRawHtmlNode;

/** 将 camelCase 转换为 kebab-case（如 backgroundColor -> background-color） */
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/** SSR 环境下的 CSSStyleDeclaration 兼容对象：存储样式属性，序列化时转为 style 属性字符串 */
function createSSRStyleDeclaration(): CSSStyleDeclaration {
  const styles: Record<string, string> = {};

  return new Proxy({} as CSSStyleDeclaration, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") {
        return undefined;
      }
      if (prop === "getPropertyValue") {
        return (name: string) => styles[name] ?? "";
      }
      if (prop === "setProperty") {
        return (name: string, value: string) => {
          styles[name] = String(value);
        };
      }
      if (prop === "removeProperty") {
        return (name: string) => {
          delete styles[name];
        };
      }
      if (prop === "toString") {
        return () => {
          return Object.entries(styles)
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ");
        };
      }
      // 属性访问（如 el.style.color）
      const kebabKey = camelToKebab(prop);
      return styles[kebabKey] ?? "";
    },
    set(_target, prop: string | symbol, value: string) {
      if (typeof prop !== "string") {
        return false;
      }
      // 属性设置（如 el.style.color = 'red'）
      const kebabKey = camelToKebab(prop);
      if (value) {
        styles[kebabKey] = String(value);
      } else {
        delete styles[kebabKey];
      }
      return true;
    },
    has(_target, prop: string | symbol) {
      if (typeof prop !== "string") {
        return false;
      }
      return prop in
          {
            getPropertyValue: true,
            setProperty: true,
            removeProperty: true,
            toString: true,
          } ||
        camelToKebab(prop) in styles;
    },
    ownKeys() {
      return Object.keys(styles);
    },
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop !== "string") {
        return undefined;
      }
      const kebabKey = camelToKebab(prop);
      if (kebabKey in styles) {
        return {
          enumerable: true,
          configurable: true,
          value: styles[kebabKey],
        };
      }
      return undefined;
    },
  });
}

/** SSR 环境下的 DOMTokenList 兼容对象：管理 class 类名列表 */
class SSRDOMTokenList {
  private classes: Set<string> = new Set();
  private element: SSRElement;
  constructor(element: SSRElement) {
    this.element = element;
    // 从元素的 class 属性初始化
    const classAttr = element.attributes["class"];
    if (classAttr) {
      classAttr.split(/\s+/).filter(Boolean).forEach((c) =>
        this.classes.add(c)
      );
    }
  }
  /** 添加类名 */
  add(...tokens: string[]): void {
    for (const token of tokens) {
      if (token) this.classes.add(token);
    }
    this._syncToAttribute();
  }
  /** 移除类名 */
  remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.classes.delete(token);
    }
    this._syncToAttribute();
  }
  /** 切换类名（存在则移除，不存在则添加） */
  toggle(token: string, force?: boolean): boolean {
    const has = this.classes.has(token);
    if (force === true || (!has && force !== false)) {
      this.classes.add(token);
      this._syncToAttribute();
      return true;
    }
    if (force === false || has) {
      this.classes.delete(token);
      this._syncToAttribute();
      return false;
    }
    return false;
  }
  /** 检查是否包含类名 */
  contains(token: string): boolean {
    return this.classes.has(token);
  }
  /** 类名数量 */
  get length(): number {
    return this.classes.size;
  }
  /** 获取指定索引的类名 */
  item(index: number): string | null {
    const arr = Array.from(this.classes);
    return arr[index] ?? null;
  }
  /** 同步到元素的 class 属性 */
  private _syncToAttribute(): void {
    const classStr = Array.from(this.classes).join(" ");
    if (classStr) {
      this.element.attributes["class"] = classStr;
    } else {
      delete this.element.attributes["class"];
    }
  }
  /** 迭代器支持 */
  [Symbol.iterator](): Iterator<string> {
    return this.classes[Symbol.iterator]();
  }
  /** toString 返回类名字符串 */
  toString(): string {
    return Array.from(this.classes).join(" ");
  }
}

/** 与 DOM Text#childNodes 一致：无子节点；避免 insertReactive 里读 `parent.childNodes.length` 时为 undefined 抛错 */
const EMPTY_TEXT_CHILD_NODES: readonly SSRNode[] = Object.freeze([]);

/** 文本节点：仅序列化为转义文本 */
export class SSRTextNode {
  nodeValue: string;
  nodeType: number = 3; // Node.TEXT_NODE
  /**
   * @param text - 文本内容；须经 {@link safeTextForDom}，禁止对 function 使用 `String(fn)`（SSR 会吐出整段挂载源码）。
   */
  constructor(text: unknown) {
    this.nodeValue = safeTextForDom(text);
  }
  /** 与浏览器 Text 节点一致，供 insertReactive / Array.from(childNodes) 使用 */
  get childNodes(): SSRNode[] {
    return EMPTY_TEXT_CHILD_NODES as SSRNode[];
  }
  /** 序列化为 HTML 文本内容（转义） */
  serialize(): string {
    return escapeForText(this.nodeValue);
  }
}

/**
 * 表示 `SSRElement#innerHTML = "..."` 写入的原始 HTML 片段。
 * 不参与标签转义，{@link serialize} 原样输出，以便 SSR 字符串与浏览器 `innerHTML` 替换子树后的结果一致；
 * 避免仅实现 getter 时 ref/受控组件在服务端对 `innerHTML` 赋值抛错。
 *
 * 安全语义与浏览器 `innerHTML` 相同：调用方须保证内容可信。
 */
export class SSRRawHtmlNode {
  /** 非标准占位，避免与 ELEMENT/TEXT 混淆 */
  nodeType = -1;
  readonly html: string;

  /**
   * @param html - 已赋值的 HTML 字符串
   */
  constructor(html: string) {
    this.html = html;
  }

  /** 与 Text 节点一致：无子节点 */
  get childNodes(): SSRNode[] {
    return EMPTY_TEXT_CHILD_NODES as SSRNode[];
  }

  /**
   * 近似 DOM textContent：剥标签后合并空白，供字数统计等仅读文本的路径使用。
   */
  get textContent(): string {
    return this.html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** 拼入父元素 innerHTML 时原样输出 */
  serialize(): string {
    return this.html;
  }
}

/** 元素节点：标签 + 属性 + 子节点，可序列化为 HTML */
export class SSRElement {
  tagName: string;
  attributes: Record<string, string> = {};
  children: SSRNode[] = [];
  private _style: CSSStyleDeclaration | null = null;
  private _classList: SSRDOMTokenList | null = null;
  nodeType: number = 1; // Node.ELEMENT_NODE

  constructor(tag: string) {
    this.tagName = String(tag).toLowerCase();
  }

  /** 与 DOM Node.childNodes 兼容，供 insertReactive 等读取 length / [i] */
  get childNodes(): SSRNode[] {
    return this.children;
  }

  /** 获取第一个子节点 */
  get firstChild(): SSRNode | null {
    return this.children[0] ?? null;
  }

  /** 获取节点名称（大写标签名） */
  get nodeName(): string {
    return this.tagName.toUpperCase();
  }

  /** 获取文本内容（所有子文本节点的串联） */
  get textContent(): string {
    return this.children
      .map((c) => {
        if (c instanceof SSRTextNode) return c.nodeValue;
        if (c instanceof SSRElement) return c.textContent;
        if (c instanceof SSRRawHtmlNode) return c.textContent;
        return "";
      })
      .join("");
  }

  /** 设置文本内容（清空子节点并添加文本节点） */
  set textContent(value: unknown) {
    this.children = [new SSRTextNode(value)];
  }

  /** 获取 style 对象（CSSStyleDeclaration 兼容） */
  get style(): CSSStyleDeclaration {
    if (!this._style) {
      this._style = createSSRStyleDeclaration();
    }
    return this._style;
  }

  /** 获取 classList 对象（DOMTokenList 兼容） */
  get classList(): SSRDOMTokenList {
    if (!this._classList) {
      this._classList = new SSRDOMTokenList(this);
    }
    return this._classList;
  }

  /** 追加子节点，与 DOM appendChild 语义一致 */
  appendChild(node: SSRNode): SSRNode {
    this.children.push(node);
    return node;
  }

  /** 移除子节点 */
  removeChild(node: SSRNode): SSRNode {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    return node;
  }

  /** 替换子节点 */
  replaceChild(newChild: SSRNode, oldChild: SSRNode): SSRNode {
    const index = this.children.indexOf(oldChild);
    if (index >= 0) {
      this.children[index] = newChild;
    }
    return oldChild;
  }

  /** 替换所有子节点（现代 DOM API） */
  replaceChildren(...nodes: SSRNode[]): void {
    this.children = nodes;
  }

  /** 设置属性，值会转为字符串；与编译产物 setAttribute(name, value) 一致 */
  setAttribute(name: string, value: string | number | boolean): void {
    if (value == null || value === false) return;
    const str = value === true ? "" : String(value);
    this.attributes[name] = str;
    // 同步更新 classList
    if (name === "class" && this._classList) {
      this._classList = new SSRDOMTokenList(this);
    }
  }

  /** 获取属性值 */
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  /** 检查是否包含属性 */
  hasAttribute(name: string): boolean {
    return name in this.attributes;
  }

  /** 移除属性 */
  removeAttribute(name: string): void {
    delete this.attributes[name];
    // 同步更新 classList
    if (name === "class" && this._classList) {
      this._classList = new SSRDOMTokenList(this);
    }
  }

  /** SSR 环境不需要事件绑定，提供空实现以兼容 applyIntrinsicVNodeProps 的 addEventListener 调用 */
  addEventListener(_type: string, _listener: EventListener | null): void {
    // SSR 中事件处理器不会被绑定，此方法仅为兼容性存在
  }

  /** SSR 环境不需要事件解绑，提供空实现以兼容可能的 removeEventListener 调用 */
  removeEventListener(_type: string, _listener: EventListener | null): void {
    // SSR 中事件处理器不会被绑定，此方法仅为兼容性存在
  }

  /** SSR 环境不需要焦点操作，提供空实现以兼容可能的 focus 调用 */
  focus(): void {
    // SSR 中不需要焦点管理
  }

  /** SSR 环境不需要焦点操作，提供空实现以兼容可能的 blur 调用 */
  blur(): void {
    // SSR 中不需要焦点管理
  }

  /** 查询选择器（SSR 中简化实现，仅支持标签名和 ID） */
  querySelector(selector: string): SSRElement | null {
    // 简化实现：仅支持标签名和 #id
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      return this._findById(id) ?? null;
    }
    // 标签名选择器
    const tag = selector.toLowerCase();
    return this._findByTag(tag) ?? null;
  }

  /** 查询所有匹配选择器的元素 */
  querySelectorAll(selector: string): SSRElement[] {
    const results: SSRElement[] = [];
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      const found = this._findById(id);
      if (found) results.push(found);
    } else {
      // 标签名选择器
      const tag = selector.toLowerCase();
      this._findAllByTag(tag, results);
    }
    return results;
  }

  /** 内部方法：通过 ID 查找元素 */
  private _findById(id: string): SSRElement | null {
    if (this.getAttribute("id") === id) {
      return this;
    }
    for (const child of this.children) {
      if (child instanceof SSRElement) {
        const found = child._findById(id);
        if (found) return found;
      }
    }
    return null;
  }

  /** 内部方法：通过标签名查找元素 */
  private _findByTag(tag: string): SSRElement | null {
    if (this.tagName === tag) {
      return this;
    }
    for (const child of this.children) {
      if (child instanceof SSRElement) {
        const found = child._findByTag(tag);
        if (found) return found;
      }
    }
    return null;
  }

  /** 内部方法：通过标签名查找所有匹配元素 */
  private _findAllByTag(tag: string, results: SSRElement[]): void {
    if (this.tagName === tag) {
      results.push(this);
    }
    for (const child of this.children) {
      if (child instanceof SSRElement) {
        child._findAllByTag(tag, results);
      }
    }
  }

  /**
   * 子节点序列化后的 HTML 串联；若曾执行 `innerHTML = "..."`，则包含原始片段（见 {@link SSRRawHtmlNode}）。
   */
  get innerHTML(): string {
    return this.children.map((c) => c.serialize()).join("");
  }

  /**
   * 与浏览器一致：清空现有子树并替换为赋值字符串的序列化结果（以 {@link SSRRawHtmlNode} 存储，不做 HTML 解析）。
   */
  set innerHTML(html: string) {
    this.children = [new SSRRawHtmlNode(String(html))];
  }

  /** 自身 + 子节点的完整 HTML（含标签与属性） */
  get outerHTML(): string {
    const tag = this.tagName;
    const attrs: string[] = [];

    // 添加普通属性
    for (const [k, v] of Object.entries(this.attributes)) {
      if (v === "") {
        attrs.push(k);
      } else {
        attrs.push(`${k}="${escapeForAttr(v)}"`);
      }
    }

    // 添加 style 属性（如果 style 对象有内容）
    if (this._style) {
      const styleStr = String(this._style);
      if (styleStr) {
        attrs.push(`style="${escapeForAttr(styleStr)}"`);
      }
    }

    const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
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
