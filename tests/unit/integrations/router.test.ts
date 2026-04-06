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

describe("integrations/router", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "app";
    document.body.appendChild(container);
    // 模拟初始路径 (增加环境检查)
    if (globalThis.history) {
      globalThis.history.replaceState({}, "", "/");
    } else {
      (globalThis as any).history = {
        replaceState: () => {},
        pushState: () => {},
      };
      (globalThis as any).location = { pathname: "/" };
    }
  });

  afterEach(async () => {
    try {
      useRouter().destroy();
    } catch {
      /* 未创建 router 时忽略 */
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    container.innerHTML = "";
    await waitUntilComplete();
  });

  it("基础路由切换：应当根据路径渲染组件", async () => {
    const Home = () => jsx("div", { id: "home", children: "Home Page" });
    const About = () => jsx("div", { id: "about", children: "About Page" });

    const routes: RouteConfig[] = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ];

    const router = createRouter(routes);
    mountWithRouter("#app", router);

    await waitUntilComplete();
    expect(container.querySelector("#home")?.textContent).toBe("Home Page");

    await router.navigate("/about");
    await waitUntilComplete();
    expect(container.querySelector("#about")?.textContent).toBe("About Page");
  });

  it("Link 组件：应当能触发导航", async () => {
    const Home = () =>
      jsx("div", {
        children: [
          "Home",
          jsx(Link, { href: "/contact", id: "btn", children: "Go to Contact" }),
        ],
      });
    const Contact = () =>
      jsx("div", { id: "contact", children: "Contact Page" });

    const routes: RouteConfig[] = [
      { path: "/", component: Home },
      { path: "/contact", component: Contact },
    ];

    const router = createRouter(routes);
    mountWithRouter("#app", router);

    await waitUntilComplete();
    const btn = container.querySelector("#btn") as HTMLElement;
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    await waitUntilComplete();
    expect(container.querySelector("#contact")?.textContent).toBe(
      "Contact Page",
    );
  });

  it("动态段 :id：应当向页面组件传入 params", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const User = (props: { params?: Record<string, string> }) =>
      jsx("div", { id: "uid", children: props.params?.id ?? "" });

    const routes: RouteConfig[] = [
      { path: "/", component: Home },
      { path: "/user/:id", component: User },
    ];

    const router = createRouter(routes);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/user/42");
    await waitUntilComplete();
    expect(container.querySelector("#uid")?.textContent).toBe("42");
  });

  it("beforeEach 返回 false 时应当取消导航", async () => {
    const Home = () => jsx("div", { id: "home", children: "Home" });
    const Blocked = () => jsx("div", { id: "blocked", children: "No" });

    const router = createRouter({
      routes: [
        { path: "/", component: Home },
        { path: "/blocked", component: Blocked },
      ],
      beforeEach: (to) => to.path !== "/blocked",
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/blocked");
    await waitUntilComplete();
    expect(container.querySelector("#home")?.textContent).toBe("Home");
    expect(container.querySelector("#blocked")).toBeNull();
  });

  it("subscribe：应当在路由变化时触发回调", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const About = () => jsx("div", { id: "about", children: "A" });
    let fires = 0;

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]);
    const unsub = router.subscribe(() => {
      fires++;
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    const initial = fires;
    await router.navigate("/about");
    await waitUntilComplete();
    expect(fires).toBeGreaterThan(initial);

    unsub();
    const afterUnsub = fires;
    await router.navigate("/");
    await waitUntilComplete();
    expect(fires).toBe(afterUnsub);
  });

  it("basePath：navigate 短路径应写入带前缀的 pathname", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const Page = () => jsx("div", { id: "p", children: "P" });

    const router = createRouter({
      basePath: "/app",
      routes: [
        { path: "/", component: Home },
        { path: "/dash", component: Page },
      ],
    });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/dash");
    await waitUntilComplete();
    expect(router.path()).toBe("/app/dash");
    expect(router.match()?.path).toBe("/dash");
  });

  it("replace：应当调用 replaceState 而非重复 push（长度不增）", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const A = () => jsx("div", { id: "a", children: "A" });
    const pushState = globalThis.history?.pushState?.bind(globalThis.history);
    const replaceState = globalThis.history?.replaceState?.bind(
      globalThis.history,
    );
    let pushes = 0;
    let replaces = 0;
    if (globalThis.history && pushState && replaceState) {
      globalThis.history.pushState = (...args: unknown[]) => {
        pushes++;
        return pushState(
          ...(args as [any, string, string | URL | null | undefined]),
        );
      };
      globalThis.history.replaceState = (...args: unknown[]) => {
        replaces++;
        return replaceState(
          ...(args as [any, string, string | URL | null | undefined]),
        );
      };
    }

    const router = createRouter([
      { path: "/", component: Home },
      { path: "/a", component: A },
    ]);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    await router.navigate("/a");
    await waitUntilComplete();
    await router.replace("/");
    await waitUntilComplete();

    if (pushes > 0 || replaces > 0) {
      expect(replaces).toBeGreaterThanOrEqual(1);
      expect(pushes).toBe(1);
    }
  });

  /**
   * 与 v1.3.9 一致：路由表中的 metadata 在命中变化时写入 document.title 与 name=description 等 meta。
   */
  it("metadata：路由切换时应同步 document.title 与 description meta", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const About = () => jsx("div", { id: "about", children: "A" });
    const routes: RouteConfig[] = [
      {
        path: "/",
        component: Home,
        metadata: { title: "首页", description: "首页说明" },
      },
      {
        path: "/about",
        component: About,
        metadata: { title: "关于", description: "关于说明" },
      },
    ];
    const router = createRouter({ routes, documentTitleSuffix: " | Test" });
    mountWithRouter("#app", router);
    await waitUntilComplete();

    expect(document.title).toBe("首页 | Test");
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute(
        "content",
      ),
    ).toBe("首页说明");

    await router.navigate("/about");
    await waitUntilComplete();
    expect(document.title).toBe("关于 | Test");
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute(
        "content",
      ),
    ).toBe("关于说明");
  });
}, { sanitizeOps: false, sanitizeResources: false });
