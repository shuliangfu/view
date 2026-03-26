/**
 * `insertReactive` **数组返回** 时的本征就地 patch：与单根 VNode 分支一致，
 * 在 `runInsertReactiveIntrinsicVNodeCleanup` 中可 **保留 DOM**，在 effect 主体内对每项
 * {@link patchIntrinsicSubtree}，避免每轮 detach+重挂（Transfer 多兄弟、Table 多行等）。
 *
 * **key 协调（向 `<For>`` 靠拢）**：在上一轮记录了**唯一稳定 key** 时，支持
 * **等长重排**、**删行**、**增行** 的组合：复用已有 `Element`、对移除项先
 * {@link runDirectiveUnmount} 再 `removeChild`、新项经 `mountVNodeTree` 挂到临时 fragment
 * 再自右向左 `insertBefore` 入位；**全为已挂父上的复用节点时**单次扫父子链得秩并以 LIS 少移动，
 * **含新挂项时**仍用逐格 `nextSibling` 判定（并避免 fragment 与列表尾 `null` 误判）。
 * **全复用且兄弟序已与目标 key 序一致**时跳过重排（与 细粒度「无 DOM 移动」短路径一致）。
 * **开发期**（`enableViewRuntimeDevWarnings`）：重复 key、或仅部分项带 key 时各提示一次并回退整段挂载（与 React 等 keyed 列表预期一致）。
 * **列表源**：{@link expandIrArray} 将 null/undefined 视作 `[]`；getter 宜返回 `coalesceIrList(list)` 以对齐 同类方案 `list() ?? []`（见 `ir-coerce`）。
 * 含嵌套子 `insertReactive` 的项仍须走整段重挂（cleanup 不变量）。
 *
 * @module @dreamer/view/compiler/ir-array-patch
 * @internal
 */

import { viewRuntimeDevWarn } from "../dev-runtime-warn.ts";
import { runDirectiveUnmount } from "../dom/unmount.ts";
import { isVNodeLike } from "../dom/shared.ts";
import type { VNode } from "../types.ts";
import { expandIrArray, type IrCoercedItem } from "./ir-coerce.ts";
import { createReactiveInsertFragment } from "./insert-reactive-siblings.ts";
import { mountVNodeTree } from "./vnode-mount.ts";
import { canPatchIntrinsic, patchIntrinsicSubtree } from "./vnode-reconcile.ts";

/**
 * 将 VNode 的 `key` 编成**内部稳定字符串**，供 keyed 列表 Map 使用。
 * 与同类方案 一致：`number`（含 `Object.is` 下 `0` 与 `-0`）/ `bigint` / `boolean` 等与同形的 `string` key **不**因 `String(x)` 合并
 * （避免 `1` 与 `"1"` 被当成同一项导致错误复用 DOM）。
 *
 * @param raw - `VNode.key`
 * @returns 非空内部串；`null`/`undefined`/空字符串表示无 key
 */
function internalKeyStringFromRawKey(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    /** 与同类方案 / `Object.is` 一致：`0` 与 `-0` 为不同 key */
    if (raw !== raw) return "\0n\0NaN";
    if (Object.is(raw, -0)) return "\0n\0-0";
    return `\0n\0${raw}`;
  }
  if (typeof raw === "bigint") {
    return `\0b\0${String(raw)}`;
  }
  if (typeof raw === "boolean") {
    return raw ? "\0z\0true" : "\0z\0false";
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "symbol") {
    return `\0y\0${String(raw)}`;
  }
  return `\0o\0${String(raw)}`;
}

/**
 * 判断扁平后的数组项是否均可与 `currentNodes` 同序一一 {@link canPatchIntrinsic}。
 *
 * @param items - {@link expandIrArray} 结果
 * @param currentNodes - 上一轮追踪的兄弟节点
 */
