/**
 * 隔离验证 {@link patchInsertReactiveArrayInPlaceOrKeyed} 增行路径（不经过 insertReactive effect）。
 */
import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  disableViewRuntimeDevWarnings,
  enableViewRuntimeDevWarnings,
} from "../../src/dev-runtime-warn.ts";
import { expandIrArray } from "../../src/compiler/ir-coerce.ts";
import {
  extractStableVNodeKeysFromCoercedItems,
  patchInsertReactiveArrayInPlaceOrKeyed,
} from "../../src/compiler/ir-array-patch.ts";
import { mountVNodeTree } from "../../src/compiler/vnode-mount.ts";
import { jsx } from "@dreamer/view/jsx-runtime";

describe(
  "ir-array-patch 隔离：keyed 增行",
  () => {
    it("patchInsertReactiveArrayInPlaceOrKeyed 应复用首项并追加第二项", () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);

      const v0 = jsx("div", { key: "p", children: "p-1" });
      mountVNodeTree(parent, v0);
      const elP = parent.firstElementChild as globalThis.Element;
      expect(elP).toBeTruthy();

      const items0 = expandIrArray([v0]);
      const prev = extractStableVNodeKeysFromCoercedItems(items0);
      expect(prev).toEqual(["p"]);

      const currentNodes: globalThis.Node[] = [elP];
      const items2 = expandIrArray([
        jsx("div", { key: "p", children: "p-2" }),
        jsx("div", { key: "q", children: "q-new" }),
      ]);
      const ok = patchInsertReactiveArrayInPlaceOrKeyed(
        items2,
        currentNodes,
        prev,
      );
      expect(ok).toBe(true);
      expect(currentNodes.length).toBe(2);
      expect(currentNodes[0]).toBe(elP);
      expect((currentNodes[0] as globalThis.Element).textContent).toBe("p-2");
      expect((currentNodes[1] as globalThis.Element).textContent).toBe("q-new");

      globalThis.document.body.removeChild(parent);
    });

    /**
     * 同类方案 语义：`key={1}` 与 `key="1"` 为不同项，不得因 `String` 化合并（否则会错误复用 DOM）。
     */
    it("extractStableVNodeKeys：0 与 -0 区分为不同 number key（Object.is）", () => {
      const negZero = -0;
      const items = expandIrArray([
        jsx("div", { key: 0, children: "zero" }),
        jsx("div", { key: negZero, children: "negZero" }),
      ]);
      const keys = extractStableVNodeKeysFromCoercedItems(items);
      expect(keys).not.toBeNull();
      expect(keys!.length).toBe(2);
      expect(keys![0]).not.toBe(keys![1]);
    });

    it("extractStableVNodeKeys：number 与同形 string key 互不混淆", () => {
      const items = expandIrArray([
        jsx("div", { key: 1, children: "n" }),
        jsx("div", { key: "1", children: "s" }),
      ]);
      const keys = extractStableVNodeKeysFromCoercedItems(items);
      expect(keys).not.toBeNull();
      expect(keys!.length).toBe(2);
      expect(keys![0]).not.toBe(keys![1]);
    });

    /** 与 React 等 一致：重复 key 不得进入 keyed 协调 */
    it("extractStableVNodeKeys：重复 string key 返回 null", () => {
      const items = expandIrArray([
        jsx("div", { key: "x", children: "a" }),
        jsx("div", { key: "x", children: "b" }),
      ]);
      expect(extractStableVNodeKeysFromCoercedItems(items)).toBeNull();
    });

    /** 须整表带 key；混用无 key 项时返回 null（向常见批处理语义 显式 keyed 列表靠拢） */
    it("extractStableVNodeKeys：仅部分项有 key 返回 null", () => {
      const items = expandIrArray([
        jsx("div", { key: "a", children: "a" }),
        jsx("div", { children: "b" }),
      ]);
      expect(extractStableVNodeKeysFromCoercedItems(items)).toBeNull();
    });

    /**
     * 开发开关下重复 key 会触发一次 console.warn（与 dev-runtime-warn 去重策略一致）。
     */
    it("extractStableVNodeKeys：重复 key 且 VIEW_DEV 开启时警告一次", () => {
      enableViewRuntimeDevWarnings();
      const warns: string[] = [];
      const orig = console.warn;
      console.warn = (...args: unknown[]) => {
        warns.push(args.map(String).join(" "));
      };
      try {
        extractStableVNodeKeysFromCoercedItems(
          expandIrArray([
            jsx("div", { key: "dup", children: "1" }),
            jsx("div", { key: "dup", children: "2" }),
          ]),
        );
        extractStableVNodeKeysFromCoercedItems(
          expandIrArray([
            jsx("div", { key: "dup", children: "3" }),
            jsx("div", { key: "dup", children: "4" }),
          ]),
        );
        expect(warns.length).toBe(1);
        expect(warns[0]).toContain("重复");
      } finally {
        console.warn = orig;
        disableViewRuntimeDevWarnings();
      }
    });

    /** 内部 key 编码下数值 key 仍可走 keyed 重排与 patch */
    it("patchInsertReactiveArrayInPlaceOrKeyed：数值 key 重排后复用节点引用", () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);

      const va = jsx("div", { key: 0, children: "a0" });
      const vb = jsx("div", { key: 1, children: "b0" });
      mountVNodeTree(parent, va);
      mountVNodeTree(parent, vb);
      const el0 = parent.children[0] as globalThis.Element;
      const el1 = parent.children[1] as globalThis.Element;

      const items0 = expandIrArray([va, vb]);
      const prev = extractStableVNodeKeysFromCoercedItems(items0);
      expect(prev).not.toBeNull();

      const currentNodes: globalThis.Node[] = [el0, el1];
      const itemsRev = expandIrArray([
        jsx("div", { key: 1, children: "b1" }),
        jsx("div", { key: 0, children: "a1" }),
      ]);
      const ok = patchInsertReactiveArrayInPlaceOrKeyed(
        itemsRev,
        currentNodes,
        prev,
      );
      expect(ok).toBe(true);
      expect(currentNodes[0]).toBe(el1);
      expect(currentNodes[1]).toBe(el0);
      expect((currentNodes[0] as globalThis.Element).textContent).toBe("b1");
      expect((currentNodes[1] as globalThis.Element).textContent).toBe("a1");

      globalThis.document.body.removeChild(parent);
    });

    /**
     * 全复用、多槽重排走 LIS 路径：验证顺序与节点引用（向 Vue3 等 类协调靠拢的回归）。
     */
    it("patchInsertReactiveArrayInPlaceOrKeyed：四槽数值 key 逆序重排后顺序与引用正确", () => {
      const parent = globalThis.document.createElement("div");
      globalThis.document.body.appendChild(parent);

      const vnodes = [0, 1, 2, 3].map((k) =>
        jsx("div", { key: k, children: `k${k}` })
      );
      for (const v of vnodes) mountVNodeTree(parent, v);
      const els = [
        parent.children[0] as globalThis.Element,
        parent.children[1] as globalThis.Element,
        parent.children[2] as globalThis.Element,
        parent.children[3] as globalThis.Element,
      ];

      const items0 = expandIrArray([...vnodes]);
      const prev = extractStableVNodeKeysFromCoercedItems(items0);
      expect(prev).not.toBeNull();

      const currentNodes: globalThis.Node[] = [...els];
      const rev = [3, 2, 1, 0].map((k) =>
        jsx("div", { key: k, children: `x${k}` })
      );
      const itemsRev = expandIrArray(rev);
      const ok = patchInsertReactiveArrayInPlaceOrKeyed(
        itemsRev,
        currentNodes,
        prev!,
      );
      expect(ok).toBe(true);
      expect(currentNodes.length).toBe(4);
      const want = [els[3]!, els[2]!, els[1]!, els[0]!];
      for (let i = 0; i < 4; i++) {
        expect(currentNodes[i]).toBe(want[i]);
        expect((currentNodes[i] as globalThis.Element).textContent).toBe(
          `x${3 - i}`,
        );
      }

      globalThis.document.body.removeChild(parent);
    });

    /**
     * 全复用且顺序与上一轮 keyed 目标一致时应走「零 insertBefore」短路径（向常见批处理语义 noop 更新靠拢）。
     */
    it("patchInsertReactiveArrayInPlaceOrKeyed：顺序已对齐时不再调用 insertBefore", () => {
      const parent = globalThis.document.body.appendChild(
        globalThis.document.createElement("div"),
      );

      const va = jsx("div", { key: 0, children: "a0" });
      const vb = jsx("div", { key: 1, children: "b0" });
      mountVNodeTree(parent, va);
      mountVNodeTree(parent, vb);
      const el0 = parent.children[0] as globalThis.Element;
      const el1 = parent.children[1] as globalThis.Element;

      const items01 = expandIrArray([va, vb]);
      let prev = extractStableVNodeKeysFromCoercedItems(items01);
      expect(prev).not.toBeNull();

      const currentNodes: globalThis.Node[] = [el0, el1];
      const itemsRev = expandIrArray([
        jsx("div", { key: 1, children: "b1" }),
        jsx("div", { key: 0, children: "a1" }),
      ]);
      expect(
        patchInsertReactiveArrayInPlaceOrKeyed(
          itemsRev,
          currentNodes,
          prev!,
        ),
      ).toBe(true);
      prev = extractStableVNodeKeysFromCoercedItems(itemsRev);
      expect(prev).not.toBeNull();

      const itemsBack = expandIrArray([
        jsx("div", { key: 0, children: "a2" }),
        jsx("div", { key: 1, children: "b2" }),
      ]);
      expect(
        patchInsertReactiveArrayInPlaceOrKeyed(
          itemsBack,
          currentNodes,
          prev!,
        ),
      ).toBe(true);
      prev = extractStableVNodeKeysFromCoercedItems(itemsBack);
      expect(prev).not.toBeNull();

      /** 仅在列表父节点上计数，避免改原型影响其它用例 */
      let insertBeforeCalls = 0;
      const origInsertBefore = parent.insertBefore.bind(parent);
      Object.defineProperty(parent, "insertBefore", {
        configurable: true,
        enumerable: true,
        writable: true,
        value(newChild: globalThis.Node, refChild: globalThis.Node | null) {
          insertBeforeCalls++;
          return origInsertBefore(newChild, refChild);
        },
      });

      try {
        expect(
          patchInsertReactiveArrayInPlaceOrKeyed(
            expandIrArray([
              jsx("div", { key: 0, children: "a3" }),
              jsx("div", { key: 1, children: "b3" }),
            ]),
            currentNodes,
            prev!,
          ),
        ).toBe(true);
        expect(insertBeforeCalls).toBe(0);
        expect(currentNodes[0]).toBe(el0);
        expect(currentNodes[1]).toBe(el1);
      } finally {
        Reflect.deleteProperty(parent, "insertBefore");
      }

      globalThis.document.body.removeChild(parent);
    });
  },
  { sanitizeOps: false, sanitizeResources: false },
);
