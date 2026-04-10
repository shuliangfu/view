/**
 * @module jsx-runtime
 * @description 为 @dreamer/view 提供 JSX 运行时。
 * 采用全量 Thunk 模型：每一个 JSX 节点都返回一个延迟评估的函数，以确保执行时 Owner 链条的绝对可靠。
 */

import { createRenderEffect } from "./reactivity/effect.ts";
import {
  adoptChild,
  createOwner,
  getOwner,
  runWithOwner,
} from "./reactivity/owner.ts";
import { insert } from "./runtime/insert.ts";
import { setProperty } from "./runtime/props.ts";
import type {
  JSXElementType,
  JSXRenderable,
  RefObject,
  ViewRefObject,
  ViewTransparentProviderMeta,
  VNode,
} from "./types.ts";

/**
 * 将 JSX 元素编译为延迟求值的 {@link VNode}（Thunk）：执行时才创建 Owner、插入 DOM。
 * @param type 标签名字符串或组件函数
 * @param props 元素/组件属性（含 `children`、`ref` 等）
 * @param _key React 风格 key（当前运行时未用，保留签名兼容）
 * @returns `() => ...` 形态的虚拟节点
 */
export function jsx(
  type: JSXElementType,
  // 与 `JSXElementType` 中组件 props 一致，保留宽泛以便传入各组件声明的 props
  // deno-lint-ignore no-explicit-any
  props: any,
  _key?: string | number | null,
): VNode {
  // 返回一个 Thunk (延迟评估函数)
  return () => {
    const parent = getOwner();

    // 1. 处理函数组件 (Component)
    if (typeof type === "function") {
      // 透明组件（如 Provider）不创建新的 Owner，直接在当前作用域执行
      if ((type as ViewTransparentProviderMeta).__IS_TRANSPARENT_PROVIDER) {
        return type(props);
      }

      const owner = createOwner();
      if (parent) adoptChild(parent, owner);

      // 执行组件并传递 props
      return runWithOwner(owner, () => type(props));
    }

    // 2. 处理原生元素 (Host Element)
    const isSvg = type === "svg" || (typeof type === "string" && [
      "path",
      "circle",
      "rect",
      "line",
      "polyline",
      "polygon",
      "ellipse",
      "text",
      "g",
      "defs",
      "use",
      "stop",
      "linearGradient",
      "radialGradient",
      "mask",
      "filter",
      "clipPath",
      "marker",
      "pattern",
      "image",
      "tspan",
      "symbol",
      "feGaussianBlur",
      "feColorMatrix",
      "feOffset",
      "feBlend",
      "feComposite",
    ].includes(type));

    const el = isSvg
      ? document.createElementNS("http://www.w3.org/2000/svg", type)
      : document.createElement(type);

    if (props) {
      for (const name in props) {
        if (name === "children" || name === "key") continue;
        const value = props[name];

        if (name === "ref") {
          if (typeof value === "function") value(el);
          else if (value && typeof value === "object") {
            (value as ViewRefObject | RefObject<unknown>).current = el;
          }
          continue;
        }

        // 响应式属性绑定：先 value() 再交给 setProperty，避免 setProperty 对「函数 props」再包一层
        // createRenderEffect，否则受控 input 会与 batch/flush 时序打架，出现丢字、清空或下游文案不刷新。
        if (typeof value === "function" && !name.startsWith("on")) {
          createRenderEffect(() => {
            setProperty(el, name, value());
          });
        } else {
          setProperty(el, name, value);
        }
      }

      if (props.children !== undefined) {
        // 递归插入子节点
        insert(el, props.children);
      }
    }

    return el;
  };
}

/** 与 {@link jsx} 相同，满足 TS/打包器对 `jsxs`（多子）入口的解析。 */
export const jsxs = jsx;

/** 开发构建使用的 JSX 入口，行为同 {@link jsx}。 */
export const jsxDEV = jsx;

/**
 * 片段：直接返回 `children`，供编译器生成 `<></>` 或 `Fragment`。
 * @param props 仅使用 `children`
 * @returns 子节点原样（可为数组等）
 */
export function Fragment(props: {
  children?: JSXRenderable;
}): JSXRenderable {
  return props.children as JSXRenderable;
}