function arrayItemsAllIntrinsicallyPatchable(
  items: readonly IrCoercedItem[],
  currentNodes: readonly Node[],
): items is readonly VNode[] {
  if (items.length !== currentNodes.length || items.length === 0) return false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const n = currentNodes[i]!;
    if (typeof it === "function") return false;
    if (!isVNodeLike(it)) return false;
    if (n.nodeType !== 1) return false;
    if (!canPatchIntrinsic(n, it)) return false;
  }
  return true;
}

/**
 * 同序索引 patch 是否**语义**允许：若存在上一轮稳定 key 列，且本轮 VNode 也带相同粒度 key，
 * 则须 **下标 i 的 key 与上一轮 i 一致**；否则应按 key 协调，禁止把「第 i 个 DOM」错配给
 * 「新一轮第 i 个 VNode」（例如两行均为 `tr` 时 {@link canPatchIntrinsic} 仍可能为 true）。
 *
 * @param prevVNodeKeys - 上一轮 commit 记录；无记录时不限制
 */
function arrayItemsAllowIndexAlignedIntrinsicPatch(
  items: readonly IrCoercedItem[],
  currentNodes: readonly Node[],
  prevVNodeKeys: readonly string[] | null | undefined,
): items is readonly VNode[] {
  if (!arrayItemsAllIntrinsicallyPatchable(items, currentNodes)) return false;
  if (prevVNodeKeys == null || prevVNodeKeys.length !== items.length) {
    return true;
  }
  const nk = extractStableVNodeKeysFromCoercedItems(items);
  if (nk == null) return true;
  for (let i = 0; i < nk.length; i++) {
    if (nk[i] !== prevVNodeKeys[i]) return false;
  }
  return true;
}

/**
 * 从扁平后的数组项提取「可用于 key 协调」的 key 列：须**全部为 VNode**、**均有非空 key**、
 * **两两不同**。含 MountFn 或非 VNode 时返回 null（与手写/编译混合列表一致，不强行 key 路径）。
 * 内部串由 `internalKeyStringFromRawKey` 生成：`string` key 仍为原字面量，数字等与同形字符串区分。
 *
 * @param items - {@link expandIrArray} 结果
 * @returns 与 `items` 等长的内部稳定 key 列，或 null
 */
export function extractStableVNodeKeysFromCoercedItems(
  items: readonly IrCoercedItem[],
): string[] | null {
  if (items.length === 0) return null;
  /** 每项的编码后 key；缺失 key 时为 null（与 `<For>`` 须整表显式 key 才能稳定协调一致） */
  const raw: (string | null)[] = [];
  for (const it of items) {
    if (typeof it === "function") return null;
    if (!isVNodeLike(it)) return null;
    raw.push(internalKeyStringFromRawKey((it as VNode).key));
  }
  const anyDefined = raw.some((k) => k != null);
  const allDefined = raw.every((k) => k != null);
  if (!allDefined) {
    /**
     * 混用「有 key / 无 key」时无法与 `prevVNodeKeys` 对齐，走整段挂载；
     * 开发模式下提示一次，便于对齐 细粒度「列表项一律带 key」的写法。
     */
    if (anyDefined) {
      viewRuntimeDevWarn(
        "insert-reactive:keyed-partial",
        "insertReactive 数组项 key 不完整：须**全部**为非空 key 才能走 keyed 协调，否则回退整段挂载（与同类方案 显式 keyed 列表一致）。",
      );
    }
    return null;
  }
  const keys = raw as string[];
  if (new Set(keys).size !== keys.length) {
    viewRuntimeDevWarn(
      "insert-reactive:keyed-duplicate",
      "insertReactive 数组项出现**重复** key，将回退整段挂载（与同类方案 / React keyed 列表一致）。",
    );
    return null;
  }
  return keys;
}

/** 单槽：复用旧本征根或本轮新挂载 */
type IntrinsicKeyedSlot =
  | { kind: "reuse"; el: Element; vn: VNode }
  | { kind: "new"; vn: VNode };

/**
 * 本征 keyed 协调计划：删 orphan、按序插槽（复用 / 新挂）、再统一 `insertBefore` 与 patch。
 */
type IntrinsicKeyedReconcilePlan = {
  parent: Node;
  endRef: Node | null;
  slots: IntrinsicKeyedSlot[];
  orphans: Element[];
};

