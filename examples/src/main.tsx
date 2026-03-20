/**
 * @dreamer/view 多页面示例 — 入口
 *
 * 根走 JSX 编译器：构建时对本文件（main.tsx）执行 compileSource，将下方的 return <App /> 编译为
 * return (parent) => { insert(parent, ...) }`，此处用 `mountWithRouter("#root", router, getRoot)` 绑定路由与根。
 * 自定义指令（如 v-focus）须在此处注册，与 mount 同包，避免懒加载页用到的 registry 与 applyDirectives 不一致。
 */

import { registerDirective } from "@dreamer/view/directive";
import { mountWithRouter, type Router } from "@dreamer/view/router";
import "./assets/global.css";
import { createAppRouter } from "./router/router.ts";
import { notFoundRoute, routes } from "./router/routers.tsx";
import { App } from "./views/_app.tsx";

registerDirective("v-focus", {
  mounted(el: Element) {
    const input = el as HTMLInputElement;
    // 若当前焦点已在其他输入类控件上，不抢焦点，避免整树替换重挂载时把正在输入的光标抢走
    const active = globalThis.document?.activeElement;
    if (
      active &&
      active !== el &&
      active instanceof HTMLElement &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
    ) {
      return;
    }
    input.focus();
  },
});

/** 点击复制 binding.value 或元素文本到剪贴板；unmounted 时移除监听 */
registerDirective("v-copy", {
  mounted(el: Element, binding: { value?: unknown }) {
    const handler = () => {
      const v = binding.value;
      const text = v != null && v !== true
        ? String(v)
        : (el.textContent ?? "").trim();
      if (typeof navigator?.clipboard?.writeText === "function") {
        navigator.clipboard.writeText(text).then(
          () => {
            const span = globalThis.document?.createElement("span");
            if (span) {
              span.textContent = " 已复制";
              span.setAttribute("aria-live", "polite");
              el.appendChild(span);
              setTimeout(() => span.remove(), 800);
            }
          },
          () => {},
        );
      }
    };
    (el as Element & { _viewCopyHandler?: () => void })._viewCopyHandler =
      handler;
    el.addEventListener("click", handler);
  },
  unmounted(el: Element) {
    const h = (el as Element & { _viewCopyHandler?: () => void })
      ._viewCopyHandler;
    if (h) el.removeEventListener("click", h);
  },
});

/**
 * 编译后：getRoot(router) 返回 (parent: Element) => void，内部为 insert(parent, getter)。
 * 构建时 compileSource 仅替换本函数内的 return <App ... /> 为 return (parent) => { insert(parent, ...) }。
 */
function getRoot(router: Router) {
  return <App router={router} />;
}

const router = createAppRouter({ routes, notFound: notFoundRoute });

/** 根挂载由框架 `mountWithRouter` 处理：路由订阅、同键去重、指令卸载与整树重挂 */
mountWithRouter("#root", router, (r) => getRoot(r), { noopIfNotFound: true });
