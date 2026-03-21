/**
 * @fileoverview RoutePage：同步 component、错误态、占位与 showLoading。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import type { MountFn, RouteMatch, Router } from "@dreamer/view/router";
import { RoutePage } from "@dreamer/view/router";

/** 仅占位：RoutePage 会把 router 放进 match，单测不调用导航 */
const fakeRouter = {} as Router;

function baseMatch(
  path: string,
  component: RouteMatch["component"],
  extra?: Partial<RouteMatch>,
): RouteMatch {
  return {
    path,
    params: {},
    query: {},
    fullPath: path,
    component,
    ...extra,
  };
}

describe("RoutePage", () => {
  it("同步 component 返回 MountFn 时应挂载页面内容", async () => {
    const path = "/__unit_rp_sync_1";
    const mount = RoutePage({
      match: baseMatch(path, () =>
        ((parent: Node) => {
          const s = document.createElement("span");
          s.textContent = "page-ok";
          s.setAttribute("data-rp", "1");
          parent.appendChild(s);
        }) as MountFn),
      router: fakeRouter,
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    try {
      mount(root);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(root.querySelector("[data-rp='1']")?.textContent).toBe("page-ok");
    } finally {
      root.remove();
    }
  });

  it("component 抛错时应展示错误区与重试按钮", async () => {
    const path = "/__unit_rp_err_1";
    const mount = RoutePage({
      match: baseMatch(
        path,
        () => {
          throw new Error("load-boom");
        },
      ),
      router: fakeRouter,
      labels: { errorTitle: "E", retryText: "R", loadingText: "L" },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    try {
      mount(root);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(root.textContent).toContain("load-boom");
      const btn = root.querySelector("button");
      expect(btn?.getAttribute("type")).toBe("button");
      expect(btn?.textContent).toBe("R");
    } finally {
      root.remove();
    }
  });

  it("showLoading true 且未就绪时应出现加载文案", async () => {
    const path = "/__unit_rp_loading_1";
    let resolveMod!: (m: unknown) => void;
    const p = new Promise<unknown>((r) => {
      resolveMod = r;
    });
    const mount = RoutePage({
      match: baseMatch(path, () => p as unknown as MountFn),
      router: fakeRouter,
      showLoading: true,
      labels: { loadingText: "PleaseWait" },
    });
    const root = document.createElement("div");
    document.body.appendChild(root);
    try {
      mount(root);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(root.textContent).toContain("PleaseWait");
      resolveMod({
        default: () => (parent: Node) => {
          parent.appendChild(document.createTextNode("done"));
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(root.textContent).toContain("done");
    } finally {
      root.remove();
    }
  });
}, { sanitizeOps: false, sanitizeResources: false });