/**
 * 在已有 `prevVNodeKeys` 与 `currentNodes` 对齐的前提下，分析本轮 `items` 是否可走 keyed 协调。
 * 支持长度变化；新 key 走 `new` 槽，旧 key 不在新列表则进 `orphans`。
 *
 * @param items - 本轮扁平后的项
 * @param currentNodes - 上一轮 DOM 顺序
 * @param prevVNodeKeys - 上一轮稳定 key 列
 */
function analyzeIntrinsicKeyedReconcilePlan(
  items: readonly IrCoercedItem[],
  currentNodes: readonly Node[],
  prevVNodeKeys: readonly string[],
): IntrinsicKeyedReconcilePlan | null {
  if (
    prevVNodeKeys.length !== currentNodes.length || currentNodes.length === 0
  ) {
    return null;
  }
  const parent = currentNodes[0]!.parentNode;
  if (parent == null) return null;

  for (let i = 0; i < currentNodes.length; i++) {
    if (currentNodes[i]!.parentNode !== parent) return null;
  }

  const nk = extractStableVNodeKeysFromCoercedItems(items);
  if (nk == null) return null;

  const oldKeyToEl = new Map<string, Element>();
  for (let i = 0; i < currentNodes.length; i++) {
    const k = prevVNodeKeys[i]!;
    if (oldKeyToEl.has(k)) return null;
    const node = currentNodes[i]!;
    if (node.nodeType !== 1) return null;
    oldKeyToEl.set(k, node as Element);
  }

  const newKeySet = new Set(nk);
  const orphans: Element[] = [];
  for (const [k, el] of oldKeyToEl) {
    if (!newKeySet.has(k)) orphans.push(el);
  }

  const slots: IntrinsicKeyedSlot[] = [];
  for (let j = 0; j < items.length; j++) {
    const it = items[j]!;
    if (typeof it === "function" || !isVNodeLike(it)) return null;
    const vn = it as VNode;
    const sk = nk[j]!;
    if (internalKeyStringFromRawKey(vn.key) !== sk) return null;
    const el = oldKeyToEl.get(sk);
    if (el != null) {
      if (!canPatchIntrinsic(el, vn)) return null;
      slots.push({ kind: "reuse", el, vn });
    } else {
      slots.push({ kind: "new", vn });
    }
  }

  const endRef = currentNodes[currentNodes.length - 1]!.nextSibling;

  return { parent, endRef, slots, orphans };
}

/**
 * 从临时 fragment 取第一个本征根（跳过空白文本等），供 keyed 新挂项入位。
 *
 * @param frag - `mountVNodeTree` 后的容器
 */
function firstElementChildInFrag(frag: ParentNode): Element | null {
  for (let c = frag.firstChild; c != null; c = c.nextSibling) {
    if (c.nodeType === 1) return c as Element;
  }
  return null;
}

/** `compareDocumentPosition` 位标志（避免依赖 `globalThis.Node`，SSR/部分测试环境无 Node 构造函数） */
const DOC_POS_FOLLOWING = 4;
const DOC_POS_PRECEDING = 2;

/**
 * 沿 `parent` 子节点链单次扫描，为 `ordered` 中出现的本征根按**当前**文档序编号（O(父子节点数)）。
 * 与 细粒度实现同向：用真实兄弟序做秩，避免对列表项两两 `compareDocumentPosition` 排序。
 *
 * @returns 与 `ordered` 等长的秩列；若有项 `parentNode===parent` 却未出现在子链中则返回 null（回退 {@link rankElementsByDocumentOrder}）
 */
function docOrderRanksBySiblingWalk(
  parent: Node,
  ordered: readonly Element[],
): number[] | null {
  const want = new Set<Element>(ordered);
  const rankOf = new Map<Element, number>();
  let k = 0;
  for (let c = parent.firstChild; c !== null; c = c.nextSibling) {
    if (c.nodeType !== 1) continue;
    const el = c as Element;
    if (want.has(el)) {
      rankOf.set(el, k++);
    }
  }
  if (rankOf.size !== ordered.length) return null;
  const seq: number[] = new Array(ordered.length);
  for (let i = 0; i < ordered.length; i++) {
    const r = rankOf.get(ordered[i]!);
    if (r === undefined) return null;
    seq[i] = r;
  }
  return seq;
}

