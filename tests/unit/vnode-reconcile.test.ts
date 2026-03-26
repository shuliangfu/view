/**
 * {@link canPatchIntrinsic} / {@link patchIntrinsicSubtree}：本征树结构对齐与就地更新；
 * 步骤 3：patch 路径下 `onClick` 换绑不重复触发。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createSignal, insertReactive } from "@dreamer/view";
import {
  canPatchIntrinsic,
  patchIntrinsicSubtree,
} from "../../src/compiler/vnode-reconcile.ts";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";
import { jsx } from "@dreamer/view/jsx-runtime";

/** 等待 effect / insertReactive 一轮 flush */
function flush(): Promise<void> {
  return new Promise<void>((r) => globalThis.queueMicrotask(() => r()));
}

describe("vnode-reconcile：canPatchIntrinsic", () => {
  it("根标签一致、静态子树一致时为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    mountVNodeTree(
      parent,
      jsx("div", {
        id: "intrinsic-ruler-root",
        children: jsx("span", {
          id: "intrinsic-ruler-label",
          children: "hello",
        }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      id: "intrinsic-ruler-root",
      children: jsx("span", {
        id: "intrinsic-ruler-label",
        children: "world",
      }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  it("根标签不一致时为 false", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    mountVNodeTree(parent, jsx("div", { children: "x" }));
    const root = parent.firstElementChild as Element;
    expect(canPatchIntrinsic(root, jsx("p", { children: "x" }))).toBe(false);
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 步骤 5：受控 input 的 `value` 为无参 getter 时仍视为本征可 patch（由 patch 路径重绑 effect，非结构变化）。
   */
  it("受控 input 的 value 为无参 getter 时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const valueGetter = () => "x";
    mountVNodeTree(
      parent,
      jsx("div", {
        id: "wrap",
        children: jsx("input", {
          id: "inp",
          type: "text",
          value: valueGetter,
        }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      id: "wrap",
      children: jsx("input", {
        id: "inp",
        type: "text",
        value: valueGetter,
      }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 主路径：响应式 `disabled` / `readOnly` 须与受控 value 一样参与 canPatch，否则会整段卸 DOM。
   */
  it("input 上响应式 disabled 与 readOnly 为无参 getter 时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const valueGetter = () => "x";
    const disGetter = () => false;
    const roGetter = () => false;
    mountVNodeTree(
      parent,
      jsx("div", {
        id: "wrap",
        children: jsx("input", {
          id: "inp",
          type: "text",
          value: valueGetter,
          disabled: disGetter,
          readOnly: roGetter,
        }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      id: "wrap",
      children: jsx("input", {
        id: "inp",
        type: "text",
        value: valueGetter,
        disabled: disGetter,
        readOnly: roGetter,
      }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 主路径：动态 placeholder / spellCheck 与 value 并存时须可 patch，避免父级状态抖动导致整段换 input。
   */
  it("input 上响应式 placeholder 与 spellCheck 时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const valueGetter = () => "x";
    const phGetter = () => "hint";
    const spellGetter = () => true;
    mountVNodeTree(
      parent,
      jsx("div", {
        id: "wrap",
        children: jsx("input", {
          id: "inp",
          type: "text",
          value: valueGetter,
          placeholder: phGetter,
          spellCheck: spellGetter,
        }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      id: "wrap",
      children: jsx("input", {
        id: "inp",
        type: "text",
        value: valueGetter,
        placeholder: phGetter,
        spellCheck: spellGetter,
      }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  it("input 上响应式 maxLength 与 pattern 时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const valueGetter = () => "x";
    const maxGetter = () => "8";
    const patGetter = () => "[0-9]*";
    mountVNodeTree(
      parent,
      jsx("div", {
        id: "wrap",
        children: jsx("input", {
          id: "inp",
          type: "text",
          value: valueGetter,
          maxLength: maxGetter,
          pattern: patGetter,
        }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      id: "wrap",
      children: jsx("input", {
        id: "inp",
        type: "text",
        value: valueGetter,
        maxLength: maxGetter,
        pattern: patGetter,
      }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  it("input 上响应式 id 与 tabIndex 时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const valueGetter = () => "x";
    const idGetter = () => "dyn-inp";
    const tabGetter = () => "0";
    mountVNodeTree(
      parent,
      jsx("div", {
        children: jsx("input", {
          type: "text",
          id: idGetter,
          tabIndex: tabGetter,
          value: valueGetter,
        }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      children: jsx("input", {
        type: "text",
        id: idGetter,
        tabIndex: tabGetter,
        value: valueGetter,
      }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 主路径：仅外壳 `className` 为响应式时不应误判不可 patch（`bindIntrinsicReactiveDomProps` 已同步 class）。
   */
  it("div 上响应式 className 且子树静态一致时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const clsGetter = () => "row";
    mountVNodeTree(
      parent,
      jsx("div", {
        className: clsGetter,
        children: jsx("span", { children: "hi" }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      className: clsGetter,
      children: jsx("span", { children: "ho" }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 响应式 inline `style`（无参 getter）须可 patch，与 `bindIntrinsicReactiveDomProps` 中 style effect 对齐。
   */
  it("div 上响应式 style 对象 getter 时 canPatch 为 true", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const stGetter = () => ({ color: "red" });
    mountVNodeTree(
      parent,
      jsx("div", {
        style: stGetter,
        children: jsx("span", { children: "x" }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const next = jsx("div", {
      style: stGetter,
      children: jsx("span", { children: "y" }),
    });
    expect(canPatchIntrinsic(root, next)).toBe(true);
    globalThis.document.body.removeChild(parent);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("vnode-reconcile：patchIntrinsicSubtree", () => {
  it("就地更新后文本与全量重挂一致，且根元素引用不变", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    mountVNodeTree(
      parent,
      jsx("div", {
        id: "patch-root",
        children: jsx("span", { children: "before" }),
      }),
    );
    const root = parent.firstElementChild as Element;
    const rootRef = root;

    const nextVnode = jsx("div", {
      id: "patch-root",
      children: jsx("span", { children: "after" }),
    });
    expect(canPatchIntrinsic(root, nextVnode)).toBe(true);
    patchIntrinsicSubtree(root, nextVnode);
    expect(root).toBe(rootRef);
    expect(parent.textContent).toBe("after");

    const parentB = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parentB);
    mountVNodeTree(parentB, nextVnode);
    expect(parentB.textContent).toBe("after");

    globalThis.document.body.removeChild(parent);
    globalThis.document.body.removeChild(parentB);
  });

  it("结构不兼容时 patch 抛错", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    mountVNodeTree(parent, jsx("div", { children: "a" }));
    const root = parent.firstElementChild as Element;
    expect(() => patchIntrinsicSubtree(root, jsx("p", { children: "a" })))
      .toThrow(/结构不兼容/);
    globalThis.document.body.removeChild(parent);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("vnode-reconcile：insertReactive patch（步骤 5 受控 + 组件边界）", () => {
  /**
   * getter 若同时依赖「包装」signal 与受控 input，外层重跑时应 canPatch 并保留同一 input 元素。
   */
  it("getter 读 phase 且 input value 为 getter 时更新后 input 节点不变", async () => {
    const phase = createSignal(0);
    const val = createSignal("x");
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(parent, () =>
      jsx("div", {
        id: "wrap",
        "data-phase": String(phase.value),
        children: jsx("input", {
          id: "inp",
          type: "text",
          value: () => val.value,
        }),
      }));
    await flush();
    const input1 = parent.querySelector("#inp");
    expect(input1).not.toBeNull();
    phase.value = 1;
    await flush();
    const input2 = parent.querySelector("#inp");
    expect(input2).toBe(input1);
    expect((parent.firstElementChild as Element).getAttribute("data-phase"))
      .toBe(
        "1",
      );
    dispose();
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 细粒度受控：value 与 DOM 已一致时不应重复 `input.value = ...`，否则多浏览器会把选区打回末尾。
   */
  it("本征 patch 且受控 value 未变时保留 caret（依赖仅 phase 变）", async () => {
    const phase = createSignal(0);
    const val = createSignal("hello");
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(parent, () =>
      jsx("div", {
        id: "wrap-sel",
        "data-phase": String(phase.value),
        children: jsx("input", {
          id: "inp-caret",
          type: "text",
          value: () => val.value,
        }),
      }));
    await flush();
    const input = parent.querySelector("#inp-caret") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.focus();
    input.setSelectionRange(2, 2);
    expect(input.selectionStart).toBe(2);

    phase.value = 1;
    await flush();

    expect(parent.querySelector("#inp-caret")).toBe(input);
    expect(input.selectionStart).toBe(2);
    dispose();
    globalThis.document.body.removeChild(parent);
  });

  /**
   * 合同：列表行式布局——仅外壳 className 响应式、内层受控 input，依赖 phase 更新时根与焦点不变。
   */
  it("insertReactive：响应式 className 外壳 + 受控 input 时 phase 变仍同一 input 且焦点保留", async () => {
    const rowOn = createSignal(true);
    const clsGetter = () => (rowOn.value ? "on" : "off");
    const val = createSignal("x");
    const phase = createSignal(0);
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(parent, () =>
      jsx("div", {
        className: clsGetter,
        "data-phase": String(phase.value),
        children: jsx("input", {
          id: "row-inp",
          type: "text",
          value: () => val.value,
        }),
      }));
    await flush();
    const inp = parent.querySelector("#row-inp") as HTMLInputElement;
    expect(inp).not.toBeNull();
    inp.focus();
    inp.setSelectionRange(1, 1);
    phase.value = 1;
    await flush();
    expect(parent.querySelector("#row-inp")).toBe(inp);
    expect(globalThis.document.activeElement).toBe(inp);
    expect(inp.selectionStart).toBe(1);
    rowOn.value = false;
    await flush();
    expect(parent.querySelector("#row-inp")).toBe(inp);
    expect(globalThis.document.activeElement).toBe(inp);
    dispose();
    globalThis.document.body.removeChild(parent);
  });
});

describe("vnode-reconcile：patch 与 onClick 换绑（步骤 3）", () => {
  it("insertReactive 本征 patch 后仅最新 onClick 触发", async () => {
    const phase = createSignal(0);
    let a = 0;
    let b = 0;
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);
    const dispose = insertReactive(parent, () =>
      jsx("button", {
        type: "button",
        id: "ev-patch-btn",
        onClick: phase.value === 0
          ? (_e: Event) => {
            a++;
          }
          : (_e: Event) => {
            b++;
          },
        children: "x",
      }));
    await flush();
    (parent.querySelector("#ev-patch-btn") as HTMLButtonElement).click();
    expect(a).toBe(1);
    expect(b).toBe(0);
    phase.value = 1;
    await flush();
    (parent.querySelector("#ev-patch-btn") as HTMLButtonElement).click();
    expect(a).toBe(1);
    expect(b).toBe(1);
    dispose();
    globalThis.document.body.removeChild(parent);
  });
}, { sanitizeOps: false, sanitizeResources: false });
