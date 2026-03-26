/**
 * 将「类 React props」对象上的键值应用到 DOM 元素，用于编译器处理 `<div {...attrs} />`。
 * 覆盖：ref、`on*` / `on*Capture`、`dangerouslySetInnerHTML`、className/class（含数组拼接）、
 * style 对象、`data-*`（对象/数组 JSON）、数组、`Date`（ISO）、`aria*` 驼峰 → `aria-*`、
 * `tabIndex` 等别名、布尔 DOM 属性、一般 setAttribute。
 * 普通嵌套对象（非 style、非 data-*、非 Date）仍跳过，避免把 signal 等误写。
 *
 * @module @dreamer/view/runtime/spread-intrinsic
 */

/**
 * 设置或移除内置元素的字符串属性：`value` 为 `null` / `undefined` 时调用 `removeAttribute`，
 * 避免 `el.setAttribute(name, undefined)` 在浏览器中被序列化为字面量 `"undefined"`（与 React 对可选 DOM props 的处理一致）。
 * 其它值经 `String(value)` 写入（含空字符串，与显式写 `attr=""` 一致）。
 *
 * @param el - 目标元素
 * @param name - DOM 属性名（已映射，如 `for`、`class`）
 * @param value - 动态表达式求值结果
 */
export function setIntrinsicDomAttribute(
  el: Element,
  name: string,
  value: unknown,
): void {
  if (value == null) {
    el.removeAttribute(name);
    return;
  }
  el.setAttribute(name, String(value));
}

/** 与编译器 BOOLEAN_ATTRS 对齐的布尔 DOM 属性名（小写 JSX 名 → 赋给 HTMLElement 上的属性名） */
const BOOLEAN_HTML: Record<string, string> = {
  disabled: "disabled",
  checked: "checked",
  hidden: "hidden",
  readonly: "readOnly",
  readOnly: "readOnly",
  selected: "selected",
  multiple: "multiple",
  autofocus: "autofocus",
  contenteditable: "contentEditable",
  contentEditable: "contentEditable",
  draggable: "draggable",
  spellcheck: "spellCheck",
  spellCheck: "spellCheck",
};

/** JSX 属性名 → HTML content attribute 名（与 React 常见命名对齐） */
const JSX_TO_HTML_ATTR: Record<string, string> = {
  tabIndex: "tabindex",
  httpEquiv: "http-equiv",
  acceptCharset: "accept-charset",
  maxLength: "maxlength",
  minLength: "minlength",
  autoComplete: "autocomplete",
  inputMode: "inputmode",
  autoCapitalize: "autocapitalize",
  enterKeyHint: "enterkeyhint",
};

/**
 * 将 JSX 属性名转为写入 DOM 的 attribute 名（`ariaLabel` → `aria-label`，`tabIndex` → `tabindex`）。
 * 已带 `aria-` 前缀的保持不变。
 *
 * @param key - JSX 上的 prop 名
 */
export function domAttributeNameFromPropKey(key: string): string {
  const alias = JSX_TO_HTML_ATTR[key];
  if (alias) return alias;
  if (key.startsWith("aria-")) return key;
  if (
    key.startsWith("aria") && key.length > 4 && /[A-Z]/.test(key.slice(4))
  ) {
    return key.replace(/([A-Z])/g, "-$1").toLowerCase();
  }
  return key;
}

/**
 * 解析 `on*` / `on*Capture` 为 DOM 事件绑定描述。
 * `capture: true` 时传入 `addEventListener` 第三参；完整捕获/冒泡顺序依赖宿主 DOM（Deno 测试用 DOM 对合成事件可能不触发捕获，以真浏览器为准）。
 *
 * @param key - 如 `onClick`、`onclick`、`onClickCapture`
 */
export function eventBindingFromOnProp(
  key: string,
): { type: string; capture: boolean } | null {
  if (key.length < 3 || !key.startsWith("on")) return null;
  /** 至少 `onACapture`（10 字符），排除单独的 `onCapture` */
  if (key.endsWith("Capture") && key.length >= 10) {
    const mid = key.slice(2, -"Capture".length);
    if (mid.length > 0 && /^[A-Za-z]/.test(mid)) {
      return { type: mid.toLowerCase(), capture: true };
    }
    return null;
  }
  const tail = key.slice(2);
  if (tail.length === 0 || !/^[A-Za-z]/.test(tail)) return null;
  /** 避免 `onCapture` 被当成事件名 capture */
  if (tail.toLowerCase() === "capture") return null;
  return { type: tail.toLowerCase(), capture: false };
}

