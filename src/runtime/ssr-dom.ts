/**
 * @module runtime/ssr-dom
 * @description 无浏览器 DOM 时的极简 document/window，供 SSR 同步路径使用（替代 happy-dom）。
 *
 * 覆盖：`jsx-runtime` 的 `createElement` / `createElementNS`，`insert` 的节点操作，`template` 的 `innerHTML` + `cloneNode`，
 * `setProperty` 的 `className` / `style` / `setAttribute` / `getAttribute` / `hasAttribute` /
 * `removeAttribute` / 部分 property、`document.addEventListener`（空操作）。
 *
 * **与真实 Element 对齐（dweb hybrid 在 Deno/Bun 无 document 时）：**
 * 属性/`classList`/`dataset`/`matches`/`closest`/`querySelector`、
 * `append`/`children`/`nodeName`/`parentElement`、`style.*` 等（见类实现）。
 * **非目标：** 完整 CSS 选择器引擎、布局几何、真实事件派发。
 *
 * **序列化热路径：** 复用 `utils/escape` 的 `escapeForText` / `escapeForAttr`（无特殊字符零分配）；
 * `innerHTML`/`outerHTML`/`textContent` 用 `joinChildOuterHtml` 等聚合。
 */

import {
  escapeForAttr,
  escapeForText,
  sanitizeSrcset,
  sanitizeUrl,
  URL_ATTR_NAMES,
} from "../utils/escape.ts";

/** 与 `insert.ts` 共用：标记 SSR 树节点，避免在无 `Node` 全局时 `instanceof` 不可用 */
export const SSR_VIEW_TREE_NODE = Symbol.for("@dreamer/view/ssrTreeNode");

