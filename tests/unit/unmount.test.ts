/**
 * @fileoverview 单元测试：registerDirectiveUnmount / runDirectiveUnmount
 * 覆盖 Element 与 Comment 占位上的登记与执行，确保动态插入点用 Comment 时卸载仍能清理 effect。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  registerDirectiveUnmount,
  runDirectiveUnmount,
  runDirectiveUnmountOnChildren,
} from "../../src/dom/unmount.ts";

describe("unmount (Element)", () => {
  it("registerDirectiveUnmount(el, cb) 后 runDirectiveUnmount(el) 应执行 cb", () => {
    const el = document.createElement("div");
    let called = false;
    registerDirectiveUnmount(el, () => {
      called = true;
    });
    runDirectiveUnmount(el);
    expect(called).toBe(true);
  });

  it("多个 cb 应按登记顺序执行", () => {
    const el = document.createElement("div");
    const order: number[] = [];
    registerDirectiveUnmount(el, () => order.push(1));
    registerDirectiveUnmount(el, () => order.push(2));
    runDirectiveUnmount(el);
    expect(order).toEqual([1, 2]);
  });
}, { sanitizeOps: false, sanitizeResources: false });

describe("unmount (Comment 占位)", () => {
  it("registerDirectiveUnmount(comment, cb) 后 runDirectiveUnmount(comment) 应执行 cb", () => {
    const comment = document.createComment("");
    let called = false;
    registerDirectiveUnmount(comment, () => {
      called = true;
    });
    runDirectiveUnmount(comment);
    expect(called).toBe(true);
  });

  it("Comment 上多个 cb 应按登记顺序执行", () => {
    const comment = document.createComment("");
    const order: number[] = [];
    registerDirectiveUnmount(comment, () => order.push(1));
    registerDirectiveUnmount(comment, () => order.push(2));
    runDirectiveUnmount(comment);
    expect(order).toEqual([1, 2]);
  });

  it("runDirectiveUnmountOnChildren(parent) 应对 Comment 子节点执行已登记的 cb", () => {
    const parent = document.createElement("div");
    const comment = document.createComment("");
    parent.appendChild(comment);
    let called = false;
    registerDirectiveUnmount(comment, () => {
      called = true;
    });
    runDirectiveUnmountOnChildren(parent);
    expect(called).toBe(true);
  });
});
