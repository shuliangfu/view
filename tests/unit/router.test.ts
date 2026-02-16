/**
 * @fileoverview 内置 SPA 路由单元测试（不依赖 @dreamer/router/client）
 */

import { afterEach, describe, expect, it } from "@dreamer/test";
import type { VNode } from "@dreamer/view";
import {
  buildPath,
  createRouter,
  type NavigateTo,
  type RouteConfig,
  type RouteMatch,
} from "@dreamer/view/router";

function textVNode(s: string): VNode {
  return { type: "#text", props: { nodeValue: s }, children: [] };
}

const routes: RouteConfig[] = [
  {
    path: "/",
    component: () => ({
      type: "div",
      props: {},
      children: [textVNode("Home")],
    }),
  },
  {
    path: "/about",
    component: () => ({
      type: "div",
      props: {},
      children: [textVNode("About")],
    }),
  },
  {
    path: "/user/:id",
    component: (m: RouteMatch) => ({
      type: "div",
      props: {},
      children: [textVNode(`User ${m.params.id}`)],
    }),
  },
];

describe("createRouter", () => {
  it("应返回 getCurrentRoute、navigate、replace、subscribe、start、stop", () => {
    const router = createRouter({ routes });
    expect(typeof router.getCurrentRoute).toBe("function");
    expect(typeof router.navigate).toBe("function");
    expect(typeof router.replace).toBe("function");
    expect(typeof router.subscribe).toBe("function");
    expect(typeof router.start).toBe("function");
    expect(typeof router.stop).toBe("function");
  });

  it("subscribe 返回取消函数，调用后不再触发回调", async () => {
    const router = createRouter({ routes });
    let count = 0;
    const unsub = router.subscribe(() => {
      count++;
    });
    await router.navigate("/about");
    unsub();
    const before = count;
    await router.navigate("/");
    // 取消订阅后再次 navigate 不应再触发回调
    expect(count).toBe(before);
  });

  it("应提供 back、forward、go 方法", () => {
    const router = createRouter({ routes });
    expect(typeof router.back).toBe("function");
    expect(typeof router.forward).toBe("function");
    expect(typeof router.go).toBe("function");
  });

  it("无 location/history 时 getCurrentRoute 不抛错", () => {
    const router = createRouter({ routes });
    const r = router.getCurrentRoute();
    // 非浏览器环境可能为 null 或仍能读到 mock，只要为 null 或带 path 的对象即可
    expect(
      r === null || (typeof r === "object" && r != null && "path" in r),
    ).toBe(true);
  });

  it("边界：routes 为空数组时 createRouter 不抛错，getCurrentRoute 可返回 null", () => {
    const router = createRouter({ routes: [] });
    const r = router.getCurrentRoute();
    expect(router).toBeDefined();
    expect(r === null || (typeof r === "object" && r != null)).toBe(true);
  });
});

describe("router 路径匹配", () => {
  it("history 模式下 basePath  strip 后匹配路由", () => {
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
        pathname: "/app/user/42",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {} } as typeof g.history;
      const router = createRouter({
        routes,
        basePath: "/app",
      });
      const match = router.getCurrentRoute();
      expect(match).not.toBeNull();
      expect(match!.path).toBe("/user/:id");
      expect(match!.params.id).toBe("42");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });

  it("动态参数 :id 被正确解析", () => {
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
        pathname: "/user/abc",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {} } as typeof g.history;
      const router = createRouter({ routes });
      const match = router.getCurrentRoute();
      expect(match).not.toBeNull();
      expect(match!.params.id).toBe("abc");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });
});

