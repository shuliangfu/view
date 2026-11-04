/**
 * P1-view-route-resource-abort: router.routeAbortSignal rotates on navigate.
 */
import { afterEach, beforeEach, describe, expect, it } from "@dreamer/test";
import { waitUntilComplete } from "../dom-setup.ts";
import {
  createRouter,
  mountWithRouter,
  type RouteConfig,
  useRouter,
} from "../../../src/router.ts";
import { jsx } from "../../../src/jsx-runtime.ts";

describe("integrations/router routeAbortSignal (P1)", () => {
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
    } catch { /* */ }
    container.remove();
    await waitUntilComplete();
  });

  it("exposes AbortSignal; navigate aborts previous generation", async () => {
    const Home = () => jsx("div", { id: "home", children: "H" });
    const About = () => jsx("div", { id: "about", children: "A" });
    const routes: RouteConfig[] = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ];
    const router = createRouter(routes);
    mountWithRouter("#app", router);
    await waitUntilComplete();

    const first = router.routeAbortSignal();
    expect(first).toBeInstanceOf(AbortSignal);
    expect(first.aborted).toBe(false);

    await router.navigate("/about");
    await waitUntilComplete();

    expect(first.aborted).toBe(true);
    const second = router.routeAbortSignal();
    expect(second).not.toBe(first);
    expect(second.aborted).toBe(false);
  });

  it("destroy aborts current generation", async () => {
    const Home = () => jsx("div", { children: "H" });
    const router = createRouter([{ path: "/", component: Home }]);
    mountWithRouter("#app", router);
    const sig = router.routeAbortSignal();
    router.destroy();
    expect(sig.aborted).toBe(true);
  });
});