/** HTML 命名空间 */
const HTML_NS = "http://www.w3.org/1999/xhtml";
/** SVG 命名空间 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** 自闭合 / void 元素（小写） */
const VOID_HTML = new Set([
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

const NODE_ELEMENT = 1;
const NODE_TEXT = 3;
const NODE_COMMENT = 8;
const NODE_FRAGMENT = 11;

/** 开始标签匹配（与 `parseHtmlChildren` / `findMatchingCloseTagStart` 共用，避免重复构造正则） */
const OPEN_TAG_RE =
  /^<([\w:-]+)((?:\s+[^>\s/]+(?:\s*=\s*(?:"[^"]*"|'[^']*|[^\s>]+))?)*)\s*(\/)?>/i;

/**
 * 解码常见 HTML 实体（模板内文本用）。
 */
function decodeBasicEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 解析开始标签上的 attribute 字符串并写入元素。
 */
function applyAttributeString(el: SsrElement, attrPart: string): void {
  const re = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrPart)) !== null) {
    const name = m[1];
    if (name === "/" || name.endsWith("/")) continue;
    const val = m[2] ?? m[3] ?? m[4];
    if (val === undefined) el.setAttribute(name, "");
    else el.setAttribute(name, val);
  }
}

/**
 * 在 `parentNS` 上下文中为标签名选择命名空间。
 */
function nsForTag(tagLower: string, parentNS: string | null): string | null {
  if (parentNS === SVG_NS) return SVG_NS;
  if (tagLower === "svg") return SVG_NS;
  return parentNS === SVG_NS ? SVG_NS : HTML_NS;
}

/**
 * HTML 空白（innerHTML 解析常用 ASCII 集；避免每字符 `\s` 正则）。
 */
function skipHtmlWs(html: string, j: number): number {
  const n = html.length;
  while (j < n) {
    const c = html.charCodeAt(j);
    if (c > 32) break;
    if (c === 9 || c === 10 || c === 13 || c === 12 || c === 32) {
      j++;
      continue;
    }
    break;
  }
  return j;
}

/**
 * 从 `from` 起找与 `tagLower` 配对的 `</tag>` 起始下标（`<` 的位置），失败返回 -1。
 * 使用绝对下标与模块级 `OPEN_TAG_RE`，避免整段 `html.slice(i)` 的大前缀副本参与扫描。
 */
function findMatchingCloseTagStart(
  html: string,
  from: number,
  tagLower: string,
): number {
  const n = html.length;
  let depth = 1;
  let p = from;
  while (p < n) {
    if (html.charCodeAt(p) !== 60 /* < */) {
      p++;
      continue;
    }
    if (
      p + 3 < n && html[p + 1] === "!" && html[p + 2] === "-" &&
      html[p + 3] === "-"
    ) {
      const e = html.indexOf("-->", p + 4);
      p = e < 0 ? n : e + 3;
      continue;
    }
    const p1 = p + 1;
    if (p1 >= n) break;
    const c1 = html.charCodeAt(p1);
    if (c1 === 33 /* ! */ || c1 === 63 /* ? */) {
      const gt = html.indexOf(">", p);
      p = gt < 0 ? n : gt + 1;
      continue;
    }
    if (c1 === 47 /* / */) {
      const cm = /^<\/([\w:-]+)\s*>/i.exec(html.slice(p));
      if (!cm) {
        p++;
        continue;
      }
      const t = cm[1]!.toLowerCase();
      if (t === tagLower) {
        depth--;
        if (depth === 0) return p;
      }
      p += cm[0].length;
      continue;
    }
    const om = OPEN_TAG_RE.exec(html.slice(p));
    if (!om) {
      p++;
      continue;
    }
    const innerTag = om[1]!.toLowerCase();
    const innerVoid = om[3] === "/" || VOID_HTML.has(innerTag);
    if (innerTag === tagLower && !innerVoid) depth++;
    p += om[0].length;
  }
  return -1;
}

/**
 * 自递归解析一段 HTML 为子节点序列（用于 `innerHTML`）。
 */
function parseHtmlChildren(
  html: string,
  doc: SsrDocument,
  parentNS: string | null,
): SsrNode[] {
  const out: SsrNode[] = [];
  let i = 0;
  const n = html.length;

  while (i < n) {
    i = skipHtmlWs(html, i);
    if (i >= n) break;

    if (html.charCodeAt(i) !== 60 /* < */) {
      const lt = html.indexOf("<", i);
      const chunk = lt < 0 ? html.slice(i) : html.slice(i, lt);
      if (chunk.length > 0) {
        out.push(doc.createTextNode(decodeBasicEntities(chunk)));
      }
      i = lt < 0 ? n : lt;
      continue;
    }

    if (
      i + 3 < n && html[i + 1] === "!" && html[i + 2] === "-" &&
      html[i + 3] === "-"
    ) {
      const end = html.indexOf("-->", i + 4);
      const data = end < 0 ? html.slice(i + 4) : html.slice(i + 4, end);
      out.push(doc.createComment(data));
      i = end < 0 ? n : end + 3;
      continue;
    }

    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const gt = html.indexOf(">", i);
      i = gt < 0 ? n : gt + 1;
      continue;
    }

    const open = OPEN_TAG_RE.exec(html.slice(i));
    if (!open) {
      i++;
      continue;
    }

    const rawTag = open[1]!;
    const tagLower = rawTag.toLowerCase();
    const attrStr = open[2] ?? "";
    const explicitClose = open[3] === "/";
    const isVoid = VOID_HTML.has(tagLower) || explicitClose;

    const ns = nsForTag(tagLower, parentNS);
    const el = ns === SVG_NS
      ? doc.createElementNS(SVG_NS, rawTag)
      : doc.createElement(tagLower);
    applyAttributeString(el, attrStr);

    const consumed = open[0].length;
    i += consumed;

    if (!isVoid) {
      const closeStart = findMatchingCloseTagStart(html, i, tagLower);
      if (closeStart >= 0) {
        const inner = html.slice(i, closeStart);
        const kids = parseHtmlChildren(inner, doc, el.namespaceURI);
        for (let k = 0; k < kids.length; k++) el.appendChild(kids[k]!);
        const closeRe = new RegExp(
          `</${escapeRegExp(rawTag)}\\s*>`,
          "i",
        );
        const closeMatch = closeRe.exec(html.slice(closeStart));
        i = closeStart + (closeMatch ? closeMatch[0].length : 0);
      }
    }

    out.push(el);
  }

  return out;
}

/** 所有 SSR 节点的抽象基类（非原生 Node 子类，避免污染宿主原型） */
export abstract class SsrNode {
  /** 供 `insert` / `isObject` 识别 */
  readonly [SSR_VIEW_TREE_NODE] = true;
  abstract readonly nodeType: number;
  /** `#text` / `#comment` / 元素 tagName；与浏览器 `nodeName` 一致 */
  abstract readonly nodeName: string;
  parentNode: SsrElement | SsrDocumentFragment | null = null;
  /** 所属文档（`innerHTML` 解析、`createElement` 工厂） */
  ownerDocument: SsrDocument | null = null;

  /**
   * 同级兄弟链（与父节点 `_children` / `_kids` 同步维护；`insertBefore` / `removeChild` 更新）。
   * 叶子节点同样具备字段，未挂载时恒为 null。
   */
  _nextSibling: SsrNode | null = null;
  /** 同级前一兄弟；首子为 null */
  _previousSibling: SsrNode | null = null;

  /** 子节点列表（仅元素与 fragment 有子节点；文本/注释为空） */
  get childNodes(): SsrNode[] {
    return [];
  }

  get firstChild(): SsrNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): SsrNode | null {
    const kids = this.childNodes;
    return kids.length ? kids[kids.length - 1]! : null;
  }

  /** O(1)：由兄弟链读取，避免 `indexOf` */
  get nextSibling(): SsrNode | null {
    return this._nextSibling;
  }

  /** O(1)：由兄弟链读取 */
  get previousSibling(): SsrNode | null {
    return this._previousSibling;
  }

  /** 仅元素父级；跳过 DocumentFragment */
  get parentElement(): SsrElement | null {
    let p: SsrNode | null = this.parentNode;
    while (p) {
      if (p.nodeType === NODE_ELEMENT) return p as SsrElement;
      p = p.parentNode;
    }
    return null;
  }

  /** 是否挂在 documentElement 子树下（SSR 近似） */
  get isConnected(): boolean {
    const doc = this.ownerDocument;
    if (!doc) return false;
    const root = doc.documentElement as SsrNode;
    if ((this as SsrNode) === root) return true;
    let n: SsrNode | null = this.parentNode;
    while (n) {
      if (n === root) return true;
      n = n.parentNode;
    }
    return false;
  }

  hasChildNodes(): boolean {
    return this.childNodes.length > 0;
  }

  /** 自身或后代是否包含 other（含自身） */
  contains(other: SsrNode | null): boolean {
    if (other == null) return false;
    let n: SsrNode | null = other;
    while (n) {
      if (n === this) return true;
      n = n.parentNode;
    }
    return false;
  }

  getRootNode(): SsrNode {
    if (!this.parentNode) return this;
    let n: SsrNode = this.parentNode;
    while (n.parentNode) n = n.parentNode;
    return n;
  }

  /** 叶子节点默认空串；元素 / Fragment 在子类中聚合子节点文本 */
  get textContent(): string {
    return "";
  }

  abstract cloneNode(deep?: boolean): SsrNode;

  remove(): void {
    const p = this.parentNode;
    if (p) p.removeChild(this);
  }

  /** 占位：与 DOM 接口形状一致（SSR 不派发） */
  addEventListener(
    _type?: string,
    _listener?: unknown,
    _options?: unknown,
  ): void {}
  removeEventListener(
    _type?: string,
    _listener?: unknown,
    _options?: unknown,
  ): void {}
  dispatchEvent(_event?: unknown): boolean {
    return true;
  }
}

