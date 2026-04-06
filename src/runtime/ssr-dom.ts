/**
 * @module runtime/ssr-dom
 * @description 无浏览器 DOM 时的极简 document/window，供 SSR 同步路径使用（替代 happy-dom）。
 *
 * 覆盖：`jsx-runtime` 的 `createElement` / `createElementNS`，`insert` 的节点操作，`template` 的 `innerHTML` + `cloneNode`，
 * `setProperty` 的 `className` / `style` / `setAttribute` / 部分 property、`document.addEventListener`（空操作）。
 *
 * **序列化热路径：** `escapeHtmlText` / `escapeHtmlAttr` 无特殊字符时快速返回；`innerHTML`/`outerHTML`/`textContent` 用 `joinChildOuterHtml` 等聚合，减少重复 `map` 与 `Object.entries`。
 */

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
 * 转义文本节点内容：无特殊字符时零分配返回原串；否则单次扫描拼接。
 */
function escapeHtmlText(s: string): string {
  if (
    s.indexOf("&") === -1 && s.indexOf("<") === -1 && s.indexOf(">") === -1
  ) {
    return s;
  }
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) out += "&amp;";
    else if (c === 60) out += "&lt;";
    else if (c === 62) out += "&gt;";
    else out += s[i]!;
  }
  return out;
}

/** 属性值转义：快速路径跳过无 &、" 的字符串 */
function escapeHtmlAttr(s: string): string {
  const str = String(s);
  if (str.indexOf("&") === -1 && str.indexOf('"') === -1) return str;
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

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

  /** O(1)：由兄弟链读取，避免 `indexOf` */
  get nextSibling(): SsrNode | null {
    return this._nextSibling;
  }

  /** O(1)：由兄弟链读取 */
  get previousSibling(): SsrNode | null {
    return this._previousSibling;
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

  /** 占位：与 DOM 接口形状一致 */
  addEventListener(): void {}
  removeEventListener(): void {}
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
    return escapeHtmlText(this.data);
  }

  cloneNode(_deep?: boolean): SsrText {
    return new SsrText(this.ownerDocument!, this.data);
  }
}

/** DocumentFragment */
export class SsrDocumentFragment extends SsrNode {
  readonly nodeType = NODE_FRAGMENT;
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
 * 元素节点：属性、`innerHTML`、序列化 `outerHTML`。
 */
export class SsrElement extends SsrNode {
  readonly nodeType = NODE_ELEMENT;
  readonly namespaceURI: string | null;
  /** 本地标签名（小写，HTML） */
  readonly localName: string;
  /** 与 DOM 一致的大写 tagName（HTML）；SVG 保留传入大小写 */
  readonly tagName: string;
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

  /** 与 DOM CSSStyleDeclaration 足够兼容：Object.assign(el.style, obj) + cssText */
  get style(): Record<string, string> & { cssText: string } {
    const bag = this._style;
    return new Proxy(bag as Record<string, string> & { cssText: string }, {
      get(t, p: string | symbol) {
        if (p === "cssText") {
          return styleBagToCssText(bag);
        }
        return (t as any)[p];
      },
      set(_t, p: string | symbol, v: unknown) {
        if (p === "cssText") {
          for (const k of Object.keys(bag)) delete (bag as any)[k];
          const s = String(v ?? "");
          if (!s) return true;
          for (const part of s.split(";")) {
            const colon = part.indexOf(":");
            if (colon < 0) continue;
            const key = part.slice(0, colon).trim().replace(
              /-([a-z])/g,
              (_, x) => x.toUpperCase(),
            );
            (bag as any)[key] = part.slice(colon + 1).trim();
          }
          return true;
        }
        (bag as any)[String(p)] = String(v);
        return true;
      },
    });
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

  setAttribute(name: string, value: string): void {
    const n = name.toLowerCase();
    this._attrs.set(n, value);
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
      parts.push(` ${k}="${escapeHtmlAttr(val)}"`);
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
}

/**
 * 极简 `document`：工厂方法与空事件接口。
 */
export class SsrDocument {
  /** 根占位（部分代码会读 `document.documentElement`） */
  documentElement: SsrElement;

  constructor() {
    this.documentElement = new SsrElement(this, HTML_NS, "html");
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

  /** SSR 不派发事件；与 `setProperty` 委托注册形状一致 */
  addEventListener(): void {}
  removeEventListener(): void {}

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
