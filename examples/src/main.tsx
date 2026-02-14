/**
 * @dreamer/view 多页面示例 — 入口
 *
 * 从 router/router 创建带拦截与守卫的应用路由，
 * createRoot 根组件订阅路由并渲染当前页。
 * 自定义指令（如 v-focus）须在此处注册，与 createRoot 同包，避免懒加载页用到的 registry 与 applyDirectives 不一致。
 */

import { createRoot } from "@dreamer/view";
import { registerDirective } from "@dreamer/view/directive";
import { createAppRouter } from "./router/router.ts";
import { App } from "./views/_app.tsx";
import { notFoundRoute, routes } from "./router/routers.tsx";

registerDirective("v-focus", {
  mounted(el: Element) {
    (el as HTMLInputElement).focus();
  },
});

/** 点击复制 binding.value 或元素文本到剪贴板；unmounted 时移除监听 */
registerDirective("v-copy", {
  mounted(el: Element, binding: { value?: unknown }) {
    const handler = () => {
      const v = binding.value;
      const text =
        v != null && v !== true
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

const container = document.getElementById("root");
if (container) {
  const router = createAppRouter({ routes, notFound: notFoundRoute });
  createRoot(() => <App router={router} />, container);
  container.removeAttribute("data-view-cloak");
}
