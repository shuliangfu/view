import { describe, expect, it } from "@dreamer/test";
import { createSignal, For } from "@dreamer/view";
import { waitUntilComplete } from "../dom-setup.ts";

describe("runtime/stress", () => {
  it("大规模 For 渲染：应当高效处理 1000 个节点的创建与更新", async () => {
    const itemCount = 1000;
    const initialData = Array.from(
      { length: itemCount },
      (_, i) => ({ id: i, text: `Item ${i}` }),
    );
    const [list, setList] = createSignal(initialData);

    const container = document.createElement("div");

    const startTime = performance.now();
    const fragment = For<{ id: number; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const div = document.createElement("div");
        div.textContent = item.text;
        return div;
      },
    });
    container.appendChild(fragment);

    await waitUntilComplete();
    const endTime = performance.now();

    // 验证数量
    expect(container.querySelectorAll("div").length).toBe(itemCount);
    // 性能基准：1000 个节点的基础渲染不应超过 500ms (通常在 50ms 左右)
    expect(endTime - startTime).toBeLessThan(500);

    // 增量更新：修改其中 5 个项
    const updateStartTime = performance.now();
    const newData = [...list()];
    for (let i = 0; i < 5; i++) {
      newData[i] = { ...newData[i], text: `Updated ${i}` };
    }
    setList(newData);
    await waitUntilComplete();
    const updateEndTime = performance.now();

    expect(container.querySelectorAll("div").length).toBe(itemCount);
    expect(container.querySelector("div")?.textContent).toBe("Updated 0");
    // 增量更新应该非常快
    expect(updateEndTime - updateStartTime).toBeLessThan(100);

    await waitUntilComplete();
  });

  it("大规模 For 渲染：应当高效处理列表重排 (Shuffle)", async () => {
    const itemCount = 100;
    // 稳定对象引用：重排时 setItem 为 Object.is 命中，仅移动节点
    const initialData = Array.from(
      { length: itemCount },
      (_, i) => ({ id: i, text: `Item ${i}` }),
    );
    const [list, setList] = createSignal(initialData);

    const container = document.createElement("div");
    const fragment = For<{ id: number; text: string }>({
      each: () => list(),
      key: (item) => item.id,
      children: (item) => {
        const span = document.createElement("span");
        span.setAttribute("data-id", String(item.id));
        span.textContent = item.text;
        return span;
      },
    });
    container.appendChild(fragment);
    await waitUntilComplete();

    const firstSpan = container.querySelector('[data-id="0"]');
    expect(firstSpan).not.toBeNull();

    // 同引用反转，避免随机顺序导致断言不稳定
    const shuffled = [...list()].reverse();
    const shuffleStartTime = performance.now();
    setList(shuffled);
    await waitUntilComplete();
    const shuffleEndTime = performance.now();

    // 键控行无元素壳：同引用重排应复用 id=0 的 Element
    const span0After = container.querySelector('[data-id="0"]');
    expect(span0After).toBe(firstSpan);
    expect(container.children[0]?.getAttribute("data-id")).toBe(
      String(itemCount - 1),
    );
    expect(shuffleEndTime - shuffleStartTime).toBeLessThan(100);

    await waitUntilComplete();
  });
}, { sanitizeOps: false, sanitizeResources: false });