/**
 * 将子节点插入父级子数组 `pos` 处，并接上双向兄弟链（与 `removeChild` 成对使用）。
 */
function ssrLinkInsertChild(arr: SsrNode[], pos: number, node: SsrNode): void {
  const prev = pos > 0 ? arr[pos - 1]! : null;
  const next = pos < arr.length ? arr[pos]! : null;
  arr.splice(pos, 0, node);
  node._previousSibling = prev;
  node._nextSibling = next;
  if (prev) prev._nextSibling = node;
  if (next) next._previousSibling = node;
}

/**
 * 从父级子数组下标 `i` 移除节点并断开其在兄弟链中的链接。
 */
function ssrUnlinkRemoveChild(arr: SsrNode[], i: number): SsrNode {
  const child = arr[i]!;
  const prev = i > 0 ? arr[i - 1]! : null;
  const next = i < arr.length - 1 ? arr[i + 1]! : null;
  if (prev) prev._nextSibling = next;
  if (next) next._previousSibling = prev;
  child._previousSibling = null;
  child._nextSibling = null;
  arr.splice(i, 1);
  return child;
}

/** 注释节点（`nodeType === 8`） */
export class SsrComment extends SsrNode {
  readonly nodeType = NODE_COMMENT;
  readonly nodeName = "#comment";
  /** 注释内容 */
  data: string;

  constructor(doc: SsrDocument, data: string) {
    super();
    this.data = data;
    this.ownerDocument = doc;
  }

  override get textContent(): string {
    return this.data;
  }
  override set textContent(v: string) {
    this.data = v;
  }

  get outerHTML(): string {
    return `<!--${this.data}-->`;
  }

  cloneNode(_deep?: boolean): SsrComment {
    const c = new SsrComment(this.ownerDocument!, this.data);
    return c;
  }
}

/** 文本节点 */
export class SsrText extends SsrNode {
  readonly nodeType = NODE_TEXT;
  readonly nodeName = "#text";
  /** 文本数据 */
  data: string;

  constructor(doc: SsrDocument, data: string) {
    super();
    this.data = data;
    this.ownerDocument = doc;
  }

  override get textContent(): string {
    return this.data;
  }
  override set textContent(v: string) {
    this.data = v;
  }

  get outerHTML(): string {
    return escapeForText(this.data);
  }

  cloneNode(_deep?: boolean): SsrText {
    return new SsrText(this.ownerDocument!, this.data);
  }
}

/** DocumentFragment */
export class SsrDocumentFragment extends SsrNode {
  readonly nodeType = NODE_FRAGMENT;
  readonly nodeName = "#document-fragment";
  /** 子节点 */
  readonly _children: SsrNode[] = [];

  constructor(doc: SsrDocument) {
    super();
    this.ownerDocument = doc;
  }

  override get childNodes(): SsrNode[] {
    return this._children;
  }

  override get textContent(): string {
    return joinChildTextContent(this._children);
  }

  get outerHTML(): string {
    return joinChildOuterHtml(this._children);
  }

  cloneNode(deep?: boolean): SsrDocumentFragment {
    const f = new SsrDocumentFragment(this.ownerDocument!);
    if (deep) {
      for (const c of this._children) f.appendChild(c.cloneNode(true));
    }
    return f;
  }

  appendChild(child: SsrNode): SsrNode {
    return this.insertBefore(child, null);
  }

  insertBefore(newChild: SsrNode, refChild: SsrNode | null): SsrNode {
    if (newChild.nodeType === NODE_FRAGMENT) {
      const frag = newChild as SsrDocumentFragment;
      const moving = [...frag._children];
      for (const c of moving) this.insertBefore(c, refChild);
      return newChild;
    }
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    const idx = refChild ? this._children.indexOf(refChild) : -1;
    const pos = refChild
      ? (idx < 0 ? this._children.length : idx)
      : this._children.length;
    ssrLinkInsertChild(this._children, pos, newChild);
    newChild.parentNode = this;
    newChild.ownerDocument = this.ownerDocument;
    return newChild;
  }

  removeChild(child: SsrNode): SsrNode {
    const i = this._children.indexOf(child);
    if (i < 0) throw new Error("removeChild: not a child");
    const removed = ssrUnlinkRemoveChild(this._children, i);
    removed.parentNode = null;
    return removed;
  }

  replaceChild(newChild: SsrNode, oldChild: SsrNode): SsrNode {
    const idx = this._children.indexOf(oldChild);
    if (idx < 0) throw new Error("replaceChild: not a child");
    const ref = this._children[idx + 1] ?? null;
    this.removeChild(oldChild);
    if (newChild.nodeType === NODE_FRAGMENT) {
      const frag = newChild as SsrDocumentFragment;
      const moving = [...frag._children];
      for (const c of moving) this.insertBefore(c, ref);
    } else {
      this.insertBefore(newChild, ref);
    }
    return oldChild;
  }
}

/**
 * 聚合子节点 `textContent`（热路径避免 `.map().join` 中间数组）。
 */
function joinChildTextContent(children: readonly SsrNode[]): string {
  const len = children.length;
  if (len === 0) return "";
  if (len === 1) return children[0]!.textContent;
  let out = "";
  for (let i = 0; i < len; i++) {
    out += children[i]!.textContent;
  }
  return out;
}

