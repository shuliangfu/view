import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  getHydrationMismatches,
  hydrate,
  internalHydrate,
  resolveMismatchMode,
  stopHydration,
  useHydratedNode,
} from "@dreamer/view";

describe("runtime/hydration", () => {
  it("零注释水合：应当基于路径准确寻址并注册节点", () => {
    const root = document.createElement("div");
    root.innerHTML = "<ul><li>Item 1</li><li>Item 2</li></ul>";

    const bindingMap: [number[], string][] = [
      [[0], "ul-id"],
      [[0, 1], "li2-id"],
    ];

    internalHydrate(root, bindingMap);

    const ul = useHydratedNode("ul-id");
    const li2 = useHydratedNode("li2-id");

    expect(ul?.nodeName).toBe("UL");
    expect(li2?.nodeName).toBe("LI");
    expect(li2?.textContent).toBe("Item 2");
    expect(getHydrationMismatches().length).toBe(0);

    stopHydration();
  });

  it("mismatch：路径失败应记录并可选 onMismatch；warn 默认关", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>only</p>";
    const seen: string[] = [];
    // 显式 continue：只记录、不抛错（测诊断路径）
    internalHydrate(root, [[[9, 9], "missing-id"]], {
      warnMismatch: false,
      mismatchMode: "continue",
      onMismatch: (info) => seen.push(info.id),
    });
    expect(useHydratedNode("missing-id")).toBeUndefined();
    expect(getHydrationMismatches().length).toBe(1);
    expect(getHydrationMismatches()[0]?.id).toBe("missing-id");
    expect(seen).toEqual(["missing-id"]);
    stopHydration();
  });

  it("hydrate 第三参支持 HydrateOptions 对象", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>ok</span>";
    const dispose = hydrate(() => null, root, {
      bindings: [[[0], "span-id"]],
      warnMismatch: false,
      mismatchMode: "continue",
    });
    expect(useHydratedNode("span-id")?.nodeName).toBe("SPAN");
    dispose();
    stopHydration();
  });

  it("mismatchMode assert：应抛错", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>x</p>";
    expect(() => {
      internalHydrate(root, [[[99], "bad"]], {
        warnMismatch: false,
        mismatchMode: "assert",
      });
    }).toThrow(/hydration assert/);
    stopHydration();
  });

  it("mismatchMode remount：应清空 SSR 节点并 CSR 挂载", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span id='ssr'>old</span>";
    const dispose = hydrate(
      () => {
        const el = document.createElement("div");
        el.id = "csr";
        el.textContent = "new";
        return el;
      },
      root,
      {
        bindings: [[[99], "missing"]],
        warnMismatch: false,
        mismatchMode: "remount",
      },
    );
    expect(root.querySelector("#ssr")).toBeNull();
    expect(root.querySelector("#csr")?.textContent).toBe("new");
    dispose();
    expect(root.querySelector("#csr")).toBeNull();
    stopHydration();
  });

  it("3.0 default：省略 mismatchMode → 生产 remount／VIEW_DEV assert", () => {
    const g = globalThis as { VIEW_DEV?: boolean };
    const prev = g.VIEW_DEV;
    try {
      delete g.VIEW_DEV;
      expect(resolveMismatchMode()).toBe("remount");
      expect(resolveMismatchMode({})).toBe("remount");
      expect(resolveMismatchMode({ warnMismatch: false })).toBe("remount");

      g.VIEW_DEV = true;
      expect(resolveMismatchMode()).toBe("assert");
      expect(resolveMismatchMode({})).toBe("assert");

      // 显式仍优先
      expect(resolveMismatchMode({ mismatchMode: "continue" })).toBe(
        "continue",
      );
      expect(
        resolveMismatchMode({ mismatchMode: "remount" }),
      ).toBe("remount");
    } finally {
      if (prev === undefined) delete g.VIEW_DEV;
      else g.VIEW_DEV = prev;
    }
  });

  it("3.0 生产默认 remount：错位清空 SSR 并 CSR 挂载", () => {
    const g = globalThis as { VIEW_DEV?: boolean };
    const prev = g.VIEW_DEV;
    try {
      delete g.VIEW_DEV;
      const root = document.createElement("div");
      root.innerHTML = "<span id='ssr'>old</span>";
      const dispose = hydrate(
        () => {
          const el = document.createElement("div");
          el.id = "csr";
          el.textContent = "new";
          return el;
        },
        root,
        {
          bindings: [[[99], "missing"]],
          warnMismatch: false,
          // 故意不传 mismatchMode → remount
        },
      );
      expect(root.querySelector("#ssr")).toBeNull();
      expect(root.querySelector("#csr")?.textContent).toBe("new");
      dispose();
      stopHydration();
    } finally {
      if (prev === undefined) delete g.VIEW_DEV;
      else g.VIEW_DEV = prev;
    }
  });

  it("3.0 显式 continue：错位不抛错且保留 SSR 节点", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span id='ssr'>keep</span>";
    const dispose = hydrate(
      () => {
        const el = document.createElement("div");
        el.id = "client";
        el.textContent = "extra";
        return el;
      },
      root,
      {
        bindings: [[[99], "missing"]],
        warnMismatch: false,
        mismatchMode: "continue",
      },
    );
    expect(root.querySelector("#ssr")?.textContent).toBe("keep");
    expect(getHydrationMismatches().length).toBe(1);
    dispose();
    expect(root.querySelector("#ssr")?.textContent).toBe("keep");
    stopHydration();
  });
}, { sanitizeOps: false, sanitizeResources: false });
