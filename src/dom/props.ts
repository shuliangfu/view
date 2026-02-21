/**
 * @module @dreamer/view/dom/props
 * @description
 * View 模板引擎 — 向 DOM 元素应用 props。含 signal 绑定、ref、v-show、事件、className、style、布尔/表单属性及自定义指令。
 *
 * **本模块导出：**
 * - `applyProps(el, props)`：向 DOM 元素应用 props（ref、事件、class、style、指令等）；事件仅存储 handler，不在此处 addEventListener
 * - `bindDeferredEventListeners(root)`：在节点入文档后对子树补绑事件，保证「先入文档再绑事件」
 */

import { KEY_VIEW_DEV } from "../constants.ts";
import {
  applyDirectives,
  getDirectiveValue,
  getVShowValue,
  hasDirective,
  isDirectiveProp,
} from "../directive.ts";
import { createEffect } from "../effect.ts";
import { getGlobal } from "../globals.ts";
import { isSignalGetter } from "../signal.ts";
import { type ElementWithViewData, isDOMEnvironment } from "../types.ts";
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

    // 表单 value：若为 getter/函数会 createEffect 并 continue，不会走到下方 applySingleProp，故「清空」时若 effect 已被 dispose 则永远不会写回 DOM
    if (key === "value") {
      const isGetter = isSignalGetter(value);
      const isFn = typeof value === "function";
      if (isGetter) {
        createEffect(() => {
          applySingleProp(el, key, (value as () => unknown)());
        });
        continue;
      }
      if (isFn) {
        createEffect(() => {
          applySingleProp(el, key, (value as () => unknown)());
        });
        continue;
      }
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

/** 存在元素上的事件监听器 key 前缀，用于替换时 remove 旧监听；延后绑定时用同一 key 存 handler，加此后缀表示已绑定到 DOM */
const VIEW_EVENT_KEY_PREFIX = "__view$on:";
const VIEW_EVENT_BOUND_SUFFIX = "_bound";

/** 开发环境下已对「传了 getter 却当静态值用」的 prop 做过一次性警告的 key 集合 */
const getterWarnedKeys = new Set<string>();

/**
 * 设置单个 prop：事件、className、style、布尔/表单属性、通用 attribute
 * 事件仅在此处存储 handler（__view$on:*），不在此处 addEventListener，由 bindDeferredEventListeners 在节点入文档后统一绑定，保证「先入文档再绑事件」顺序。
 */
function applySingleProp(el: Element, key: string, value: unknown): void {
  // 开发环境：若传入的是 signal getter 却在此处当静态值使用，提示应写 count() 而非 count，并本次用求值结果避免界面错乱（children 不经过 applySingleProp，不会误伤 pre 等动态子节点）
  if (getGlobal<boolean>(KEY_VIEW_DEV) && isSignalGetter(value)) {
    if (!getterWarnedKeys.has(key)) {
      getterWarnedKeys.add(key);
      console.warn(
        `[View] Prop "${key}" received a signal getter but was used as a static value. Call the getter in JSX (e.g. \`${key}={count()}\` instead of \`${key}={count}\`) so updates are reactive.`,
      );
    }
    value = getDirectiveValue(value);
  }
  const viewEl = el as ElementWithViewData;
  if (key.startsWith("on") && key.length > 2) {
    const event = key.slice(2).toLowerCase();
    const storageKey = VIEW_EVENT_KEY_PREFIX + event;
    const prev = viewEl[storageKey] as ((e: Event) => void) | undefined;
    if (typeof prev === "function") {
      el.removeEventListener(event, prev);
      viewEl[storageKey] = undefined;
      delete (viewEl as Record<string, unknown>)[
        storageKey + VIEW_EVENT_BOUND_SUFFIX
      ];
    }
    if (typeof value === "function") {
      (viewEl as Record<string, unknown>)[storageKey] = value;
      // 首次绑定由 bindDeferredEventListeners 在节点入文档后统一做；此处若为「更新 handler」且节点已在文档中，则立即绑定新 handler，否则 patch 后不会再次遍历，点击一次后即失效
      if (el.isConnected) {
        el.addEventListener(event, value as EventListener);
        (viewEl as Record<string, unknown>)[
          storageKey + VIEW_EVENT_BOUND_SUFFIX
        ] = true;
      }
    }
    return;
  }

  // class（HTML/经典 JSX）与 className（React 风格）统一落到 DOM 的 class；相同则跳过写以减少 reflow
  if (key === "class" || key === "className") {
    const classVal = value == null ? "" : String(value);
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      if (el.getAttribute("class") !== classVal) {
        el.setAttribute("class", classVal);
      }
    } else {
      const cur = (el as HTMLElement).className;
      if (cur !== classVal) (el as HTMLElement).className = classVal;
    }
    return;
  }

  if (key === "style" && value != null) {
    const style = (el as HTMLElement).style;
    if (typeof value === "string") {
      if (style.cssText !== value) style.cssText = value;
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const str = v == null ? "" : String(v);
        const cur = (style as unknown as Record<string, string>)[k];
        if (cur !== str) (style as unknown as Record<string, string>)[k] = str;
      }
    }
    return;
  }

  // innerHTML 作为普通 prop：原始 HTML 注入，仅限信任内容，禁止未 sanitize 用户输入
  if (key === "innerHTML") {
    (el as HTMLElement).innerHTML = value == null ? "" : String(value);
    return;
  }

  // 表单 value 必须在 value==null 判断之前处理：patch 时可能传入 undefined，若先走 removeAttribute 会 return，导致永远进不了下面的 key==="value" 分支，清空不生效；相同则跳过写
  if (key === "value") {
    const formEl = el as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    const str = value == null ? "" : String(value);
    if (formEl.value !== str) formEl.value = str;
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
  if (key === "checked" || key === "selected") {
    viewEl[key] = Boolean(value);
    if (el.getAttribute(key) !== str) el.setAttribute(key, str);
    return;
  }
  if (key === "disabled" || key === "readOnly" || key === "multiple") {
    viewEl[key] = Boolean(value);
  }
  const attrName = key === "htmlFor" ? "for" : key;
  if (el.getAttribute(attrName) !== str) el.setAttribute(attrName, str);
}

