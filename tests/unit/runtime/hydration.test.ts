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
    // 模拟 SSR 生成的 DOM
    const root = document.createElement("div");
    root.innerHTML = "<ul><li>Item 1</li><li>Item 2</li></ul>";

    // 编译器生成的路径映射
    const bindingMap: [number[], string][] = [
      [[0], "ul-id"],
      [[0, 1], "li2-id"],
    ];

    // 使用内部注册函数进行测试 (因为它是纯逻辑，不涉及 Thunk 执行)
    internalHydrate(root, bindingMap);

    const ul = useHydratedNode("ul-id");
    const li2 = useHydratedNode("li2-id");

    expect(ul?.nodeName).toBe("UL");
    expect(li2?.nodeName).toBe("LI");
    expect(li2?.textContent).toBe("Item 2");
    expect(getHydrationMismatches().length).toBe(0);

    // 清理
    stopHydration();
  });

  it("mismatch：路径失败应记录并可选 onMismatch；warn 默认关", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>only</p>";
    const seen: string[] = [];
    internalHydrate(root, [[[9, 9], "missing-id"]], {
      warnMismatch: false,
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

  it("P1-2 default continue：省略 mismatchMode 须为 continue", () => {
    expect(resolveMismatchMode()).toBe("continue");
    expect(resolveMismatchMode({})).toBe("continue");
    expect(resolveMismatchMode({ warnMismatch: false })).toBe("continue");
  });

  it("P1-2 mismatchMode 优先于弃用布尔开关", () => {
    expect(
      resolveMismatchMode({ mismatchMode: "continue", assertMismatch: true }),
    ).toBe("continue");
    expect(
      resolveMismatchMode({ mismatchMode: "assert", remountOnMismatch: true }),
    ).toBe("assert");
    expect(resolveMismatchMode({ assertMismatch: true })).toBe("assert");
    expect(resolveMismatchMode({ remountOnMismatch: true })).toBe("remount");
  });

  it("P1-2 default continue：错位不抛错且保留 SSR 节点", () => {
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
        // 故意不传 mismatchMode → continue
      },
    );
    expect(root.querySelector("#ssr")?.textContent).toBe("keep");
    expect(getHydrationMismatches().length).toBe(1);
    dispose();
    // continue 的 dispose 仅回收 Owner，默认保留 SSR 子树
    expect(root.querySelector("#ssr")?.textContent).toBe("keep");
    stopHydration();
  });
}, { sanitizeOps: false, sanitizeResources: false });
