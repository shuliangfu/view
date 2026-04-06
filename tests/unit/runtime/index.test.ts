import { waitUntilComplete } from "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, Index } from "@dreamer/view";

describe("runtime/index", () => {
  it("Index: 应当渲染列表", async () => {
    const [list] = createSignal(["A", "B"]);
    const parent = document.createElement("div");

    const fragment = Index({
      each: list,
      children: (item: any, index: () => number) => {
        const text = document.createTextNode("");
        text.textContent = `${index()}: ${item}`;
        return text;
      },
    });

    parent.appendChild(fragment);

    await waitUntilComplete();

    expect(parent.textContent).toBe("0: A1: B");
  });

  it("Index: 应当支持更新", async () => {
    const [list, setList] = createSignal(["A", "B"]);
    const parent = document.createElement("div");

    const fragment = Index({
      each: list,
      children: (item: any, index: () => number) => {
        const text = document.createTextNode("");
        text.textContent = `${index()}: ${item}`;
        return text;
      },
    });

    parent.appendChild(fragment);

    await waitUntilComplete();
    expect(parent.textContent).toBe("0: A1: B");

    // 更新列表
    setList(["C", "D"]);
    await waitUntilComplete();

    expect(parent.textContent).toBe("0: C1: D");
  });
}, { sanitizeOps: false, sanitizeResources: false });
