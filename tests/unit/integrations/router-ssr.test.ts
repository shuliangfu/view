/**
 * @fileoverview 路由 SSR 同构：parseRouterUrl、matchRoute、createRouter({url,ssr})、renderRouterToString。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  createRouter,
  matchRoute,
  parseRouterUrl,
  type RouteConfig,
} from "../../../src/mod.ts";
import {
  renderRouterToString,
  renderToString,
} from "../../../src/runtime/server.ts";
import { jsx } from "../../../src/jsx-runtime.ts";

describe("integrations/router SSR 同构", () => {
  it("parseRouterUrl：路径 / query / hash", () => {
    expect(parseRouterUrl("/user/1?x=2#h")).toEqual({
      pathname: "/user/1",
      search: "?x=2",
      hash: "#h",
    });
    expect(parseRouterUrl("https://example.com/a/b?q=1").pathname).toBe(
      "/a/b",
    );
  });

  it("matchRoute：动态段与 query 与 createRouter 一致", () => {
    const routes: RouteConfig[] = [
      { path: "/", component: () => null },
      { path: "/user/:id", component: () => null },
    ];
    const m = matchRoute(routes, "/user/42?tab=info");
    expect(m).not.toBeNull();
    expect(m!.params.id).toBe("42");
    expect(m!.query.tab).toBe("info");
    expect(m!.path).toBe("/user/42");
    expect(m!.pattern).toBe("/user/:id");
  });

  it("matchRoute：basePath 剥离后匹配", () => {
    const routes: RouteConfig[] = [
      { path: "/dash", component: () => null },
    ];
    const m = matchRoute(
      { routes, basePath: "/app" },
      "/app/dash",
    );
    expect(m?.path).toBe("/dash");
    expect(m?.pathname).toBe("/app/dash");
  });

  it("createRouter({ url, ssr: true })：match 反映初始 url，且可 render", () => {
    const Page = (p: { params?: Record<string, string> }) =>
      jsx("div", { id: "u", children: `id=${p.params?.id ?? ""}` });

    const router = createRouter({
      routes: [{ path: "/user/:id", component: Page }],
      url: "/user/7",
      ssr: true,
    });
    try {
      expect(router.match()?.params.id).toBe("7");
      const tree = router.render();
      // render 可能返回函数/节点
      expect(tree).toBeDefined();
    } finally {
      router.destroy();
    }
  });

  it("renderRouterToString：输出含页面文本", () => {
    const Home = () => jsx("div", { id: "home", children: "HomeSSR" });
    const User = (p: { params?: Record<string, string> }) =>
      jsx("div", {
        id: "user",
        children: `User-${p.params?.id ?? "?"}`,
      });

    const html = renderRouterToString({
      routes: [
        { path: "/", component: Home },
        { path: "/user/:id", component: User },
      ],
      url: "/user/99",
    });
    expect(html).toContain("User-99");
    expect(html).not.toContain("HomeSSR");
  });

  it("renderToString + createRouter(url) 手写同构", () => {
    const Box = () => jsx("span", { children: "ok-ssr" });
    const router = createRouter({
      routes: [{ path: "/", component: Box }],
      url: "/",
      ssr: true,
    });
    try {
      const html = renderToString(() => router.render());
      expect(html).toContain("ok-ssr");
    } finally {
      router.destroy();
    }
  });
});
