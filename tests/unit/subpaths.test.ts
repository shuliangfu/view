/**
 * @fileoverview 按需子路径导出：与主入口同名符号引用一致，且可独立导入。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  batch as mainBatch,
  createEffect as mainEffect,
  createSignal as mainSignal,
  For as MainFor,
  mount as mainMount,
} from "@dreamer/view";
import {
  batch as reactivityBatch,
  createEffect as subEffect,
  createMemo as subMemo,
  createRoot as subRoot,
  createSignal as subSignal,
} from "@dreamer/view/reactivity";
import {
  batch as subBatch,
  schedule as subSchedule,
} from "@dreamer/view/scheduler";
import { createForm } from "@dreamer/view/form";
import { createResource } from "@dreamer/view/resource";
import { createRouter, parseRouterUrl } from "@dreamer/view/router";
import { For as CfFor, Show as CfShow } from "@dreamer/view/control-flow";
import {
  createSignal as csrSignal,
  For as CsrFor,
  mount as csrMount,
} from "@dreamer/view/csr";

describe("subpaths（按需导出）", () => {
  it("reactivity：createSignal/createEffect 与主入口为同一函数引用", () => {
    expect(subSignal).toBe(mainSignal);
    expect(subEffect).toBe(mainEffect);
    const [get, set] = subSignal(1);
    expect(get()).toBe(1);
    set(2);
    expect(get()).toBe(2);
    expect(typeof subMemo).toBe("function");
    expect(typeof subRoot).toBe("function");
  });

  it("reactivity：便利 re-export 的 batch 与主入口／scheduler 同一引用", () => {
    expect(reactivityBatch).toBe(mainBatch);
    expect(reactivityBatch).toBe(subBatch);
  });

  it("scheduler：batch 与主入口同一引用", () => {
    expect(subBatch).toBe(mainBatch);
    expect(typeof subSchedule).toBe("function");
    let n = 0;
    subBatch(() => {
      n++;
    });
    expect(n).toBe(1);
  });

  it("form / resource / router 子路径可导入", () => {
    const form = createForm({ name: "" });
    expect(typeof form.field).toBe("function");
    expect(typeof createResource).toBe("function");
    expect(typeof createRouter).toBe("function");
    const loc = parseRouterUrl("https://example.com/a?b=1");
    expect(loc.pathname).toBe("/a");
  });

  it("control-flow / csr 与主入口同引用", () => {
    expect(CfFor).toBe(MainFor);
    expect(typeof CfShow).toBe("function");
    expect(csrSignal).toBe(mainSignal);
    expect(CsrFor).toBe(MainFor);
    expect(csrMount).toBe(mainMount);
  });

  it("devtools：子路径可导入（DEV 辅助，不进主 barrel）", async () => {
    const mod = await import("@dreamer/view/devtools");
    expect(typeof mod.isViewDev).toBe("function");
    expect(typeof mod.summarizeOwnerTree).toBe("function");
    expect(typeof mod.getTrackedRoots).toBe("function");
  });
});
