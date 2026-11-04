/**
 * @module integrations/router/link
 * @description {@link Link} and {@link mountWithRouter}.
 */

import { mount } from "../../runtime/browser.ts";
import { jsx } from "../../jsx-runtime.ts";
import type { VNode } from "../../types.ts";
import { useRouter } from "./history.ts";
import type { Router } from "./types.ts";

/**
 * 客户端路由链接：`href` 经 `resolveHref` 解析，`click` 默认 `preventDefault` 并 `navigate`/`replace`。
 * @param props 与 `a` 类似，支持 `href`、`replace`、`class`/`className` 等
 * @returns {@link VNode}
 */
export function Link(props: any): VNode {
  const {
    href,
    children,
    class: className,
    className: className2,
    replace: useReplace,
    ...rest
  } = props;
  let fullHref = href;
  try {
    fullHref = href ? useRouter().resolveHref(href) : href;
  } catch {
    /* 无 router 时退回原始 href */
  }
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    if (href) {
      try {
        const r = useRouter();
        void (useReplace ? r.replace(href) : r.navigate(href));
      } catch {
        /* ignore */
      }
    }
  };
  return jsx("a", {
    href: fullHref,
    onClick: handleClick,
    className: className || className2,
    "data-view-link": true,
    ...rest,
    children: children,
  });
}

/**
 * 在 DOM Ready 后把 `router.render()` 挂到指定容器（CSS 选择器或元素）。
 * @param selector 容器选择器或元素节点
 * @param router 已创建的 {@link Router}
 * @returns `void`
 */
export function mountWithRouter(
  selector: string | HTMLElement,
  router: Router,
) {
  const performMount = () => {
    const container = typeof selector === "string"
      ? document.querySelector(selector)
      : selector;
    if (!container) return;

    mount(() => () => router.render(), container as HTMLElement);
  };

  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", performMount);
  } else {
    performMount();
  }
}