/**
 * 按文档顺序为 `els` 编号 0..n-1（回退路径：对列表项排序，O(n log n)）。
 *
 * @param els - 互不相同的本征根
 */
function rankElementsByDocumentOrder(
  els: readonly Element[],
): Map<Element, number> {
  const sorted = [...els].sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    if (pos & DOC_POS_FOLLOWING) return -1;
    if (pos & DOC_POS_PRECEDING) return 1;
    return 0;
  });
  const m = new Map<Element, number>();
  for (let i = 0; i < sorted.length; i++) {
    m.set(sorted[i]!, i);
  }
  return m;
}

/**
 * 求 `seq` 的一条最长**严格递增**子序列在 `seq` 中的下标集合（耐心排序 + 回溯）。
 * 与 Vue 3 / 细粒度 keyed 协调一致：这些下标上的节点相对顺序已正确，可少做 `insertBefore`。
 *
 * @param seq - 每个位置在「重排前文档序」中的秩
 */
function longestStrictIncreasingSubsequenceIndexSet(
  seq: readonly number[],
): Set<number> {
  const n = seq.length;
  if (n === 0) return new Set();
  /** 长度为 len 的递增链，其末尾元素在 seq 中的下标 */
  const tailIdx: number[] = [];
  const prevIdx: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const v = seq[i]!;
    const lastT = tailIdx.length > 0 ? tailIdx[tailIdx.length - 1]! : -1;
    if (tailIdx.length === 0 || v > seq[lastT]!) {
      if (tailIdx.length > 0) prevIdx[i] = lastT;
      tailIdx.push(i);
    } else {
      let lo = 0;
      let hi = tailIdx.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (seq[tailIdx[mid]!]! < v) lo = mid + 1;
        else hi = mid;
      }
      tailIdx[lo] = i;
      if (lo > 0) prevIdx[i] = tailIdx[lo - 1]!;
    }
  }
  const out = new Set<number>();
  let cur = tailIdx[tailIdx.length - 1]!;
  while (cur !== -1) {
    out.add(cur);
    cur = prevIdx[cur]!;
  }
  return out;
}

/**
 * LIS 前构造「重排前秩」序列：优先 {@link docOrderRanksBySiblingWalk}，失败时回退 {@link rankElementsByDocumentOrder}。
 */
function docOrderRanksForKeyedReorder(
  parent: Node,
  ordered: readonly Element[],
): number[] {
  const linear = docOrderRanksBySiblingWalk(parent, ordered);
  if (linear !== null) return linear;
  const rank = rankElementsByDocumentOrder(ordered);
  return ordered.map((el) => rank.get(el)!);
}

/**
 * 判断 `ordered` 中本征根在 `parent` 子链上的**相对文档序**是否已与数组下标一致（0 最先、依次递增）。
 * 用于全复用 keyed 更新时跳过整段 `insertBefore`（细粒度常见 noop 重绘）。
 *
 * @param parent - 列表父节点
 * @param ordered - 目标顺序的本征根（须已挂在 `parent` 下）
 */
function isDesiredKeyedSiblingOrderAlreadyAligned(
  parent: Node,
  ordered: readonly Element[],
): boolean {
  if (ordered.length === 0) return true;
  const seq = docOrderRanksBySiblingWalk(parent, ordered);
  if (seq === null) return false;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] !== i) return false;
  }
  return true;
}