describe("router 前置守卫 beforeRoute", () => {
  it("返回 false 时应取消导航", async () => {
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
      g.history = { pushState: () => {} } as typeof g.history;
      let navigated = false;
      const router = createRouter({
        routes,
        beforeRoute: () => {
          navigated = true;
          return false;
        },
      });
      await router.navigate("/about");
      expect(navigated).toBe(true);
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });

  it("返回重定向 path 时应跳转到该路径", async () => {
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
      g.history = { pushState: () => {} } as typeof g.history;
      const router = createRouter({
        routes,
        beforeRoute: (to) => (to?.path === "/about" ? "/user/1" : true),
      });
      await router.navigate("/about");
      g.location = {
        pathname: "/user/1",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/user/:id");
      expect(match?.params.id).toBe("1");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });

  it("边界：beforeRoute 返回 true 时继续导航", async () => {
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
      g.history = { pushState: () => {} } as typeof g.history;
      const router = createRouter({
        routes,
        beforeRoute: () => true,
      });
      await router.navigate("/about");
      g.location = {
        pathname: "/about",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/about");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });
});

describe("router 后置守卫 afterRoute", () => {
  it("导航完成后应执行 afterRoute", async () => {
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
      g.history = { pushState: () => {} } as typeof g.history;
      let afterCalled = false;
      const router = createRouter({
        routes,
        afterRoute: () => {
          afterCalled = true;
        },
      });
      await router.navigate("/about");
      expect(afterCalled).toBe(true);
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });
});

describe("router notFound 与 metadata", () => {
  it("无匹配且配置 notFound 时 getCurrentRoute 返回兜底匹配", () => {
    const g = globalThis as unknown as {
      location?: { pathname: string; search: string; hash: string };
      history?: { pushState: (a: unknown, b: string, c: string) => void };
    };
    const origLocation = g.location;
    const origHistory = g.history;
    try {
      g.location = { pathname: "/unknown/page", search: "", hash: "" };
      g.history = { pushState: () => {} } as typeof g.history;
      const router = createRouter({
        routes,
        notFound: {
          path: "*",
          component: () => ({
            type: "div",
            props: {},
            children: [textVNode("404")],
          }),
          metadata: { title: "Not Found" },
        },
      });
      const match = router.getCurrentRoute();
      expect(match).not.toBeNull();
      expect(match!.path).toBe("*");
      expect(match!.metadata?.title).toBe("Not Found");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });

  it("路由配置 metadata 会出现在 RouteMatch 中", () => {
    const g = globalThis as unknown as {
      location?: { pathname: string; search: string; hash: string };
      history?: { pushState: (a: unknown, b: string, c: string) => void };
    };
    const origLocation = g.location;
    const origHistory = g.history;
    try {
      g.location = { pathname: "/about", search: "", hash: "" };
      g.history = { pushState: () => {} } as typeof g.history;
      const router = createRouter({
        routes: [
          {
            path: "/",
            component: () => ({ type: "div", props: {}, children: [] }),
          },
          {
            path: "/about",
            component: () => ({ type: "div", props: {}, children: [] }),
            metadata: { title: "关于" },
          },
          {
            path: "/user/:id",
            component: (m: RouteMatch) => ({
              type: "div",
              props: {},
              children: [textVNode(m.params.id)],
            }),
          },
        ],
      });
      const match = router.getCurrentRoute();
      expect(match?.metadata?.title).toBe("关于");
    } finally {
      g.location = origLocation;
      g.history = origHistory;
    }
  });
});

describe("router scroll 选项", () => {
  it("scroll: 'top' 时导航完成后应调用 scrollTo(0, 0)", async () => {
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: { pushState: (a: unknown, b: string, c: string) => void };
      scrollTo?: (x: number, y: number) => void;
    };
    const origLocation = g.location;
    const origHistory = g.history;
    const origScrollTo = g.scrollTo;
    let scrollToCalls: [number, number][] = [];
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {} } as typeof g.history;
      g.scrollTo = (x: number, y: number) => scrollToCalls.push([x, y]);
      const router = createRouter({
        routes,
        scroll: "top",
      });
      await router.navigate("/about");
      expect(scrollToCalls.some(([x, y]) => x === 0 && y === 0)).toBe(true);
    } finally {
      g.location = origLocation;
      g.history = origHistory;
      g.scrollTo = origScrollTo;
    }
  });

  it("scroll: false 时不应调用 scrollTo", async () => {
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: { pushState: (a: unknown, b: string, c: string) => void };
      scrollTo?: (x: number, y: number) => void;
    };
    const origLocation = g.location;
    const origHistory = g.history;
    const origScrollTo = g.scrollTo;
    let scrollToCalls: [number, number][] = [];
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {} } as typeof g.history;
      g.scrollTo = (x: number, y: number) => scrollToCalls.push([x, y]);
      const router = createRouter({
        routes,
        scroll: false,
      });
      await router.navigate("/about");
      expect(scrollToCalls.length).toBe(0);
    } finally {
      g.location = origLocation;
      g.history = origHistory;
      g.scrollTo = origScrollTo;
    }
  });

  it("scroll: 'restore' 时先保存当前 scroll 再导航后恢复目标路径的 scroll", async () => {
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: { pushState: (a: unknown, b: string, c: string) => void };
      scrollX?: number;
      scrollY?: number;
      scrollTo?: (x: number, y: number) => void;
    };
    const origLocation = g.location;
    const origHistory = g.history;
    const origScrollX = g.scrollX;
    const origScrollY = g.scrollY;
    const origScrollTo = g.scrollTo;
    const scrollToCalls: [number, number][] = [];
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {} } as typeof g.history;
      g.scrollX = 10;
      g.scrollY = 20;
      g.scrollTo = (x: number, y: number) => scrollToCalls.push([x, y]);
      const router = createRouter({
        routes,
        scroll: "restore",
      });
      await router.navigate("/about");
      g.location = {
        pathname: "/about",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      const afterAbout = scrollToCalls.length;
      await router.navigate("/");
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      await router.navigate("/about");
      expect(scrollToCalls.length).toBeGreaterThan(afterAbout);
      const lastCall = scrollToCalls[scrollToCalls.length - 1];
      expect(lastCall).toEqual([10, 20]);
    } finally {
      g.location = origLocation;
      g.history = origHistory;
      g.scrollX = origScrollX;
      g.scrollY = origScrollY;
      g.scrollTo = origScrollTo;
    }
  });
});