/**
 * 从 JSX 的 `on*` 属性解析 DOM 事件名（全小写）；**不含** `Capture` 形式（该用 {@link eventBindingFromOnProp}）。
 *
 * @param key - 属性名
 */
export function eventNameFromOnProp(key: string): string | null {
  const b = eventBindingFromOnProp(key);
  if (b == null || b.capture) return null;
  return b.type;
}

/**
 * 将值序列化为 `data-*` 属性的字符串：原始类型用 `String`，对象/数组用 `JSON.stringify`。
 * 函数等无法序列化时返回 null（不写属性）。
 *
 * @param val - 属性值
 */
export function dataAttributeStringValue(val: unknown): string | null {
  if (val == null) return null;
  const t = typeof val;
  if (
    t === "string" || t === "number" || t === "boolean" || t === "bigint"
  ) {
    return String(val);
  }
  if (t === "object") {
    if (val instanceof Date) {
      return val.toISOString();
    }
    try {
      return JSON.stringify(val);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 把对象中的属性应用到元素；与多次调用顺序一致时，后调用的键覆盖先调用的。
 *
 * @param el - 目标元素
 * @param props - 来自 JSX spread 的键值（可含 ref、事件、className、style 等）
 */
export function spreadIntrinsicProps(
  el: Element,
  props: Record<string, unknown> | null | undefined,
): void {
  if (props == null || typeof props !== "object") return;
  const html = el as HTMLElement;
  for (const key of Object.keys(props)) {
    if (key === "children" || key === "key") continue;
    const val = (props as Record<string, unknown>)[key];
    if (val == null) continue;
    if (key === "ref") {
      if (typeof val === "function") {
        (val as (n: Element | null) => void)(el);
      } else if (
        typeof val === "object" && val !== null && "current" in val
      ) {
        (val as { current: Element | null }).current = el;
      }
      continue;
    }
    const binding = eventBindingFromOnProp(key);
    if (typeof val === "function" && binding !== null) {
      html.addEventListener(
        binding.type,
        val as EventListener,
        binding.capture ? { capture: true } : undefined,
      );
      continue;
    }
    if (
      key === "dangerouslySetInnerHTML" && typeof val === "object" &&
      val !== null
    ) {
      const raw = (val as { __html?: unknown }).__html;
      if (typeof raw === "string") {
        el.innerHTML = raw;
      }
      continue;
    }
    if (key === "style" && typeof val === "object" && val !== null) {
      if (
        typeof globalThis.Node === "function" &&
        (val as object) instanceof globalThis.Node
      ) {
        continue;
      }
      Object.assign(html.style, val as object);
      continue;
    }
    if (key.startsWith("data-")) {
      const s = dataAttributeStringValue(val);
      if (s != null) {
        el.setAttribute(key, s);
      }
      continue;
    }
    if (typeof val === "object" && val !== null) {
      if (Array.isArray(val)) {
        if (key === "className" || key === "class") {
          el.setAttribute("class", val.filter(Boolean).join(" "));
        } else {
          el.setAttribute(domAttributeNameFromPropKey(key), String(val));
        }
        continue;
      }
      if (val instanceof Date) {
        el.setAttribute(
          domAttributeNameFromPropKey(key),
          val.toISOString(),
        );
        continue;
      }
      continue;
    }
    if (typeof val === "function") continue;
    const boolKey = BOOLEAN_HTML[key];
    if (boolKey !== undefined) {
      (html as unknown as Record<string, boolean>)[boolKey as string] = !!val;
      continue;
    }
    if (val === false) continue;
    if (val === true) {
      el.setAttribute(domAttributeNameFromPropKey(key), "");
      continue;
    }
    if (key === "className" || key === "class") {
      el.setAttribute("class", String(val));
      continue;
    }
    if (key === "htmlFor") {
      el.setAttribute("for", String(val));
      continue;
    }
    el.setAttribute(domAttributeNameFromPropKey(key), String(val));
  }
}