/** 单节点 outerHTML（不含 Fragment 展开，Fragment 交给 joinChildOuterHtml） */
function ssrLeafOuterHtml(n: SsrNode): string {
  switch (n.nodeType) {
    case NODE_ELEMENT:
      return (n as SsrElement).outerHTML;
    case NODE_TEXT:
      return (n as SsrText).outerHTML;
    case NODE_COMMENT:
      return (n as SsrComment).outerHTML;
    default:
      return "";
  }
}

/**
 * 子树序列化为 HTML（嵌套 DocumentFragment 会展开），供 `innerHTML` / `outerHTML` 共用。
 */
function joinChildOuterHtml(children: readonly SsrNode[]): string {
  const len = children.length;
  if (len === 0) return "";
  if (len === 1) {
    const c = children[0]!;
    if (c.nodeType === NODE_FRAGMENT) {
      return joinChildOuterHtml((c as SsrDocumentFragment)._children);
    }
    return ssrLeafOuterHtml(c);
  }
  const parts = new Array<string>(len);
  for (let i = 0; i < len; i++) {
    const c = children[i]!;
    parts[i] = c.nodeType === NODE_FRAGMENT
      ? joinChildOuterHtml((c as SsrDocumentFragment)._children)
      : ssrLeafOuterHtml(c);
  }
  return parts.join("");
}

/** `_style` 袋转 `cssText`，避免 `Object.entries` + 多段链式分配 */
function styleBagToCssText(bag: Record<string, string>): string {
  const keys = Object.keys(bag);
  if (keys.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const v = bag[k];
    if (v === undefined || v === "") continue;
    parts.push(
      `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`,
    );
  }
  return parts.join(";");
}

/**
 * 简易 CSS 选择器匹配（无复杂组合器）：支持 `*`、tag、`#id`、`.class`、`[attr]`、`[attr=value]`
 * 及它们的串联（如 `a[href]`、`meta[name="description"]`）。逗号选择器列表取 OR。
 */
