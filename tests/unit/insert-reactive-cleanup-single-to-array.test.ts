/**
 * 回归：`currentNodes.length === 1` 且 effect 重跑前 `untrack(getter)` 得到 **VNode[]**（如 keyed 从 1 项增到多项）时，
 * {@link runInsertReactiveIntrinsicVNodeCleanup} 须判定可保留 DOM，**不得** detach；否则次帧 `currentNodes` 被清空会整段重挂。
 *
 * 与 {@link insert-reactive-keyed-patch-isolated.test.ts} 互补：本文件只测 cleanup 标尺，不经 `patchInsertReactiveArrayInPlaceOrKeyed`。
 */
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import { detachInsertReactiveTrackedChild } from "../../src/compiler/insert.ts";
import { runInsertReactiveIntrinsicVNodeCleanup } from "../../src/compiler/ir-clean.ts";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";
import { extractStableVNodeKeysFromCoercedItems } from "../../src/compiler/ir-array-patch.ts";
import { expandIrArray } from "../../src/compiler/ir-coerce.ts";
import { jsx } from "@dreamer/view/jsx-runtime";

describe("ir-clean：单槽 → 下一轮数组", () => {
  /**
   * 模拟首轮数组 commit 后：`currentNodes` 仅一项、`prevArrayVNodeKeys` 与 DOM 对齐；
   * 下一轮 getter 返回 **两项** 的 keyed 数组；cleanup 应走 `canKeepDomForInsertReactiveArrayPatch` 为 true。
   */
  it("单槽 + prev key + 下一轮为更长 keyed 数组时不应 detach、不清空 currentNodes", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);

    const v0 = jsx("div", { key: "p", children: "p-1" });
    mountVNodeTree(parent, v0);
    const elP = parent.firstElementChild as globalThis.Element;
    expect(elP).toBeTruthy();

    const items0 = expandIrArray([v0]);
    const prevKeys = extractStableVNodeKeysFromCoercedItems(items0);
    expect(prevKeys).toEqual(["p"]);

    const currentNodes: globalThis.Node[] = [elP];
    let detachCount = 0;
    const detachTracked = (n: globalThis.Node): void => {
      detachCount++;
      detachInsertReactiveTrackedChild(n);
    };

    const getter = () => [
      jsx("div", { key: "p", children: "p-2" }),
      jsx("div", { key: "q", children: "q-new" }),
    ];

    runInsertReactiveIntrinsicVNodeCleanup({
      forceFullCleanup: false,
      getter: getter as () => unknown,
      currentNodes,
      prevArrayVNodeKeys: prevKeys,
      childInsertDisposers: [],
      detachTracked,
    });

    expect(detachCount).toBe(0);
    expect(currentNodes.length).toBe(1);
    expect(currentNodes[0]).toBe(elP);
    expect(elP.parentNode).toBe(parent);

    globalThis.document.body.removeChild(parent);
  });

  /**
   * 无上一轮稳定 key 列时，单槽对「更长 keyed 数组」无法安全走 keyed 保留路径，应整段 detach 以便次帧重挂。
   */
  it("单槽 + prev key 为 null + 下一轮为更长 keyed 数组时应 detach 并清空 currentNodes", () => {
    const parent = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(parent);

    const v0 = jsx("div", { key: "p", children: "p-1" });
    mountVNodeTree(parent, v0);
    const elP = parent.firstElementChild as globalThis.Element;

    const currentNodes: globalThis.Node[] = [elP];
    let detachCount = 0;
    const detachTracked = (n: globalThis.Node): void => {
      detachCount++;
      detachInsertReactiveTrackedChild(n);
    };

    const getter = () => [
      jsx("div", { key: "p", children: "p-2" }),
      jsx("div", { key: "q", children: "q-new" }),
    ];

    runInsertReactiveIntrinsicVNodeCleanup({
      forceFullCleanup: false,
      getter: getter as () => unknown,
      currentNodes,
      prevArrayVNodeKeys: null,
      childInsertDisposers: [],
      detachTracked,
    });

    expect(detachCount).toBe(1);
    expect(currentNodes.length).toBe(0);
    expect(elP.parentNode).toBeNull();

    globalThis.document.body.removeChild(parent);
  });
}, { sanitizeOps: false, sanitizeResources: false });
