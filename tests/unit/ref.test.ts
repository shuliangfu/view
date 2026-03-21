/**
 * @fileoverview createRef：ref.current 经内部 signal，effect 内读 current 可在编译器赋值后重跑；
 * VNode（react-jsx）路径下 mountVNodeTree 须绑定 ref。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { createEffect, createRef } from "@dreamer/view";
import { jsx } from "@dreamer/view/jsx-runtime";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";

describe("createRef (DOM)", () => {
  it("setter 写入后 getter 应返回同一节点", () => {
    const ref = createRef<HTMLElement>();
    expect(ref.current).toBe(null);
    const fake = {} as HTMLElement;
    ref.current = fake;
    expect(ref.current).toBe(fake);
    ref.current = null;
    expect(ref.current).toBe(null);
  });

  it("createEffect 内读 ref.current 应在 ref.current 赋值后重新执行", async () => {
    const ref = createRef<HTMLElement>();
    let runs = 0;
    let last: HTMLElement | null | undefined;
    createEffect(() => {
      runs++;
      last = ref.current;
    });
    expect(runs).toBe(1);
    expect(last).toBe(null);
    const el = {} as HTMLElement;
    ref.current = el;
    await Promise.resolve();
    expect(runs).toBe(2);
    expect(last).toBe(el);
    ref.current = null;
    await Promise.resolve();
    expect(runs).toBe(3);
    expect(last).toBe(null);
  });

  /**
   * dweb / deno.json 使用 "jsx": "react-jsx" + jsxImportSource 时走 jsx()→VNode→mountVNodeTree，
   * 若不在此路径处理 ref，则 createRef 永远不会被赋值（与 compileSource 路径不同）。
   */
  it("mountVNodeTree 本征 input 的 ref={createRef()} 应写入 ref.current", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const inputRef = createRef<HTMLInputElement>(null);
    const vnode = jsx("input", {
      type: "text",
      ref: inputRef,
    });
    mountVNodeTree(container, vnode);
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    await Promise.resolve();
    expect(inputRef.current).toBe(input);
    document.body.removeChild(container);
  });
}, { sanitizeOps: false, sanitizeResources: false });
