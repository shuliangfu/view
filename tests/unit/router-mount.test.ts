/**
 * @fileoverview mountWithRouter：订阅路由 signal，导航后根容器内容与当前路由一致。
 */

import "../dom-setup.ts";
import { afterEach, describe, expect, it } from "@dreamer/test";
import type { MountFn, Router } from "@dreamer/view/router";
import {
  createRouter,
  mountWithRouter,
  type RouteConfig,
  type RouteMatch,
} from "@dreamer/view/router";

/** 在父节点下挂载一段可识别的文本 */
function mountText(text: string): MountFn {
  return (parent) => {
    const node = globalThis.document?.createTextNode(text);
    if (node) parent.appendChild(node);
  };
}

const routes: RouteConfig[] = [
  { path: "/", component: () => mountText("Home") },
  { path: "/about", component: () => mountText("About") },
  {
    path: "/user/:id",
    component: (m: RouteMatch) => mountText(`User:${m.params.id}`),
  },
];

/**
 * 与示例中 `getRoot(router)` 等价的最小同步实现：按当前 match 调用 `component(match)` 得到 MountFn 并执行。
 *
 * @param router - 路由器实例
 * @returns 在父节点上挂载当前路由内容的 `(parent)=>void`
 */
function syncRootFromRouter(router: Router): MountFn {
  return (parent) => {
    const match = router.getCurrentRouteSignal()();
    if (match == null) return;
    const mountPage = match.component(match);
    if (typeof mountPage === "function") {
      mountPage(parent);
    }
  };
}

describe("mountWithRouter", () => {
  let root: HTMLDivElement;

  afterEach(() => {
    root?.remove();
  });

  it("挂载后容器文本随 navigate 更新", async () => {
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: { pushState: (a: unknown, b: string, c: string) => void };
    };
    const origLocation = g.location;
    const origHistory = g.history;
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      /** 与 router 单测一致：pushState 时同步 pathname，否则 getCurrentRoute 读到的仍是旧地址 */
      g.history = {
        pushState(_a: unknown, _b: string, url: string) {
          try {
            const u = new URL(url);
            if (g.location) {
              g.location.pathname = u.pathname;
              g.location.search = u.search ?? "";
            }
          } catch {
            /* 无效 url 时忽略 */
          }
        },
      };

      root = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(root);

      const router = createRouter({ routes });
      await router.navigate("/");
      mountWithRouter(root, router, syncRootFromRouter, {});

      expect(root.textContent).toBe("Home");

      await router.navigate("/about");
      expect(root.textContent).toBe("About");

      await router.navigate("/user/42");
      expect(root.textContent).toBe("User:42");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });
}, { sanitizeOps: false, sanitizeResources: false });