/**
 * 在节点已入文档后，对子树中带 __view$on:* 的元素补绑 addEventListener，实现「先入文档再绑事件」。
 * 在 createRoot 的 appendChild(mounted) 与 patchRoot 之后调用，避免首屏「先绑再插」导致点击不触发。
 *
 * @param root - 已挂载到 document 的根节点（Element 或 DocumentFragment）
 */
export function bindDeferredEventListeners(root: Node): void {
  if (!isDOMEnvironment()) return;
  if (root.nodeType === 1) {
    const el = root as Element;
    const viewEl = el as unknown as Record<string, unknown>;
    for (const key of Object.keys(viewEl)) {
      if (
        key.startsWith(VIEW_EVENT_KEY_PREFIX) &&
        !key.endsWith(VIEW_EVENT_BOUND_SUFFIX)
      ) {
        const fn = viewEl[key];
        if (typeof fn === "function") {
          const event = key.slice(VIEW_EVENT_KEY_PREFIX.length);
          el.addEventListener(event, fn as EventListener);
          viewEl[key + VIEW_EVENT_BOUND_SUFFIX] = true;
          if (event === "click" && el.setAttribute) {
            el.setAttribute("data-view-has-click", "1");
          }
        }
      }
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      bindDeferredEventListeners(el.childNodes[i]);
    }
  } else if (root.nodeType === 11) {
    const frag = root as DocumentFragment;
    for (let i = 0; i < frag.childNodes.length; i++) {
      bindDeferredEventListeners(frag.childNodes[i]);
    }
  }
}