function ssrMatchesSimple(el: SsrElement, selector: string): boolean {
  const raw = selector.trim();
  if (!raw) return false;
  if (raw.includes(",")) {
    return raw.split(",").some((part) => ssrMatchesSimple(el, part.trim()));
  }
  if (raw === "*") return true;
  let i = 0;
  const tag = /^[a-zA-Z][\w:-]*/.exec(raw);
  if (tag && raw[0] !== "." && raw[0] !== "#" && raw[0] !== "[") {
    if (el.localName !== tag[0]!.toLowerCase()) return false;
    i = tag[0]!.length;
  }
  while (i < raw.length) {
    const c = raw[i]!;
    if (c === "#") {
      const m = /^#([\w-]+)/.exec(raw.slice(i));
      if (!m || el.id !== m[1]) return false;
      i += m[0].length;
      continue;
    }
    if (c === ".") {
      const m = /^\.([\w-]+)/.exec(raw.slice(i));
      if (!m || !el.classList.contains(m[1]!)) return false;
      i += m[0].length;
      continue;
    }
    if (c === "[") {
      const m =
        /^\[\s*([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*\]/
          .exec(raw.slice(i));
      if (!m) return false;
      const name = m[1]!;
      const val = m[2] ?? m[3] ?? m[4];
      if (val === undefined) {
        if (!el.hasAttribute(name)) return false;
      } else if ((el.getAttribute(name) ?? "") !== val) {
        return false;
      }
      i += m[0].length;
      continue;
    }
    // 空白：后代组合器在 match 单节点时不处理
    if (c === " " || c === ">" || c === "+" || c === "~") return false;
    return false;
  }
  return true;
}

/**
 * 在 root 子树中收集匹配节点。
 * - 逗号：OR
 * - 空格：简单后代组合（`meta[name] content` 形不支持；`div .x` / `a[href]` 支持）
 */
function ssrQueryAll(root: SsrNode, selector: string): SsrElement[] {
  const out: SsrElement[] = [];
  const seen = new Set<SsrElement>();
  const add = (el: SsrElement) => {
    if (!seen.has(el)) {
      seen.add(el);
      out.push(el);
    }
  };

  const matchDesc = (
    scope: SsrNode,
    simpleSel: string,
    includeSelf: boolean,
  ) => {
    const visit = (node: SsrNode, isRoot: boolean) => {
      if (node.nodeType === NODE_ELEMENT) {
        const el = node as SsrElement;
        if ((!isRoot || includeSelf) && ssrMatchesSimple(el, simpleSel)) {
          add(el);
        }
        for (const c of el.childNodes) visit(c, false);
      } else if (node.nodeType === NODE_FRAGMENT) {
        for (const c of node.childNodes) visit(c, false);
      }
    };
    visit(scope, true);
  };

  for (const part of selector.split(",").map((s) => s.trim()).filter(Boolean)) {
    const steps = part.split(/\s+/).filter(Boolean);
    if (steps.length === 0) continue;
    if (steps.length === 1) {
      matchDesc(root, steps[0]!, true);
      continue;
    }
    // 多段：先找匹配第一段的节点，再在其后代中找剩余
    let scopes: SsrNode[] = [root];
    for (let si = 0; si < steps.length; si++) {
      const step = steps[si]!;
      const next: SsrElement[] = [];
      const nseen = new Set<SsrElement>();
      for (const sc of scopes) {
        const bucket: SsrElement[] = [];
        const visit = (node: SsrNode, allowSelf: boolean) => {
          if (node.nodeType === NODE_ELEMENT) {
            const el = node as SsrElement;
            if (allowSelf && ssrMatchesSimple(el, step)) {
              if (!nseen.has(el)) {
                nseen.add(el);
                bucket.push(el);
              }
            }
            for (const c of el.childNodes) visit(c, true);
          } else if (node.nodeType === NODE_FRAGMENT) {
            for (const c of node.childNodes) visit(c, true);
          }
        };
        // 第一段可含 root；后续段只在子树（含当前 scope 的后代，不含把自己再匹配时从子开始）
        if (si === 0) {
          visit(sc, true);
        } else {
          if (sc.nodeType === NODE_ELEMENT || sc.nodeType === NODE_FRAGMENT) {
            for (const c of sc.childNodes) visit(c, true);
          }
        }
        next.push(...bucket);
      }
      scopes = next;
    }
    for (const el of scopes) {
      if (el.nodeType === NODE_ELEMENT) add(el as SsrElement);
    }
  }
  return out;
}

/**
 * 元素节点：属性、`innerHTML`、序列化 `outerHTML`。
 */
export class SsrElement extends SsrNode {
  readonly nodeType = NODE_ELEMENT;
  readonly namespaceURI: string | null;
  /** 本地标签名（小写，HTML） */
  readonly localName: string;
  /** 与 DOM 一致的大写 tagName（HTML）；SVG 保留传入大小写 */
  readonly tagName: string;
  /** 与浏览器一致；HTML 为大写 tagName */
  get nodeName(): string {
    return this.tagName;
  }
  /** 特性表 */
  private readonly _attrs = new Map<string, string>();
  /** 供 `setProperty` 使用的 property 袋（`value` / `checked` 等） */
  private readonly _props: Record<string, unknown> = Object.create(null);
  /** style 对象 backing */
  private readonly _style: Record<string, string> = Object.create(null);

  constructor(
    doc: SsrDocument,
    namespaceURI: string | null,
    localName: string,
  ) {
    super();
    this.ownerDocument = doc;
    this.namespaceURI = namespaceURI;
    this.localName = localName;
    this.tagName = namespaceURI === SVG_NS
      ? localName
      : localName.toUpperCase();
    this._props["value"] = "";
    this._props["checked"] = false;
  }

  private _kids: SsrNode[] = [];

  override get childNodes(): SsrNode[] {
    return this._kids;
  }

  /** className ↔ class 特性 */
  get className(): string {
    return this.getAttribute("class") ?? "";
  }
  set className(v: string) {
    if (v) this.setAttribute("class", v);
    else this.removeAttribute("class");
  }

  /**
   * 与 DOM CSSStyleDeclaration 足够兼容：
   * `Object.assign(el.style, obj)`、`cssText`、`setProperty` / `removeProperty` / `getPropertyValue`。
   */
  get style(): Record<string, string> & {
    cssText: string;
    setProperty: (prop: string, value: string) => void;
    removeProperty: (prop: string) => string;
    getPropertyValue: (prop: string) => string;
  } {
    const bag = this._style;
    const cssNameToCamel = (prop: string): string =>
      prop.includes("-")
        ? prop.replace(/-([a-z])/g, (_, x) => x.toUpperCase())
        : prop;
    const api = {
      get cssText() {
        return styleBagToCssText(bag);
      },
      set cssText(v: string) {
        for (const k of Object.keys(bag)) delete (bag as any)[k];
        const s = String(v ?? "");
        if (s.length > 0) {
          for (const part of s.split(";")) {
            const colon = part.indexOf(":");
            if (colon < 0) continue;
            const key = part.slice(0, colon).trim().replace(
              /-([a-z])/g,
              (_, x) => x.toUpperCase(),
            );
            (bag as any)[key] = part.slice(colon + 1).trim();
          }
        }
      },
      setProperty(prop: string, value: string) {
        (bag as any)[cssNameToCamel(prop)] = String(value ?? "");
      },
      removeProperty(prop: string): string {
        const key = cssNameToCamel(prop);
        const prev = (bag as any)[key];
        delete (bag as any)[key];
        return prev == null ? "" : String(prev);
      },
      getPropertyValue(prop: string): string {
        const v = (bag as any)[cssNameToCamel(prop)];
        return v == null ? "" : String(v);
      },
    };
    return new Proxy(bag as any, {
      get(t, p: string | symbol) {
        if (p === "cssText") return api.cssText;
        if (p === "setProperty") return api.setProperty.bind(api);
        if (p === "removeProperty") return api.removeProperty.bind(api);
        if (p === "getPropertyValue") return api.getPropertyValue.bind(api);
        return (t as any)[p as string];
      },
      set(_t, p: string | symbol, v: unknown) {
        if (p === "cssText") {
          api.cssText = String(v ?? "");
          return true;
        }
        if (
          p === "setProperty" || p === "removeProperty" ||
          p === "getPropertyValue"
        ) {
          return false;
        }
        (bag as any)[String(p)] = String(v);
        return true;
      },
    });
  }

  /** id ↔ id 特性（与浏览器一致，便于 `name in el` 与属性同步） */
  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  set id(v: string) {
    if (v) this.setAttribute("id", String(v));
    else this.removeAttribute("id");
  }

  get value(): string {
    return String(this._props["value"] ?? "");
  }
  set value(v: unknown) {
    const s = v == null ? "" : String(v);
    this._props["value"] = s;
    this.setAttribute("value", s);
  }

  get checked(): boolean {
    return Boolean(this._props["checked"]);
  }
  set checked(v: unknown) {
    this._props["checked"] = Boolean(v);
    if (v) this.setAttribute("checked", "");
    else this.removeAttribute("checked");
  }

  /**
   * 设置属性。URL 类名（见 {@link URL_ATTR_NAMES}）先消毒，与 CSR `setProperty` 对齐，
   * 避免 `el.href = "javascript:…"`／直接 `setAttribute` 绕过 JSX 护栏后进 `renderToString`。
   * 危险值：删除既有键并 return（不写入）。`href`／`src` 反射 setter 亦经此路径。
   */
  setAttribute(name: string, value: string): void {
    const n = name.toLowerCase();
    let v = value;
    if (URL_ATTR_NAMES.has(n)) {
      const cleaned = n === "srcset" ? sanitizeSrcset(v) : sanitizeUrl(v);
      if (cleaned == null) {
        this._attrs.delete(n);
        return;
      }
      v = cleaned;
    }
    this._attrs.set(n, v);
    if (n === "class") {
      /* className getter reads _attrs */
    }
  }

  removeAttribute(name: string): void {
    this._attrs.delete(name.toLowerCase());
  }

  getAttribute(name: string): string | null {
    return this._attrs.get(name.toLowerCase()) ?? null;
  }

  /**
   * 与 DOM Element.hasAttribute 对齐。
   * `setProperty` 在 attribute 分支对 `value == null` 会调用此方法；缺失会导致
   * dweb hybrid SSR（Deno/Bun 均无浏览器 document）抛 TypeError。
   */
  hasAttribute(name: string): boolean {
    return this._attrs.has(name.toLowerCase());
  }

  /**
   * 与 DOM Element.toggleAttribute 对齐（force 语义）。
   */
  toggleAttribute(name: string, force?: boolean): boolean {
    const n = name.toLowerCase();
    const has = this._attrs.has(n);
    const shouldHave = force === undefined ? !has : !!force;
    if (shouldHave) {
      if (!has) this._attrs.set(n, "");
      return true;
    }
    this._attrs.delete(n);
    return false;
  }

  get innerHTML(): string {
    return joinChildOuterHtml(this._kids);
  }

  set innerHTML(html: string) {
    while (this._kids.length > 0) {
      const c = this._kids[0]!;
      this.removeChild(c);
    }
    if (!html) return;
    const parsed = parseHtmlChildren(
      html,
      this.ownerDocument!,
      this.namespaceURI,
    );
    for (const n of parsed) this.appendChild(n);
  }

  override get textContent(): string {
    return joinChildTextContent(this._kids);
  }
  override set textContent(v: string) {
    while (this._kids.length > 0) this.removeChild(this._kids[0]!);
    this.appendChild(this.ownerDocument!.createTextNode(v));
  }

  get outerHTML(): string {
    const tag = this.namespaceURI === SVG_NS ? this.localName : this.localName;
    const parts: string[] = [];
    for (const [k, val] of this._attrs) {
      parts.push(` ${k}="${escapeForAttr(val)}"`);
    }
    if (this.namespaceURI === SVG_NS && this.localName === "svg") {
      if (!this._attrs.has("xmlns")) {
        parts.push(` xmlns="${SVG_NS}"`);
      }
    }
    const voidEl = VOID_HTML.has(this.localName);
    const open = `<${tag}${parts.join("")}`;
    if (voidEl) return `${open}>`;
    return `${open}>${this.innerHTML}</${tag}>`;
  }

  cloneNode(deep?: boolean): SsrElement {
    const el = new SsrElement(
      this.ownerDocument!,
      this.namespaceURI,
      this.localName,
    );
    for (const [k, v] of this._attrs) el._attrs.set(k, v);
    Object.assign(el._props, this._props);
    Object.assign(el._style, this._style);
    if (deep) {
      for (const c of this._kids) el.appendChild(c.cloneNode(true));
    }
    return el;
  }

  appendChild(child: SsrNode): SsrNode {
    return this.insertBefore(child, null);
  }

  insertBefore(newChild: SsrNode, refChild: SsrNode | null): SsrNode {
    if (newChild.nodeType === NODE_FRAGMENT) {
      const frag = newChild as SsrDocumentFragment;
      const moving = [...frag._children];
      for (const c of moving) this.insertBefore(c, refChild);
      return newChild;
    }
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    const idx = refChild ? this._kids.indexOf(refChild) : -1;
    const pos = refChild
      ? (idx < 0 ? this._kids.length : idx)
      : this._kids.length;
    ssrLinkInsertChild(this._kids, pos, newChild);
    newChild.parentNode = this;
    newChild.ownerDocument = this.ownerDocument;
    return newChild;
  }

  removeChild(child: SsrNode): SsrNode {
    const i = this._kids.indexOf(child);
    if (i < 0) throw new Error("removeChild: not a child");
    const removed = ssrUnlinkRemoveChild(this._kids, i);
    removed.parentNode = null;
    return removed;
  }

  replaceChild(newChild: SsrNode, oldChild: SsrNode): SsrNode {
    const idx = this._kids.indexOf(oldChild);
    if (idx < 0) throw new Error("replaceChild: not a child");
    const ref = this._kids[idx + 1] ?? null;
    this.removeChild(oldChild);
    if (newChild.nodeType === NODE_FRAGMENT) {
      const frag = newChild as SsrDocumentFragment;
      const moving = [...frag._children];
      for (const c of moving) this.insertBefore(c, ref);
    } else {
      this.insertBefore(newChild, ref);
    }
    return oldChild;
  }

  // --- 现代 DOM 插入 / 查询 / classList / dataset（防 dweb hybrid SSR 再踩洞） ---

  get firstElementChild(): SsrElement | null {
    for (const c of this._kids) {
      if (c.nodeType === NODE_ELEMENT) return c as SsrElement;
    }
    return null;
  }

  get lastElementChild(): SsrElement | null {
    for (let i = this._kids.length - 1; i >= 0; i--) {
      const c = this._kids[i]!;
      if (c.nodeType === NODE_ELEMENT) return c as SsrElement;
    }
    return null;
  }

  /** 仅元素子节点（类 HTMLCollection 的数组视图） */
  get children(): SsrElement[] {
    const out: SsrElement[] = [];
    for (const c of this._kids) {
      if (c.nodeType === NODE_ELEMENT) out.push(c as SsrElement);
    }
    return out;
  }

  get childElementCount(): number {
    return this.children.length;
  }

  /** 与 textContent 同语义（SSR 无布局） */
  get innerText(): string {
    return this.textContent;
  }
  set innerText(v: string) {
    this.textContent = v;
  }

  get classList(): {
    readonly length: number;
    contains: (token: string) => boolean;
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
    toggle: (token: string, force?: boolean) => boolean;
    replace: (oldToken: string, newToken: string) => boolean;
    toString: () => string;
  } {
    const tokens = (): string[] =>
      this.className.split(/\s+/).filter((t) => t.length > 0);
    const write = (list: string[]) => {
      this.className = list.join(" ");
    };
    return {
      get length() {
        return tokens().length;
      },
      contains: (token: string) => tokens().includes(token),
      add: (...toks: string[]) => {
        const set = new Set(tokens());
        for (const t of toks) if (t) set.add(t);
        write([...set]);
      },
      remove: (...toks: string[]) => {
        const set = new Set(tokens());
        for (const t of toks) set.delete(t);
        write([...set]);
      },
      toggle: (token: string, force?: boolean) => {
        const set = new Set(tokens());
        const has = set.has(token);
        const should = force === undefined ? !has : !!force;
        if (should) set.add(token);
        else set.delete(token);
        write([...set]);
        return should;
      },
      replace: (oldToken: string, newToken: string) => {
        const list = tokens();
        const i = list.indexOf(oldToken);
        if (i < 0) return false;
        list[i] = newToken;
        write(list);
        return true;
      },
      toString: () => this.className,
    };
  }

  /** data-* 特性视图 */
  get dataset(): Record<string, string> {
    const getAttr = (name: string) => this.getAttribute(name);
    const setAttr = (name: string, value: string) =>
      this.setAttribute(name, value);
    const removeAttr = (name: string) => this.removeAttribute(name);
    const toDataAttr = (p: string) =>
      "data-" + p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    return new Proxy({} as Record<string, string>, {
      get(_t, p: string | symbol) {
        if (typeof p !== "string") return undefined;
        return getAttr(toDataAttr(p)) ?? undefined;
      },
      set(_t, p: string | symbol, v: unknown) {
        if (typeof p !== "string") return false;
        const attr = toDataAttr(p);
        if (v == null) removeAttr(attr);
        else setAttr(attr, String(v));
        return true;
      },
      deleteProperty(_t, p: string | symbol) {
        if (typeof p !== "string") return false;
        removeAttr(toDataAttr(p));
        return true;
      },
    });
  }

  matches(selectors: string): boolean {
    return ssrMatchesSimple(this, selectors);
  }

  closest(selectors: string): SsrElement | null {
    if (ssrMatchesSimple(this, selectors)) return this;
    let n: SsrNode | null = this.parentNode;
    while (n) {
      if (n.nodeType === NODE_ELEMENT) {
        const el = n as SsrElement;
        if (ssrMatchesSimple(el, selectors)) return el;
      }
      n = n.parentNode;
    }
    return null;
  }

  querySelector(selectors: string): SsrElement | null {
    return this.querySelectorAll(selectors)[0] ?? null;
  }

  querySelectorAll(selectors: string): SsrElement[] {
    // 不含自身（与 Element#querySelectorAll 一致）：在后代子树中匹配
    return ssrQueryAll(this, selectors).filter((el) => el !== this);
  }

  getAttributeNS(_ns: string | null, localName: string): string | null {
    return this.getAttribute(localName);
  }
  setAttributeNS(
    _ns: string | null,
    qualifiedName: string,
    value: string,
  ): void {
    this.setAttribute(
      qualifiedName.includes(":")
        ? qualifiedName.split(":").pop()!
        : qualifiedName,
      value,
    );
  }
  removeAttributeNS(_ns: string | null, localName: string): void {
    this.removeAttribute(localName);
  }
  hasAttributeNS(_ns: string | null, localName: string): boolean {
    return this.hasAttribute(localName);
  }

  append(...nodes: Array<SsrNode | string>): void {
    const doc = this.ownerDocument!;
    for (const n of nodes) {
      this.appendChild(
        typeof n === "string" ? doc.createTextNode(n) : n,
      );
    }
  }

  prepend(...nodes: Array<SsrNode | string>): void {
    const doc = this.ownerDocument!;
    const first = this.firstChild;
    for (const n of nodes) {
      const node = typeof n === "string" ? doc.createTextNode(n) : n;
      this.insertBefore(node, first);
    }
  }

  before(...nodes: Array<SsrNode | string>): void {
    const p = this.parentNode;
    if (!p) return;
    const doc = this.ownerDocument!;
    for (const n of nodes) {
      const node = typeof n === "string" ? doc.createTextNode(n) : n;
      p.insertBefore(node, this);
    }
  }

  after(...nodes: Array<SsrNode | string>): void {
    const p = this.parentNode;
    if (!p) return;
    const doc = this.ownerDocument!;
    const ref = this.nextSibling;
    for (const n of nodes) {
      const node = typeof n === "string" ? doc.createTextNode(n) : n;
      p.insertBefore(node, ref);
    }
  }

  replaceWith(...nodes: Array<SsrNode | string>): void {
    const p = this.parentNode;
    if (!p) return;
    const doc = this.ownerDocument!;
    const ref = this.nextSibling;
    p.removeChild(this);
    for (const n of nodes) {
      const node = typeof n === "string" ? doc.createTextNode(n) : n;
      p.insertBefore(node, ref);
    }
  }

  /** 常用反射属性：与 setProperty / 表单控件路径对齐 */
  get name(): string {
    return this.getAttribute("name") ?? "";
  }
  set name(v: string) {
    if (v) this.setAttribute("name", String(v));
    else this.removeAttribute("name");
  }
  get type(): string {
    return this.getAttribute("type") ?? "";
  }
  set type(v: string) {
    if (v) this.setAttribute("type", String(v));
    else this.removeAttribute("type");
  }
  get href(): string {
    return this.getAttribute("href") ?? "";
  }
  set href(v: string) {
    if (v) this.setAttribute("href", String(v));
    else this.removeAttribute("href");
  }
  get src(): string {
    return this.getAttribute("src") ?? "";
  }
  set src(v: string) {
    if (v) this.setAttribute("src", String(v));
    else this.removeAttribute("src");
  }
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(v: unknown) {
    if (v) this.setAttribute("disabled", "");
    else this.removeAttribute("disabled");
  }
  get tabIndex(): number {
    const t = this.getAttribute("tabindex");
    return t == null ? -1 : Number(t) || 0;
  }
  set tabIndex(v: number) {
    this.setAttribute("tabindex", String(v));
  }

  // 浏览器输入 API 在 SSR 为空操作
  focus(): void {}
  blur(): void {}
  click(): void {}
  setSelectionRange(_s?: number, _e?: number, _d?: string): void {}
}

/**
 * 极简 `document`：工厂方法与空事件接口。
 */
export class SsrDocument {
  /** 根占位（部分代码会读 `document.documentElement`） */
  documentElement: SsrElement;
  /** 惰性 head/body，meta/router 可能用到 */
  private _head: SsrElement | null = null;
  private _body: SsrElement | null = null;

  constructor() {
    this.documentElement = new SsrElement(this, HTML_NS, "html");
  }

  get head(): SsrElement {
    if (!this._head) {
      this._head = this.createElement("head");
      this.documentElement.appendChild(this._head);
    }
    return this._head;
  }

  get body(): SsrElement {
    if (!this._body) {
      this._body = this.createElement("body");
      this.documentElement.appendChild(this._body);
    }
    return this._body;
  }

  get defaultView(): unknown {
    return (globalThis as { window?: unknown }).window ?? null;
  }

  createElement(tagName: string): SsrElement {
    return new SsrElement(this, HTML_NS, tagName.toLowerCase());
  }

  createElementNS(ns: string, qualifiedName: string): SsrElement {
    return new SsrElement(this, ns, qualifiedName);
  }

  createTextNode(data: string): SsrText {
    return new SsrText(this, data);
  }

  createComment(data: string): SsrComment {
    return new SsrComment(this, data);
  }

  createDocumentFragment(): SsrDocumentFragment {
    return new SsrDocumentFragment(this);
  }

  importNode(node: SsrNode, deep?: boolean): SsrNode {
    return node.cloneNode(deep);
  }

  /** SSR 不派发事件；与 `setProperty` 委托注册形状一致 */
  addEventListener(
    _type?: string,
    _listener?: unknown,
    _options?: unknown,
  ): void {}
  removeEventListener(
    _type?: string,
    _listener?: unknown,
    _options?: unknown,
  ): void {}
  dispatchEvent(_event?: unknown): boolean {
    return true;
  }

  getElementById(id: string): SsrElement | null {
    const walk = (n: SsrNode): SsrElement | null => {
      if (n.nodeType === NODE_ELEMENT) {
        const el = n as SsrElement;
        if (el.getAttribute("id") === id) return el;
        for (const c of el.childNodes) {
          const f = walk(c);
          if (f) return f;
        }
      }
      return null;
    };
    return walk(this.documentElement);
  }

  querySelector(selectors: string): SsrElement | null {
    return ssrQueryAll(this.documentElement, selectors)[0] ?? null;
  }

  querySelectorAll(selectors: string): SsrElement[] {
    return ssrQueryAll(this.documentElement, selectors);
  }
}

export type StashedGlobals = {
  hadDocument: boolean;
  document: unknown;
  hadWindow: boolean;
  window: unknown;
};

/**
 * 安装 `globalThis.document` / `window`（SsrDocument + 最小 window），返回恢复函数。
 */
export function installMinimalSsrGlobals(): {
  document: SsrDocument;
  window: Window & { document: SsrDocument };
  teardown: () => void;
} {
  const doc = new SsrDocument();
  const win = { document: doc } as Window & { document: SsrDocument };
  const g = globalThis as Record<string, unknown>;
  const stash: StashedGlobals = {
    hadDocument: Object.prototype.hasOwnProperty.call(g, "document"),
    document: g["document"],
    hadWindow: Object.prototype.hasOwnProperty.call(g, "window"),
    window: g["window"],
  };
  (globalThis as unknown as { document: SsrDocument }).document = doc;
  (globalThis as unknown as { window: typeof win }).window = win;

  const teardown = () => {
    if (stash.hadDocument) {
      (globalThis as any).document = stash.document;
    } else {
      try {
        delete (globalThis as any).document;
      } catch {
        (globalThis as any).document = undefined;
      }
    }
    if (stash.hadWindow) {
      (globalThis as any).window = stash.window;
    } else {
      try {
        delete (globalThis as any).window;
      } catch {
        (globalThis as any).window = undefined;
      }
    }
  };

  return { document: doc, window: win, teardown };
}
