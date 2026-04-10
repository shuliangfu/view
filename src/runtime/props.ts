/**
 * @module runtime/props
 * @description 处理 DOM 属性、特性、样式以及事件绑定。
 *
 * **支持的功能：**
 * - ✅ setAttribute() - 设置 DOM 属性
 * - ✅ setProperty() - 设置 DOM 属性 (property)
 * - ✅ spread() - 展开 props 对象
 * - ✅ 事件委托 (delegateHandler) - 全局事件处理
 * - ✅ 样式处理（style 对象 / cssText；对象写入时会移除上次有、本次未出现的键）
 * - ✅ XSS 防护 (危险 HTML 处理)
 *
 * **核心机制：**
 * - 事件委托优化性能
 * - 属性 vs 特性 (attribute vs property) 的正确处理
 * - 委托事件直接调用用户 handler，刷新由 notify/schedule 合并（不在委托层包 batch）
 * - 响应式样式更新
 *
 * **有意不在本模块「一次做全」的能力（按需另立包或走编译期）：**
 * - **CSS-in-JS**：当前仅支持 `style` 为**普通对象**（逐项 `Object.assign` 到 `el.style`）或 **cssText 字符串**。
 *   伪类、媒体查询、`@keyframes`、主题 token 注入等通常需要**样式表**或**构建链**（Tailwind、PostCSS、独立 CSS-in-JS 库），不适合全部堆进 `setProperty`。
 * - **自定义指令**：类似 Vue `v-*` 需要**模板/编译器**与**运行时协议**配合，属于横向特性，不是单靠 `props.ts` 能「补一行就完成」。
 * - **大量动态属性的性能**：`spread` 对每个 key 调 `setProperty`；若值为函数会各自 `createRenderEffect` 订阅。
 *   整次 `spread` 包在 `batch()` 内，使本轮挂载触发的多个 `schedule` 合并为一次 flush，减少微任务与重复渲染。
 *
 * @usage
 * setProperty(el, "className", "active")
 * spread(el, { onClick: handler, style: { color: "red" } })
 */

import { createRenderEffect } from "../reactivity/effect.ts";
import { batch } from "../scheduler/batch.ts";
import { isObject } from "./utils.ts";

/** style 键 camelCase → kebab-case 的有界缓存，减轻热路径上重复正则替换 */
const STYLE_KEY_CSS_CACHE_MAX = 256;
const styleKeyToCssPropertyCache = new Map<string, string>();

/**
 * 将 JSX style 对象的键（camelCase）转为 `removeProperty` 使用的 CSS 属性名（kebab-case）。
 */
function styleObjectKeyToCssProperty(key: string): string {
  const hit = styleKeyToCssPropertyCache.get(key);
  if (hit !== undefined) return hit;
  const out = key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  if (styleKeyToCssPropertyCache.size >= STYLE_KEY_CSS_CACHE_MAX) {
    const first = styleKeyToCssPropertyCache.keys().next().value as string;
    styleKeyToCssPropertyCache.delete(first);
  }
  styleKeyToCssPropertyCache.set(key, out);
  return out;
}

/**
 * 记录最近一次以「对象」形式写入的内联 style 的键名；
 * 下次对象若省略某键则从元素 style 上移除，避免仅靠 `Object.assign` 残留旧声明。
 */
const lastStyleObjectKeys = new WeakMap<Element, string[]>();

/**
 * 委托命中节点作为「逻辑 currentTarget」：监听器挂在 `document` 上时，
 * 原生 `Event.currentTarget` 为 `document`，箭头函数里 `e.currentTarget.value` 会得到 `undefined`，
 * 受控 input 会把 signal 写成空并清空输入框。用 Proxy 覆盖 `currentTarget` 读属性。
 *
 * 事件方法（如 `preventDefault`）必须在**原始 Event** 上以正确 `this` 调用；若直接 `Reflect.get` 后
 * 经 Proxy 调用，`preventDefault` 对内建槽校验失败，`<form onSubmit={e => e.preventDefault()}>` 无效，页面仍会整页提交刷新。
 *
 * `Reflect.get` 的第三个参数须为**原生 target**：若传 Proxy（receiver），读 `e.target` 等内建 getter 会
 * `Illegal invocation`（form 里 `e.target.value` 即中招）。
 */
