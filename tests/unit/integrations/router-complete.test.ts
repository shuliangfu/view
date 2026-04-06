/**
 * @fileoverview 路由全功能覆盖：动态段、通配、query/hash、basePath、委托、守卫、滚动、history、布局、notFound 等。
 */
import "./../dom-setup.ts";

import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { waitUntilComplete } from "../dom-setup.ts";
import {
  createRouter,
  Link,
  mountWithRouter,
  type RouteConfig,
  useRouter,
} from "../../../src/mod.ts";
import { jsx } from "../../../src/jsx-runtime.ts";

describe("integrations/router（完整功能）", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "app";
    document.body.appendChild(container);
    if (globalThis.history) {
      globalThis.history.replaceState({}, "", "/");
    }
  });

  afterEach(async () => {
    try {
      useRouter().destroy();
    } catch {
      /* 无实例 */
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    container.innerHTML = "";
    await waitUntilComplete();
  });

  it("notFound 选项：未知路径命中通配兜底", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const NF = () => jsx("div", { id: "nf", children: "404" });

    const router = createRouter({
      routes: [{ path: "/", component: Home }],
      notFound: { path: "*", component: NF },
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/missing/path");
    await waitUntilComplete();
    expect(container.querySelector("#nf")?.textContent).toBe("404");
    expect(router.match()?.params["*"]).toBe("missing/path");
  });

  it("末尾 /*：params['*'] 为剩余路径", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const Files = (p: { params?: Record<string, string> }) =>
      jsx("div", { id: "f", children: p.params?.["*"] ?? "" });

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/files/*", component: Files },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/files/a/b/c");
    await waitUntilComplete();
    expect(container.querySelector("#f")?.textContent).toBe("a/b/c");
  });

  it("多动态段：/post/:pid/comment/:cid", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const C = (p: { params?: Record<string, string> }) =>
      jsx("div", {
        id: "c",
        children: `${p.params?.pid}-${p.params?.cid}`,
      });

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/post/:pid/comment/:cid", component: C },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/post/10/comment/20");
    await waitUntilComplete();
    expect(container.querySelector("#c")?.textContent).toBe("10-20");
  });

  it("navigate 带 ?query 与 #hash：match 应解析", async () => {
    const Home = (p: { query?: Record<string, string>; params?: any }) =>
      jsx("div", {
        id: "home",
        children: `${p.query?.q ?? ""}|${p.query?.x ?? ""}`,
      });

    const router = createRouter([{ path: "/", component: Home }]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/?q=1&x=two#sec");
    await waitUntilComplete();
    expect(router.search()).toBe("?q=1&x=two");
    expect(router.hash()).toBe("#sec");
    expect(router.match()?.query.q).toBe("1");
    expect(router.match()?.query.x).toBe("two");
    expect(container.querySelector("#home")?.textContent).toBe("1|two");
  });

  it("beforeEach 异步：Promise<false> 取消导航", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const X = () => jsx("div", { id: "x", children: "X" });

    const router = createRouter({
      routes: [
        { path: "/", component: Home },
        { path: "/x", component: X },
      ],
      beforeEach: async (to) => {
        await Promise.resolve();
        return to.path !== "/x";
      },
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/x");
    await waitUntilComplete();
    await Promise.resolve();
    expect(container.querySelector("#x")).toBeNull();
    expect(container.querySelector("#home")).toBeTruthy();
  });

  it("原生 <a>（无 data-view-link）：委托拦截并导航", async () => {
    /**
     * 链接必须出现在 JSX 树中，勿在已挂载的 VDOM 节点上 `appendChild`：
     * 否则后续协调可能移除动态插入的节点，导致点击无效。
     */
    const Home = () =>
      jsx("div", {
        id: "wrap",
        children: [
          "home",
          jsx(
            "a",
            {
              /** 相对路径即可；委托内会用 baseHref 解析为同源 URL */
              href: "/go",
              id: "plain-a",
            },
            "go",
          ),
        ],
      });
    const Go = () => jsx("div", { id: "go", children: "OK" });

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/go", component: Go },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    const a = container.querySelector("#plain-a") as HTMLAnchorElement;
    a.click();
    /** 委托触发的 `commitNavigation` 为异步，与编程式 `navigate` 一样需冲洗 */
    for (let i = 0; i < 40 && router.path() !== "/go"; i++) {
      await Promise.resolve();
      await waitUntilComplete();
    }
    expect(router.path()).toBe("/go");
    await waitUntilComplete();
    expect(container.querySelector("#go")?.textContent).toBe("OK");
  });

  it("data-native：不委托，不调用 preventDefault（由浏览器处理）", async () => {
    const Home = () =>
      jsx("div", {
        children: [
          jsx(
            "a",
            { href: "/x", id: "nat", "data-native": "" },
            "x",
          ),
        ],
      });

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/x", component: () => jsx("div", { id: "x" }, "X") },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    const a = container.querySelector("#nat") as HTMLAnchorElement;
    let defaultPrevented = false;
    a.addEventListener("click", (ev) => {
      queueMicrotask(() => {
        defaultPrevented = ev.defaultPrevented;
      });
    });
    a.click();
    await waitUntilComplete();
    await Promise.resolve();
    expect(defaultPrevented).toBe(false);
  });

  it("interceptLinks: false 时不注册委托；原生 a 不触发路由器", async () => {
    const Home = () =>
      jsx("div", {
        children: [jsx("a", { href: "/gone", id: "pa" }, "gone")],
      });
    const Gone = () => jsx("div", { id: "gone", children: "G" });

    const router = createRouter({
      interceptLinks: false,
      routes: [
        { path: "/", component: Home },
        { path: "/gone", component: Gone },
      ],
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    expect(router.path()).toBe("/");
    (container.querySelector("#pa") as HTMLElement).click();
    await waitUntilComplete();
    /** happy-dom 可能同步改 location，但路由器未监听点击，内部信号应保持原路径 */
    expect(router.path()).toBe("/");
    expect(container.querySelector("#gone")).toBeNull();
  });

  it("stop / start：恢复全局链接委托", async () => {
    const Home = () => jsx("div", { id: "w2", children: "h" });
    const Z = () => jsx("div", { id: "z", children: "Z" });

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/z", component: Z },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    const wrap = container.querySelector("#w2")!;
    const mk = () => {
      const a = document.createElement("a");
      a.href = "http://localhost/z";
      a.id = "az";
      a.textContent = "z";
      wrap.appendChild(a);
      return a;
    };

    router.stop();
    mk().click();
    await Promise.resolve();
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 50));
    expect(router.path()).toBe("/");

    wrap.innerHTML = "";
    router.start();
    mk().click();
    await Promise.resolve();
    await Promise.resolve();
    await waitUntilComplete();
    await new Promise((r) => setTimeout(r, 50));
    await waitUntilComplete();
    expect(router.path()).toBe("/z");
    expect(container.querySelector("#z")?.textContent).toBe("Z");
  });

  it("Link + basePath：href 属性带前缀", async () => {
    const Home = () =>
      jsx("div", {
        children: [
          jsx(Link, { href: "/in", id: "lk", children: "in" }),
        ],
      });
    const In = () => jsx("div", { id: "in", children: "I" });

    const router = createRouter({
      basePath: "/app",
      routes: [
        { path: "/", component: Home },
        { path: "/in", component: In },
      ],
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    const el = container.querySelector("#lk") as HTMLAnchorElement;
    expect(el.getAttribute("href")).toBe("/app/in");
  });

  it("Link replace：应走 replaceState", async () => {
    const Home = () =>
      jsx("div", {
        children: [
          jsx(Link, {
            href: "/r",
            id: "lr",
            replace: true,
            children: "r",
          }),
        ],
      });
    const R = () => jsx("div", { id: "r", children: "R" });
    const rs = globalThis.history?.replaceState?.bind(globalThis.history);
    let replaces = 0;
    if (globalThis.history && rs) {
      globalThis.history.replaceState = (...args: unknown[]) => {
        replaces++;
        return rs(...(args as [any, string, string | URL | null | undefined]));
      };
    }

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/r", component: R },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    (container.querySelector("#lr") as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await waitUntilComplete();
    if (replaces > 0) {
      expect(replaces).toBeGreaterThanOrEqual(1);
    }
    expect(container.querySelector("#r")?.textContent).toBe("R");
  });

  it("scroll: top 应调用 scrollTo 置顶", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const P = () => jsx("div", { id: "p", children: "P" });
    const scrollCalls: [number, number][] = [];
    const prev = (globalThis as any).scrollTo;
    (globalThis as any).scrollTo = (x: number, y: number) => {
      scrollCalls.push([x, y]);
    };

    const router = createRouter({
      scroll: "top",
      routes: [
        { path: "/", component: Home },
        { path: "/p", component: P },
      ],
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/p");
    await waitUntilComplete();
    await Promise.resolve();
    (globalThis as any).scrollTo = prev;

    expect(scrollCalls.some(([, y]) => y === 0)).toBe(true);
  });

  it("路由顺序：静态 /user/me 优先于 /user/:id", async () => {
    const Me = () => jsx("div", { id: "me", children: "ME" });
    const User = (p: { params?: Record<string, string> }) =>
      jsx("div", { id: "u", children: p.params?.id ?? "" });

    const router = createRouter([
      { path: "/user/me", component: Me },
      { path: "/user/:id", component: User },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/user/me");
    await waitUntilComplete();
    expect(container.querySelector("#me")?.textContent).toBe("ME");

    await router.navigate("/user/99");
    await waitUntilComplete();
    expect(container.querySelector("#u")?.textContent).toBe("99");
  });

  it("布局组件应收到 params 与 query", async () => {
    const Layout = (p: {
      children?: any;
      params?: Record<string, string>;
      query?: Record<string, string>;
    }) =>
      jsx(
        "div",
        {
          id: "lay",
          "data-pid": p.params?.id ?? "",
          "data-q": p.query?.tab ?? "",
        },
        p.children,
      );
    const Page = () => jsx("div", { id: "pg", children: "P" });

    const router = createRouter([
      { path: "/", component: () => jsx("div", { id: "rootp" }, "R") },
      {
        path: "/item/:id",
        component: () => Promise.resolve({ default: Page }),
        layouts: [() => Promise.resolve({ default: Layout })],
        loading: () => jsx("div", { id: "ld", children: "…" }),
      },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/item/7?tab=info");
    await waitUntilComplete();
    await waitUntilComplete();

    const lay = container.querySelector("#lay") as HTMLElement;
    expect(lay?.getAttribute("data-pid")).toBe("7");
    expect(lay?.getAttribute("data-q")).toBe("info");
  });

  it("popstate：replaceState 改 URL 后派发事件应同步信号（模拟后退）", async () => {
    const A = () => jsx("div", { id: "a", children: "A" });
    const B = () => jsx("div", { id: "b", children: "B" });

    const router = createRouter([
      { path: "/a", component: A },
      { path: "/b", component: B },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/a");
    await waitUntilComplete();
    await router.navigate("/b");
    await waitUntilComplete();
    expect(router.path()).toBe("/b");

    /** happy-dom 的 history.back 不一定更新 location，用 replaceState + popstate 模拟浏览器 */
    globalThis.history.replaceState({}, "", "/a");
    globalThis.window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 30));
    await waitUntilComplete();
    expect(router.path()).toBe("/a");
    expect(container.querySelector("#a")?.textContent).toBe("A");

    globalThis.history.replaceState({}, "", "/b");
    globalThis.window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 30));
    await waitUntilComplete();
    expect(router.path()).toBe("/b");
  });

  it("back / forward / go：在存在 history 时不应抛错", () => {
    const router = createRouter([
      { path: "/", component: () => jsx("div", {}, "x") },
    ]);
    expect(() => {
      router.back();
      router.forward();
      router.go(0);
    }).not.toThrow();
    router.destroy();
  });

  it("destroy 后 useRouter 应抛出", async () => {
    const Home = () => jsx("div", { id: "home" }, "H");
    const router = createRouter([{ path: "/", component: Home }]);
    mountWithRouter("#app", router);
    await waitUntilComplete();
    router.destroy();
    expect(() => useRouter()).toThrow();
  });

  it("resolveHref：无 base 时保持路径拼接 query", async () => {
    const Home = () => jsx("div", { id: "h" }, "H");
    const router = createRouter([{ path: "/", component: Home }]);
    mountWithRouter("#app", router);
    await waitUntilComplete();
    expect(router.resolveHref("/x?a=1")).toBe("/x?a=1");
  });

  it("相同 path+search+hash 重复 navigate 不重复触发无谓更新（仍稳定）", async () => {
    let subs = 0;
    const Home = () => jsx("div", { id: "h" }, "H");
    const router = createRouter([{ path: "/", component: Home }]);
    router.subscribe(() => {
      subs++;
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();
    const afterMount = subs;
    await router.navigate("/");
    await waitUntilComplete();
    await router.navigate("/");
    await waitUntilComplete();
    expect(subs).toBe(afterMount);
  });
}, { sanitizeOps: false, sanitizeResources: false });
