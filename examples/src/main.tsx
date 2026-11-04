/**
 * @dreamer/view 现代架构多页面示例 — 入口
 * 全面转向自动化 jsx-runtime 与统一导入路径。
 */

import { insert } from "@dreamer/view/csr";
import { createRouter, mountWithRouter } from "@dreamer/view/router";
import { routerBeforeEach } from "./router/router.ts";
import { notFoundRoute, routes } from "./router/routers.tsx";
import "./assets/global.css";

/**
 * 现代架构下的路由初始化：`notFound` 独立配置；`scroll: "top"` 在导航后滚回顶部；
 * `beforeEach` 演示全局卫士（控制台打印 to/from，可按 /route-guard 页开关拦截 /form）。
 */
const router = createRouter({
  routes: [...routes],
  notFound: notFoundRoute,
  scroll: "top",
  beforeEach: routerBeforeEach,
});

const isViewDev = (globalThis as { VIEW_DEV?: boolean }).VIEW_DEV === true;

/** Clear cloak + children (mirrors runtime/browser `mount`). */
function prepareRoot(container: HTMLElement): void {
  container.textContent = "";
  container.removeAttribute("data-view-cloak");
  container.style.display = "";
}

/**
 * DEV dogfood: mount via {@link createRootTracked} so DevTools 「树」sees a real
 * Owner root (plain `mountWithRouter` → `createRoot` does not auto-track).
 * `createRootTracked` also installs Owner→DOM tracking under `VIEW_DEV` before
 * the first paint, so a Tree click can outline the matching elements.
 * Production / non-VIEW_DEV keeps `mountWithRouter` unchanged.
 */
function mountExamplesApp(): void {
  const runTracked = async () => {
    const container = document.querySelector("#root") as HTMLElement | null;
    if (!container) return;

    const { createRootTracked } = await import("@dreamer/view/devtools");
    const { mountDevtoolsOverlay } = await import(
      "@dreamer/view/devtools/overlay"
    );

    createRootTracked(() => {
      prepareRoot(container);
      // Same shape as mountWithRouter → mount(() => () => router.render(), …)
      insert(container, () => router.render());
    });

    mountDevtoolsOverlay({ corner: "bottom-left" });
  };

  if (isViewDev) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        void runTracked();
      });
    } else {
      void runTracked();
    }
    return;
  }

  mountWithRouter("#root", router);
}

mountExamplesApp();