function delegateEventWithBindingTarget(
  e: Event,
  bindingEl: EventTarget,
): Event {
  return new Proxy(e, {
    get(target, prop, _receiver) {
      if (prop === "currentTarget") return bindingEl;
      const v = Reflect.get(target, prop, target);
      if (typeof v === "function") {
        return (v as (...a: unknown[]) => unknown).bind(target);
      }
      return v;
    },
  }) as Event;
}

/**
 * 委托事件处理器。
 * 使用全局委托以提高性能。
 *
 * 优先沿 `composedPath()` 查找带 `__on*` 的节点：在 Shadow DOM、或部分环境下
 * `e.target` 被重定向到宿主/非实际点击节点时，仅靠 `target + parentNode` 会漏掉
 * 内层已绑定委托句柄的元素，导致 onClick 等完全不触发。
 */
function delegateHandler(e: Event) {
  const name = `on${e.type}`;

  /** 从节点读取委托句柄（仅接受函数，避免误读原型链上的同名属性） */
  const readHandler = (
    node: unknown,
  ): ((this: unknown, ev: Event) => void) | null => {
    if (node == null || typeof node !== "object") return null;
    const h = (node as Record<string, unknown>)[`__${name}`];
    return typeof h === "function"
      ? (h as (this: unknown, ev: Event) => void)
      : null;
  };

  // 1) 标准路径：composedPath 从实际目标到根，与冒泡顺序一致，且能穿透 Shadow 等场景
  const path = typeof (e as Event & { composedPath?: () => EventTarget[] })
      .composedPath === "function"
    ? (e as Event & { composedPath: () => EventTarget[] }).composedPath()
    : null;

  if (path && path.length > 0) {
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const handler = readHandler(node);
      if (handler) {
        const ev = delegateEventWithBindingTarget(e, node);
        // 不在此处包 batch：由 notify/schedule 合并刷新。
        handler.call(node, ev);
        return;
      }
    }
    // 路径上无委托句柄：与旧行为一致，不再从 target 重复遍历（避免双触发）
    return;
  }

  // 2) 回退：无 composedPath 时沿用 target + parentNode 冒泡
  let el = e.target as any;
  while (el) {
    const handler = readHandler(el);
    if (handler) {
      const ev = delegateEventWithBindingTarget(e, el);
      handler.call(el, ev);
      return;
    }
    el = el.parentNode;
  }
}

const delegatedEvents = new Set<string>();

/**
 * 不冒泡到 `document` 的事件：仅用 `document.addEventListener` + 路径查找无法命中子节点上的 `__on*`。
 * 典型为 `mouseenter` / `mouseleave`（与 React 等框架需用 `mouseover` 或直连监听同理）。
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseenter_event#event_bubbling
 */
const NON_BUBBLING_DIRECT_EVENT_NAMES = new Set([
  "mouseenter",
  "mouseleave",
  "pointerenter",
  "pointerleave",
]);

/** 直连监听器的元素字段前缀（用于 `removeEventListener` 与更新时摘除旧监听） */
const DIRECT_EVENT_WRAPPER_PREFIX = "__dreamerDirect_";

/**
 * 清空事件委托表（SSR 每次安装临时 `document` 前调用，避免跨请求污染）。
 * @returns `void`
 */
export function resetEventDelegationForSSR(): void {
  delegatedEvents.clear();
}

/**
 * 为元素设置属性、事件或样式；函数值会包一层 `createRenderEffect` 做响应式绑定（`on*` 除外）。
 * @param el 目标元素（含 SVG）
 * @param name 属性名；`children`/`ref` 忽略；`innerHTML`/`outerHTML` 拒绝写入
 * @param value 标量、对象 style、或 getter 函数
 * @returns `void`
 */