/**
 * 将 `ordered` 中本征根按数组顺序排在 `parent` 内，且紧挨在 `afterAll` 之前。
 * - **含新挂节点**（尚在 fragment 或刚入父）：自右向左 `insertBefore`，且仅在 `parentNode===parent` 且 `nextSibling===ref` 时跳过（避免 fragment 与尾 `null` 误判）。
 * - **全部为已挂父上的复用节点**（细粒度常见「仅重排」）：含单槽；单次兄弟扫描得秩 + LIS，自右向左只移动**不在** LIS 内的槽位。
 *
 * @param parent - 列表父节点
 * @param ordered - 目标顺序的本征根（可含刚从 fragment 摘入的节点）
 * @param afterAll - 列表尾之后的兄弟（`null` 表示插在父末尾）
 * @param ins - `parent.insertBefore` 绑定调用
 */
function reorderIntrinsicKeyedSiblingsBeforeRef(
  parent: Node,
  ordered: readonly Element[],
  afterAll: Node | null,
  ins: (newChild: Node, refChild: Node | null) => void,
): void {
  const n = ordered.length;
  const allReuseAlreadyInParent = n > 0 &&
    ordered.every((el) => el.parentNode === parent);

  /** `n===1` 时 LIS 恒为单点稳定，与逐格分支同为零次 `insertBefore`，路径统一便于维护 */
  if (allReuseAlreadyInParent && n >= 1) {
    const seq = docOrderRanksForKeyedReorder(parent, ordered);
    const stable = longestStrictIncreasingSubsequenceIndexSet(seq);
    let last: Node | null = afterAll;
    for (let i = n - 1; i >= 0; i--) {
      const node = ordered[i]!;
      if (stable.has(i)) {
        last = node;
        continue;
      }
      const alreadyPlaced = node.parentNode === parent;
      if (!alreadyPlaced || node.nextSibling !== last) {
        ins.call(parent, node, last);
      }
      last = node;
    }
    return;
  }

  let ref: Node | null = afterAll;
  for (let j = n - 1; j >= 0; j--) {
    const node = ordered[j]!;
    /**
     * 新挂项尚在临时 fragment 时 `nextSibling` 与 `afterAll === null` 可能同为 null，
     * 若仅凭 `nextSibling === ref` 会误跳过 insert，随后以该节点为 ref 会抛「非子节点」。
     */
    const alreadyPlaced = node.parentNode === parent;
    if (!alreadyPlaced || node.nextSibling !== ref) {
      ins.call(parent, node, ref);
    }
    ref = node;
  }
}

/**
 * 执行 {@link analyzeIntrinsicKeyedReconcilePlan}：摘 orphan、挂载新槽、（必要时）重排、`patchIntrinsicSubtree`。
 *
 * @param plan - 分析结果
 * @param currentNodes - 替换为新一轮追踪列表
 * @returns 是否成功（新挂顶非 `Element` 等会失败）
 */
function executeIntrinsicKeyedReconcilePlan(
  plan: IntrinsicKeyedReconcilePlan,
  currentNodes: Node[],
): boolean {
  const { parent, endRef, slots, orphans } = plan;
  const ins = (parent as unknown as {
    insertBefore?: (newChild: Node, refChild: Node | null) => void;
  }).insertBefore;
  if (typeof ins !== "function") return false;

  for (const el of orphans) {
    runDirectiveUnmount(el);
    el.parentNode?.removeChild(el);
  }

  const desired: Element[] = [];
  for (const s of slots) {
    if (s.kind === "reuse") {
      desired.push(s.el);
    } else {
      const frag = createReactiveInsertFragment();
      mountVNodeTree(frag, s.vn);
      const rootEl = firstElementChildInFrag(frag);
      if (rootEl == null) return false;
      desired.push(rootEl);
    }
  }

  /**
   * 全复用且兄弟序已等于目标 key 序时不必 `insertBefore`（细粒度 noop 列表更新）。
   * 含新挂项时 `desired` 中必有节点尚不在 `parent` 上，对齐检测为 false，仍走重排。
   */
  const allSlotsReuse = slots.every((s) => s.kind === "reuse");
  if (
    !allSlotsReuse ||
    !isDesiredKeyedSiblingOrderAlreadyAligned(parent, desired)
  ) {
    reorderIntrinsicKeyedSiblingsBeforeRef(
      parent,
      desired,
      endRef,
      (n, r) => ins.call(parent, n, r),
    );
  }

  for (let j = 0; j < desired.length; j++) {
    patchIntrinsicSubtree(desired[j]!, slots[j]!.vn);
  }

  currentNodes.length = 0;
  for (const el of desired) {
    currentNodes.push(el);
  }
  return true;
}

