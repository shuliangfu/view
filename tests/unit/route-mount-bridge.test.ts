/**
 * @fileoverview route-mount-bridge：VNode 与 MountFn 统一为路由可挂载函数
 */

import "../dom-setup.ts";
import "../../src/compiler/mod.ts";
import { describe, expect, it } from "@dreamer/test";
import { jsx } from "@dreamer/view/jsx-runtime";
import {
  coerceToMountFn,
  composePageWithLayouts,
  pageDefaultToMountFn,
} from "../../src/route-mount-bridge.ts";
import type { MountFn } from "../../src/router.ts";

describe("route-mount-bridge", () => {
  it("coerceToMountFn 应透传 MountFn", () => {
    const mf: MountFn = (p) => {
      const s = document.createElement("span");
      s.textContent = "m";
      p.appendChild(s);
    };
    const out = coerceToMountFn(mf);
    expect(out).toBe(mf);
  });

  it("coerceToMountFn 应将 VNode 包成 MountFn", () => {
    const el = document.createElement("div");
    const tree = jsx("span", { children: "vn" });
    coerceToMountFn(tree)(el);
    expect(el.querySelector("span")?.textContent).toBe("vn");
  });

  it("pageDefaultToMountFn 应对 default(match)=>VNode 生效", () => {
    const el = document.createElement("div");
    const Page = () => jsx("p", { children: "page" });
    const mf = pageDefaultToMountFn(Page as (m?: unknown) => unknown, {});
    mf(el);
    expect(el.querySelector("p")?.textContent).toBe("page");
  });

  it("composePageWithLayouts 应支持布局返回 VNode 且 children 为 MountFn", () => {
    const el = document.createElement("div");
    const Page = () => jsx("i", { children: "in" });
    const Layout = (props: { children: MountFn }) =>
      jsx("div", {
        className: "wrap",
        children: props.children,
      });
    const layoutMod = {
      default: (props: { children: MountFn }) => Layout(props),
    };
    const mf = composePageWithLayouts(
      Page as (m?: unknown) => unknown,
      {},
      [layoutMod],
    );
    mf(el);
    const wrap = el.querySelector("div.wrap");
    expect(wrap).not.toBeNull();
    expect(wrap?.querySelector("i")?.textContent).toBe("in");
  });
}, { sanitizeOps: false, sanitizeResources: false });
