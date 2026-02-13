/**
 * View 模板引擎 — 向 DOM 元素应用 props
 *
 * 含 signal 绑定、ref、v-show、事件、className、style、布尔/表单属性及自定义指令
 */

import { createEffect } from "../effect.ts";
import { isSignalGetter } from "../signal.ts";
import { type ElementWithViewData, isDOMEnvironment } from "../types.ts";
import {
  applyDirectives,
  getVShowValue,
  hasDirective,
  isDirectiveProp,
} from "../directive.ts";
import { registerDirectiveUnmount } from "./unmount.ts";

/** 应用 ref：支持回调 (el) => void 与 Ref 对象 { current } */
function applyRef(el: Element, ref: unknown): void {
  if (ref == null) return;
  if (typeof ref === "function") {
    (ref as (el: Element) => void)(el);
    return;
  }
  if (typeof ref === "object" && "current" in ref) {
    (ref as { current: Element | null }).current = el;
  }
}

/** v-show 等“求值 + 应用到 DOM”的指令，可选按函数追踪以 createEffect */
function applyBoundDirective(
  el: Element,
  props: Record<string, unknown>,
  camel: string,
  kebab: string,
  getValue: (p: Record<string, unknown>) => unknown,
  setter: (el: Element, v: unknown) => void,
  trackFunction?: boolean,
): void {
  if (!hasDirective(props, camel)) return;
  const raw = props[camel] ?? props[kebab];
  const apply = () => setter(el, getValue(props));
  if (isSignalGetter(raw) || (trackFunction && typeof raw === "function")) {
    createEffect(apply);
  } else {
    apply();
  }
}

/** 向 DOM 元素应用 props（含 signal 绑定、ref、指令；指令类 key 不落为 attribute） */
export function applyProps(
  el: Element,
  props: Record<string, unknown>,
): void {
  if (!isDOMEnvironment()) return;

  applyBoundDirective(
    el,
    props,
    "vShow",
    "v-show",
    getVShowValue,
    (e, v) => ((e as HTMLElement).style.display = v ? "" : "none"),
  );

  // v-cloak：在元素上设置 data-view-cloak，供 CSS 隐藏未编译模板，hydrate 后由 runtime 移除
  if (hasDirective(props, "vCloak")) {
    el.setAttribute("data-view-cloak", "");
  }

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key") continue;
    if (isDirectiveProp(key)) continue;

    if (key === "ref") {
      if (isSignalGetter(value)) {
        createEffect(() => {
          const v = (value as () => unknown)();
          applyRef(el, v);
        });
      } else {
        // 普通函数即 ref 回调，直接 applyRef(el, value) 会令 value(el) 被调用
        applyRef(el, value);
      }
      continue;
    }

    // dangerouslySetInnerHTML：原始 HTML 注入，仅限信任内容，禁止未 sanitize 用户输入
    if (
      key === "dangerouslySetInnerHTML" && value != null &&
      typeof value === "object"
    ) {
      const inner = (value as { __html?: string }).__html;
      if (inner != null) {
        (el as HTMLElement).innerHTML = inner;
      }
      continue;
    }

    if (isSignalGetter(value)) {
      createEffect(() => {
        applySingleProp(el, key, (value as () => unknown)());
      });
      continue;
    }
    // value 支持两种写法：value={value} 直接应用（走下方 applySingleProp）；value={() => value} 在 effect 中求值、细粒度更新
    if (key === "value" && typeof value === "function") {
      createEffect(() => {
        applySingleProp(el, key, (value as () => unknown)());
      });
      continue;
    }
    // checked 支持两种写法：checked={bool} 直接应用；checked={() => bool} 在 effect 中求值、细粒度更新
    if (key === "checked" && typeof value === "function") {
      createEffect(() => {
        applySingleProp(el, key, (value as () => unknown)());
      });
      continue;
    }

    // 直接传值（含 value={value}、checked={bool}）：应用一次；若 value 来自响应式读取则根会订阅
    applySingleProp(el, key, value);
  }
  applyDirectives(el, props, createEffect, registerDirectiveUnmount);
}

/** 存在元素上的事件监听器 key 前缀，用于替换时 remove 旧监听 */
const VIEW_EVENT_KEY_PREFIX = "__view$on:";

/**
 * 判断当前获得焦点的是否为指定表单元素（或其内部元素）。
 * 用于在应用 value 时跳过正在编辑的输入框，避免重渲染覆盖用户输入。
 */
function isFocusedFormElement(el: Element): boolean {
  if (typeof globalThis.document === "undefined") return false;
  const active = globalThis.document.activeElement;
  if (!active) return false;
  return active === el || el.contains(active);
}

/**
 * 设置单个 prop：事件、className、style、布尔/表单属性、通用 attribute
 * 事件使用 addEventListener 绑定，避免部分环境下直接赋 on* 不生效（如动态创建节点、某些 CSP）
 */
function applySingleProp(el: Element, key: string, value: unknown): void {
  const viewEl = el as ElementWithViewData;
  if (key.startsWith("on") && key.length > 2) {
    const event = key.slice(2).toLowerCase();
    const storageKey = VIEW_EVENT_KEY_PREFIX + event;
    const prev = viewEl[storageKey] as ((e: Event) => void) | undefined;
    if (typeof prev === "function") {
      el.removeEventListener(event, prev);
      viewEl[storageKey] = undefined;
    }
    if (typeof value === "function") {
      const fn = value as (e: Event) => void;
      viewEl[storageKey] = fn;
      el.addEventListener(event, fn);
    }
    return;
  }
  if (key === "className") {
    const classVal = value == null ? "" : String(value);
    // SVG 元素的 className 为只读（SVGAnimatedString），必须用 setAttribute
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      el.setAttribute("class", classVal);
    } else {
      (el as HTMLElement).className = classVal;
    }
    return;
  }
  if (key === "style" && value != null) {
    const style = (el as HTMLElement).style;
    if (typeof value === "string") {
      style.cssText = value;
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        (style as unknown as Record<string, string>)[k] = v == null
          ? ""
          : String(v);
      }
    }
    return;
  }
  // innerHTML 作为普通 prop：原始 HTML 注入，仅限信任内容，禁止未 sanitize 用户输入
  if (key === "innerHTML") {
    (el as HTMLElement).innerHTML = value == null ? "" : String(value);
    return;
  }
  if (value == null || value === false) {
    el.removeAttribute(key);
    if (
      key === "disabled" || key === "readOnly" || key === "multiple" ||
      key === "selected" || key === "checked"
    ) {
      viewEl[key] = false;
    }
    return;
  }
  if (value === true) {
    el.setAttribute(key, "");
    if (
      key === "disabled" || key === "readOnly" || key === "multiple" ||
      key === "selected" || key === "checked"
    ) {
      viewEl[key] = true;
    }
    return;
  }
  const str = String(value);
  if (key === "value") {
    const formEl = el as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    if (isFocusedFormElement(el)) return;
    formEl.value = str;
    return;
  }
  if (key === "checked" || key === "selected") {
    viewEl[key] = Boolean(value);
    el.setAttribute(key, str);
    return;
  }
  if (key === "disabled" || key === "readOnly" || key === "multiple") {
    viewEl[key] = Boolean(value);
  }
  const attrName = key === "htmlFor" ? "for" : key;
  el.setAttribute(attrName, str);
}
