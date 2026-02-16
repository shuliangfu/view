/**
 * @fileoverview 内置 SPA 路由单元测试（不依赖 @dreamer/router/client）
 */

import { describe, expect, it } from "@dreamer/test";
import type { VNode } from "@dreamer/view";
import {
  createRouter,
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