export function setProperty(el: any, name: string, value: any) {
  // 0. 忽略特殊属性 (children, ref 等由编译器或特定逻辑处理)
  if (name === "children" || name === "ref") return;

  // 安全审计：禁止直接通过 props 设置 innerHTML / outerHTML 以防止 XSS。
  // 如果确有需要，用户应直接操作 DOM 节点。
  if (name === "innerHTML" || name === "outerHTML") {
    console.warn(
      `[Security] Direct setting of "${name}" through props is prohibited.`,
    );
    return;
  }

  // 1. 处理事件绑定 (必须在处理响应式函数之前)
  if (name.startsWith("on")) {
    const eventName = name.slice(2).toLowerCase();

    if (NON_BUBBLING_DIRECT_EVENT_NAMES.has(eventName)) {
      const wrapperKey = `${DIRECT_EVENT_WRAPPER_PREFIX}${eventName}`;
      const prevWrapped = el[wrapperKey] as
        | ((this: unknown, ev: Event) => void)
        | undefined;
      if (prevWrapped) {
        el.removeEventListener(eventName, prevWrapped as EventListener);
        delete el[wrapperKey];
      }
      delete el[`__on${eventName}`];

      if (value == null || value === false) {
        return;
      }
      if (typeof value !== "function") {
        return;
      }
      const wrapped = function (this: unknown, e: Event) {
        (value as (this: unknown, ev: Event) => void).call(el, e);
      };
      el[wrapperKey] = wrapped;
      el.addEventListener(eventName, wrapped as EventListener);
      return;
    }

    el[`__on${eventName}`] = value;
    if (!delegatedEvents.has(eventName)) {
      document.addEventListener(eventName, delegateHandler);
      delegatedEvents.add(eventName);
    }
    return;
  }

  // 2. 自动解包响应式函数 (Signal 或普通函数)
  // 如果属性值是函数且不是事件处理器，则自动订阅并应用更新
  if (typeof value === "function") {
    createRenderEffect(() => {
      setProperty(el, name, value());
    });
    return;
  }

  const isSVG = el.namespaceURI === "http://www.w3.org/2000/svg";

  // 3. 处理特殊的 className / class (这里的 value 已经是解包后的值)
  if (name === "className" || name === "class") {
    if (isSVG) {
      el.setAttribute("class", value || "");
    } else {
      el.className = value || "";
    }
    return;
  }

  // 4. 处理 Style
  if (name === "style") {
    if (isObject(value)) {
      const record = value as Record<string, unknown>;
      const nextKeys = Object.keys(record);
      const prevKeys = lastStyleObjectKeys.get(el);
      if (prevKeys) {
        for (let i = 0; i < prevKeys.length; i++) {
          const k = prevKeys[i]!;
          if (!Object.prototype.hasOwnProperty.call(record, k)) {
            el.style.removeProperty(styleObjectKeyToCssProperty(k));
          }
        }
      }
      Object.assign(el.style, value);
      lastStyleObjectKeys.set(el, nextKeys);
    } else {
      lastStyleObjectKeys.delete(el);
      el.style.cssText = value || "";
    }
    return;
  }

  // 5. 处理普通属性
  if (name in el && !isSVG) {
    // 焦点稳定性优化：对于 value 和 checked，仅在值变化时才赋值
    if (name === "value" || name === "checked") {
      // null/undefined 赋给 input.value 会变成字符串 "undefined"/"null"，受控输入会异常
      const next = name === "value" ? (value == null ? "" : value) : value;
      if (el[name] !== next) (el as any)[name] = next;
    } else {
      /**
       * `id` / `name` / `for` 等未传 props 时常为 `undefined`；直接写 `el.id = undefined`
       * 在浏览器里会变成**字面量** `"undefined"`，DevTools 里可见且破坏 label 关联与表单语义。
       * 未传时应移除对应 HTML 特性（与下方 `setAttribute` 分支对 `null` 的行为一致）。
       */
      if (value === null || value === undefined) {
        try {
          (el as Element).removeAttribute(name);
        } catch {
          /* 部分属性在特定元素上不可 remove，忽略 */
        }
      } else {
        el[name] = value;
      }
    }
  } else {
    if (value == null) el.removeAttribute(name);
    else el.setAttribute(name, String(value));
  }
}

/**
 * 将 `props` 键值对依次交给 {@link setProperty}；整体包在 {@link batch} 内减少调度碎片。
 * @param el 目标元素
 * @param props 属性字典（可含 `children` 等由 `setProperty` 规则处理）
 * @returns `void`
 */
export function spread(el: Element, props: any) {
  batch(() => {
    for (const name in props) {
      setProperty(el, name, props[name]);
    }
  });
}

/**
 * {@link setProperty} 的别名，与编译器产出的 `setAttribute` 导入名对齐。
 */
export { setProperty as setAttribute };