/**
 * 按键协调（含增删与重排）；成功时**就地**更新 `currentNodes`。
 */
function patchInsertReactiveArrayKeyed(
  items: readonly IrCoercedItem[],
  currentNodes: Node[],
  prevVNodeKeys: readonly string[],
): boolean {
  const plan = analyzeIntrinsicKeyedReconcilePlan(
    items,
    currentNodes,
    prevVNodeKeys,
  );
  if (plan == null) return false;
  return executeIntrinsicKeyedReconcilePlan(plan, currentNodes);
}

/**
 * 供 `ir-clean` 预判：下一轮 getter 为数组且可整组保留 DOM
 * （同序 patch 或 keyed 协调）。
 *
 * @param currentNodes - 当前追踪节点（与上一轮 commit 一致）
 * @param nextPeek - `untrack(readReactiveInsertRawFromGetter(getter))` 的原始值
 * @param prevVNodeKeys - 上一轮 commit 时记录的稳定 key 列；无则传 null/undefined
 */
export function canKeepDomForInsertReactiveArrayPatch(
  currentNodes: readonly Node[],
  nextPeek: unknown,
  prevVNodeKeys?: readonly string[] | null,
): boolean {
  if (!Array.isArray(nextPeek)) return false;
  const items = expandIrArray(nextPeek as unknown[]);
  if (
    arrayItemsAllowIndexAlignedIntrinsicPatch(
      items,
      currentNodes,
      prevVNodeKeys ?? null,
    )
  ) {
    return true;
  }
  if (
    prevVNodeKeys != null &&
    analyzeIntrinsicKeyedReconcilePlan(
        items,
        currentNodes,
        prevVNodeKeys,
      ) != null
  ) {
    return true;
  }
  return false;
}

/**
 * 对 `currentNodes` 逐项 patch；调用前须已 {@link canKeepDomForInsertReactiveArrayPatch} 或同等校验。
 *
 * @param items - 与 {@link expandIrArray} 一致
 * @param currentNodes - 可变引用，patch 后仍指向同一节点
 * @param prevVNodeKeys - 上一轮 key 列；有 key 重排时须传入以禁止错配索引 patch
 * @returns 是否已执行 patch（false 时调用方应走整段挂载）
 */
export function patchInsertReactiveArrayInPlace(
  items: readonly IrCoercedItem[],
  currentNodes: Node[],
  prevVNodeKeys?: readonly string[] | null,
): boolean {
  if (
    !arrayItemsAllowIndexAlignedIntrinsicPatch(
      items,
      currentNodes,
      prevVNodeKeys ?? null,
    )
  ) {
    return false;
  }
  for (let i = 0; i < items.length; i++) {
    patchIntrinsicSubtree(currentNodes[i]! as Element, items[i]! as VNode);
  }
  return true;
}

/**
 * 先尝试同序 {@link patchInsertReactiveArrayInPlace}；失败时用 `prevVNodeKeys` 尝试
 * keyed 协调（等长重排、删行、增行）。
 *
 * @param items - 本轮扁平后的项
 * @param currentNodes - 可变
 * @param prevVNodeKeys - 上一轮稳定 key 列，无则 null
 * @returns 是否已由本函数完成 patch（含 keyed 路径）
 */
export function patchInsertReactiveArrayInPlaceOrKeyed(
  items: readonly IrCoercedItem[],
  currentNodes: Node[],
  prevVNodeKeys: readonly string[] | null,
): boolean {
  if (patchInsertReactiveArrayInPlace(items, currentNodes, prevVNodeKeys)) {
    return true;
  }
  if (prevVNodeKeys == null) return false;
  return patchInsertReactiveArrayKeyed(items, currentNodes, prevVNodeKeys);
}
