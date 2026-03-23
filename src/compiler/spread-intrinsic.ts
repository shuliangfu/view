/**
 * 将「类 React props」对象上的键值应用到 DOM 元素，用于编译器处理 `<div {...attrs} />`。
 * 覆盖：ref、on*、className/class、style 对象、布尔 DOM 属性、一般 setAttribute。
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
    if (typeof val === "function" && /^on[A-Z]/.test(key)) {
      const ev = key.slice(2).toLowerCase();
      html.addEventListener(ev, val as EventListener);
      continue;
    }
    if (key === "style" && typeof val === "object" && val !== null) {
      Object.assign(html.style, val as object);
      continue;
    }
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
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
      el.setAttribute(key, "");
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
    el.setAttribute(key, String(val));
  }
}
