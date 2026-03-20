/**
 * 将「类 React props」对象上的键值应用到 DOM 元素，用于编译器处理 `<div {...attrs} />`。
 * 覆盖：ref、on*、className/class、style 对象、布尔 DOM 属性、一般 setAttribute。
 *
 * @module @dreamer/view/runtime/spread-intrinsic
 */

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
