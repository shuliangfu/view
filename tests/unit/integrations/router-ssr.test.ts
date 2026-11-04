/**
 * @fileoverview 路由 SSR 同构：parseRouterUrl、matchRoute、createRouter({url,ssr})、renderRouterToString。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  createRouter,
  matchRoute,
  parseRouterUrl,
  type RouteConfig,
} from "../../../src/router.ts";
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

  it("matchRoute 与 createRouter.match 同构：splat / catch-all / notFound", () => {
    const Home = () => null;
    const Files = () => null;
    const NotFound = () => null;
    const routes: RouteConfig[] = [
      { path: "/", component: Home },
      { path: "/files/*", component: Files },
    ];
    const opts = { routes, notFound: { path: "*", component: NotFound } };

    const cases = [
      "/files/a/b?x=1",
      "/missing-page",
      "/",
    ];
    for (const url of cases) {
      const pure = matchRoute(opts, url);
      const router = createRouter({ ...opts, url, ssr: true });
      try {
        const live = router.match();
        expect(live?.path).toBe(pure?.path);
        expect(live?.pattern).toBe(pure?.pattern);
        expect(live?.params).toEqual(pure?.params);
        expect(live?.query).toEqual(pure?.query);
        expect(live?.pathname).toBe(pure?.pathname);
      } finally {
        router.destroy();
      }
    }

    const splat = matchRoute(opts, "/files/docs/readme.md");
    expect(splat?.params["*"]).toBe("docs/readme.md");
    expect(splat?.pattern).toBe("/files/*");
  });

  it("ssr: true 下 start() 可在 hydrate 后显式挂载监听（行为可测）", () => {
    const Page = () => jsx("div", { children: "ssr-start" });
    const router = createRouter({
      routes: [{ path: "/", component: Page }],
      url: "/",
      ssr: true,
    });
    try {
      expect(router.match()?.path).toBe("/");
      // start 不应抛；SSR 创建时未挂委托，hydrate 后可显式开启
      expect(() => router.start()).not.toThrow();
      expect(() => router.stop()).not.toThrow();
    } finally {
      router.destroy();
    }
  });

  it("renderRouterToString 与 matchRoute 对同一 url 指向同一 pattern", () => {
    const Home = () => jsx("div", { children: "H" });
    const User = (p: { params?: Record<string, string> }) =>
      jsx("div", { children: `U-${p.params?.id ?? ""}` });
    const routes: RouteConfig[] = [
      { path: "/", component: Home },
      { path: "/user/:id", component: User },
    ];
    const url = "/user/3?tab=bio#top";
    const m = matchRoute(routes, url);
    expect(m?.pattern).toBe("/user/:id");
    expect(m?.params.id).toBe("3");
    expect(m?.query.tab).toBe("bio");
    const html = renderRouterToString({ routes, url });
    expect(html).toContain("U-3");
    expect(html).not.toContain(">H<");
  });
});