describe("router mode (history / hash)", () => {
  const g = globalThis as unknown as {
    location?: {
      pathname: string;
      search: string;
      hash: string;
      origin: string;
    };
    history?: {
      pushState: (a: unknown, b: string, c: string) => void;
      replaceState: (a: unknown, b: string, c: string) => void;
    };
  };

  function restore(): void {
    g.location = undefined;
    g.history = undefined;
  }

  it("默认 mode 为 history，从 pathname+search 读当前路由", () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/about",
        search: "?tab=info",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const router = createRouter({ routes });
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/about");
      expect(match?.query?.tab).toBe("info");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("mode: 'hash' 时从 location.hash 解析 path 与 query", () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "#/about",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const router = createRouter({ routes, mode: "hash" });
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/about");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("mode: 'hash' 时 hash 带 query 能正确解析", () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "#/user/42?tab=profile",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const router = createRouter({ routes, mode: "hash" });
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/user/:id");
      expect(match?.params.id).toBe("42");
      expect(match?.query?.tab).toBe("profile");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("mode: 'hash' 时 href(path) 返回带 # 的字符串", () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const routerHistory = createRouter({ routes, mode: "history" });
      const routerHash = createRouter({ routes, mode: "hash" });
      expect(routerHistory.href("/about")).toBe("/about");
      expect(routerHash.href("/about")).toBe("#/about");
      expect(routerHash.href("about")).toBe("#/about");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("mode: 'hash' 且 basePath 时 href 与 getCurrentRoute 均考虑 basePath", () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "#/app/user/1",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const router = createRouter({
        routes,
        mode: "hash",
        basePath: "/app",
      });
      const match = router.getCurrentRoute();
      expect(match?.path).toBe("/user/:id");
      expect(match?.params.id).toBe("1");
      expect(router.href("/user/1")).toBe("#/app/user/1");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("mode: 'hash' 时 navigate 写入 location.hash", async () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const router = createRouter({ routes, mode: "hash" });
      await router.navigate("/about");
      expect(g.location?.hash).toBe("#/about");
      await router.navigate("/user/99");
      expect(g.location?.hash).toBe("#/user/99");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("mode: 'hash' 时 replace 使用 replaceState 且 URL 含目标 hash", async () => {
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "#/",
        origin: "http://localhost",
      };
      let replaceStateUrl: string | null = null;
      g.history = {
        pushState: () => {},
        replaceState: (_: unknown, __: string, url: string) => {
          replaceStateUrl = url;
          if (g.location && url.includes("#")) {
            g.location.hash = url.slice(url.indexOf("#"));
          }
        },
      };
      const router = createRouter({ routes, mode: "hash" });
      await router.replace("/about");
      expect(replaceStateUrl).toContain("#/about");
      expect(router.getCurrentRoute()?.path).toBe("/about");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });
});

describe("buildPath 与 navigate/href/replace 的 params、query 参数", () => {
  it("buildPath 仅 path 时返回规范化路径", () => {
    expect(buildPath("/user/:id")).toBe("/user/");
    expect(buildPath("/about")).toBe("/about");
    expect(buildPath("about")).toBe("/about");
  });

  it("buildPath 带 params 时替换 :param", () => {
    expect(buildPath("/user/:id", { id: "123" })).toBe("/user/123");
    expect(buildPath("/post/:id/comment/:cid", { id: "1", cid: "2" })).toBe(
      "/post/1/comment/2",
    );
  });

  it("buildPath 仅 query 时返回 path + search", () => {
    expect(buildPath("/search", undefined, { q: "hello" })).toBe(
      "/search?q=hello",
    );
    expect(buildPath("/list", undefined, { page: "1", size: "10" })).toBe(
      "/list?page=1&size=10",
    );
  });

  it("buildPath 同时带 params 与 query", () => {
    expect(
      buildPath("/user/:id", { id: "42" }, { tab: "profile" }),
    ).toBe("/user/42?tab=profile");
  });

  it("buildPath 对 params 和 query 值做 encodeURIComponent", () => {
    expect(buildPath("/user/:id", { id: "a/b" })).toBe("/user/a%2Fb");
    expect(buildPath("/s", undefined, { q: "a&b" })).toBe("/s?q=a%26b");
  });

  it("navigate 接受 NavigateTo 对象并正确跳转", async () => {
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: {
        pushState: (a: unknown, b: string, c: string) => void;
        replaceState: (a: unknown, b: string, c: string) => void;
      };
    };
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      let pushStateUrl: string | null = null;
      g.history = {
        pushState: (_: unknown, __: string, url: string) => {
          pushStateUrl = url;
        },
        replaceState: () => {},
      };
      const router = createRouter({ routes });
      const to: NavigateTo = {
        path: "/user/:id",
        params: { id: "99" },
        query: { tab: "posts" },
      };
      await router.navigate(to);
      expect(pushStateUrl).toContain("/user/99");
      expect(pushStateUrl).toContain("tab=posts");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("href 接受 NavigateTo 对象返回带 params、query 的 href", () => {
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: {
        pushState: (a: unknown, b: string, c: string) => void;
        replaceState: (a: unknown, b: string, c: string) => void;
      };
    };
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      g.history = { pushState: () => {}, replaceState: () => {} };
      const router = createRouter({ routes });
      const to: NavigateTo = {
        path: "/user/:id",
        params: { id: "1" },
        query: { from: "home" },
      };
      expect(router.href(to)).toBe("/user/1?from=home");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });

  it("replace 接受 NavigateTo 对象", async () => {
    type HistoryMock = {
      pushState: (a: unknown, b: string, c: string) => void;
      replaceState: (a: unknown, b: string, c: string) => void;
    };
    const g = globalThis as unknown as {
      location?: {
        pathname: string;
        search: string;
        hash: string;
        origin: string;
      };
      history?: HistoryMock;
    };
    const orig = { location: g.location, history: g.history };
    try {
      g.location = {
        pathname: "/",
        search: "",
        hash: "",
        origin: "http://localhost",
      };
      let replaceStateUrl: string | null = null;
      g.history = {
        pushState: () => {},
        replaceState: (_: unknown, __: string, url: string) => {
          replaceStateUrl = url;
        },
      } as HistoryMock;
      const router = createRouter({ routes });
      await router.replace({
        path: "/about",
        query: { ref: "nav" },
      });
      expect(replaceStateUrl).toContain("/about");
      expect(replaceStateUrl).toContain("ref=nav");
    } finally {
      g.location = orig.location;
      g.history = orig.history;
    }
  });
});

describe("router 链接拦截 (interceptLinks)", () => {
  type LocationLike = {
    pathname: string;
    search: string;
    hash: string;
    origin: string;
    href?: string;
  };

  let savedClickHandler: ((e: Event) => void) | null = null;
  const mockDocument = {
    addEventListener(type: string, fn: (e: Event) => void) {
      if (type === "click") savedClickHandler = fn;
    },
    removeEventListener(_type: string, _fn: () => void) {
      savedClickHandler = null;
    },
  };

  const g = globalThis as unknown as {
    location?: LocationLike;
    history?: {
      pushState: (a: unknown, b: string, c: string) => void;
      replaceState: (a: unknown, b: string, c: string) => void;
    };
    document?: typeof mockDocument;
  };

  function createAnchor(attrs: {
    href: string;
    target?: string;
    download?: boolean;
    dataNative?: boolean;
  }) {
    const a = {
      getAttribute(name: string): string | null {
        if (name === "href") return attrs.href;
        if (name === "target") return attrs.target ?? null;
        return null;
      },
      hasAttribute(name: string): boolean {
        if (name === "download") return attrs.download ?? false;
        if (name === "data-native") return attrs.dataNative ?? false;
        return false;
      },
      closest(_sel: string) {
        return a;
      },
    };
    return a;
  }

  function dispatchClick(
    anchor: ReturnType<typeof createAnchor>,
    options: {
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      button?: number;
    } = {},
  ): { preventDefaultCalled: boolean } {
    let preventDefaultCalled = false;
    const ev = {
      preventDefault: () => {
        preventDefaultCalled = true;
      },
      target: anchor,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
      button: options.button ?? 0,
    } as unknown as MouseEvent;
    savedClickHandler?.(ev as Event);
    return { preventDefaultCalled };
  }

  const origGlobals = {
    location: g.location,
    history: g.history,
    document: g.document,
  };

  afterEach(() => {
    savedClickHandler = null;
    g.location = origGlobals.location;
    g.history = origGlobals.history;
    g.document = origGlobals.document;
  });

  it('interceptLinks: true 时同源 <a href="/about"> 点击应拦截并 navigate', () => {
    let pushStateUrl: string | null = null;
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = {
      pushState: (_: unknown, __: string, url: string) => {
        pushStateUrl = url;
      },
      replaceState: () => {},
    };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({ routes, interceptLinks: true });
    router.start();

    const anchor = createAnchor({ href: "/about" });
    const { preventDefaultCalled } = dispatchClick(anchor);

    expect(preventDefaultCalled).toBe(true);
    expect(pushStateUrl).toContain("/about");
  });

  it("interceptLinks: true 时 target=_blank 不拦截", () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({ routes, interceptLinks: true });
    router.start();

    const anchor = createAnchor({ href: "/about", target: "_blank" });
    const { preventDefaultCalled } = dispatchClick(anchor);

    expect(preventDefaultCalled).toBe(false);
    router.stop();
  });

  it("interceptLinks: true 时带 download 属性不拦截", () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({ routes, interceptLinks: true });
    router.start();

    const anchor = createAnchor({ href: "/about", download: true });
    const { preventDefaultCalled } = dispatchClick(anchor);

    expect(preventDefaultCalled).toBe(false);
    router.stop();
  });

  it("interceptLinks: true 时带 data-native 不拦截", () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({ routes, interceptLinks: true });
    router.start();

    const anchor = createAnchor({ href: "/about", dataNative: true });
    const { preventDefaultCalled } = dispatchClick(anchor);

    expect(preventDefaultCalled).toBe(false);
    router.stop();
  });

  it("history 模式下仅 hash 锚点 (#section) 不拦截", () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({
      routes,
      interceptLinks: true,
      mode: "history",
    });
    router.start();

    const anchor = createAnchor({ href: "#section" });
    const { preventDefaultCalled } = dispatchClick(anchor);

    expect(preventDefaultCalled).toBe(false);
    router.stop();
  });

  it('hash 模式下 <a href="#/about"> 应拦截并 navigate', () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "#/",
      origin: "http://localhost",
      href: "http://localhost/#/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({
      routes,
      interceptLinks: true,
      mode: "hash",
    });
    router.start();

    const anchor = createAnchor({ href: "#/about" });
    const { preventDefaultCalled } = dispatchClick(anchor);

    expect(preventDefaultCalled).toBe(true);
    expect(g.location?.hash).toBe("#/about");
    router.stop();
  });

  it("修饰键或非左键点击不拦截", () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({ routes, interceptLinks: true });
    router.start();

    const anchor = createAnchor({ href: "/about" });
    expect(dispatchClick(anchor, { ctrlKey: true }).preventDefaultCalled).toBe(
      false,
    );
    expect(dispatchClick(anchor, { metaKey: true }).preventDefaultCalled).toBe(
      false,
    );
    expect(dispatchClick(anchor, { shiftKey: true }).preventDefaultCalled).toBe(
      false,
    );
    expect(dispatchClick(anchor, { button: 1 }).preventDefaultCalled).toBe(
      false,
    );
    router.stop();
  });

  it("interceptLinks: false 时不注册 click 监听", () => {
    g.location = {
      pathname: "/",
      search: "",
      hash: "",
      origin: "http://localhost",
      href: "http://localhost/",
    };
    g.history = { pushState: () => {}, replaceState: () => {} };
    g.document = mockDocument as typeof g.document;

    const router = createRouter({ routes, interceptLinks: false });
    router.start();

    expect(savedClickHandler).toBeNull();
    router.stop();
  });
});