/** 与 `@dreamer/view` 主入口一致，便于仅从 `jsx-runtime` 拉 JSX 的项目直接使用 `createRef`。 */
export { createRef, getDocument } from "./runtime/dom.ts";

// --- JSX 类型定义 ---
// deno-lint-ignore no-namespace
export namespace JSX {
  /** 表达式/组件的返回类型，见 {@link JSXRenderable} */
  export type Element = JSXRenderable;
  /** 类组件极少使用；保留宽松以避免误报 */
  export type ElementClass = any;
  export interface ElementAttributesProperty {
    props: Record<PropertyKey, unknown>;
  }
  export interface ElementChildrenAttribute {
    children: Record<PropertyKey, unknown>;
  }
  /** 子节点：`Element` 已含原语与数组；额外允许 `true` 等与条件渲染常见写法 */
  export type Child = Element | boolean;
  export type Children = Child | Child[];
  export interface IntrinsicAttributes {
    key?: any;
    ref?: any;
  }
  type MaybeAccessor<T> = T | (() => T);

  export interface DOMAttributes<T> extends IntrinsicAttributes {
    /** 与 `insert` 一致；下游组件常出现 `unknown`/空对象插槽，过窄的 `Children` 会在 TS 下误报 */
    // deno-lint-ignore no-explicit-any
    children?: any;
    innerHTML?: MaybeAccessor<string>;
    innerText?: MaybeAccessor<string>;
    textContent?: MaybeAccessor<string>;
    [key: string]: any;
  }

  export interface HTMLAttributes<T> extends DOMAttributes<T> {
    id?: MaybeAccessor<string>;
    class?: MaybeAccessor<string | Record<string, boolean>>;
    className?: MaybeAccessor<string | Record<string, boolean>>;
    style?: MaybeAccessor<string | Partial<CSSStyleDeclaration> | any>;
    title?: MaybeAccessor<string>;
    lang?: MaybeAccessor<string>;
    [key: string]: any;
  }

  export interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
    href?: MaybeAccessor<string>;
    target?: MaybeAccessor<string>;
    download?: MaybeAccessor<any>;
    rel?: MaybeAccessor<string>;
  }

  export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    type?: MaybeAccessor<"button" | "submit" | "reset">;
    disabled?: MaybeAccessor<boolean>;
  }

  export interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    type?: MaybeAccessor<string>;
    value?: MaybeAccessor<any>;
    checked?: MaybeAccessor<boolean>;
    placeholder?: MaybeAccessor<string>;
  }

  export interface IntrinsicElements {
    header: HTMLAttributes<HTMLElement>;
    footer: HTMLAttributes<HTMLElement>;
    main: HTMLAttributes<HTMLElement>;
    section: HTMLAttributes<HTMLElement>;
    article: HTMLAttributes<HTMLElement>;
    aside: HTMLAttributes<HTMLElement>;
    nav: HTMLAttributes<HTMLElement>;
    div: HTMLAttributes<HTMLDivElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    ul: HTMLAttributes<HTMLUListElement>;
    li: HTMLAttributes<HTMLLIElement>;
    ol: HTMLAttributes<HTMLOListElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes<HTMLElement>;
    dd: HTMLAttributes<HTMLElement>;
    a: AnchorHTMLAttributes<HTMLAnchorElement>;
    button: ButtonHTMLAttributes<HTMLButtonElement>;
    input: InputHTMLAttributes<HTMLInputElement>;
    form: HTMLAttributes<HTMLFormElement>;
    label: HTMLAttributes<HTMLLabelElement>;
    img: HTMLAttributes<HTMLImageElement>;
    textarea: HTMLAttributes<HTMLTextAreaElement>;
    select: HTMLAttributes<HTMLSelectElement>;
    option: HTMLAttributes<HTMLOptionElement>;
    table: HTMLAttributes<HTMLTableElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    th: HTMLAttributes<HTMLTableCellElement>;
    td: HTMLAttributes<HTMLTableCellElement>;
    svg: any;
    path: any;
    circle: any;
    rect: any;
    line: any;
    polyline: any;
    polygon: any;
    ellipse: any;
    text: any;
    g: any;
    defs: any;
    use: any;
    symbol: any;
    [tagName: string]: any;
  }
}
