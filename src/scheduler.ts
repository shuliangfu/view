/**
 * @module @dreamer/view/scheduler
 * @description
 * View 模板引擎 — 调度器（微任务批处理）。供 signal、store、effect 共用：订阅者/effect 不在此 tick 内同步执行，而是加入队列，由一次微任务统一 flush，避免同步重入导致主线程卡死。队列与 scheduled 存于 globalThis，本模块自包含实现，保证 main 与 code-split chunk 共用同一队列与同一 flush。
 *
 * **输入框「失焦 / 丢光标」与同类方案 对齐的层次（本模块只占最后一层）：**
 * - **主路径（与同类方案 一致）**：`insertReactive` 本征 **patch**（`canPatchIntrinsic` + `patchIntrinsicSubtree`）、**数组 keyed 协调**、**编译期静态提升**缩小 getter —— **不换同一 DOM**，焦点自然不断；见 `compiler/ir-clean.ts`、`vnode-reconcile.ts`、`jsx-compiler/transform.ts`。
 * - **兜底（步骤 6，本文件）**：整段仍被 detach 时，`flushQueue` 批首快照、批末启发式 `focus` / 选区恢复；**默认关**，且 **不能替代** 上述 reconcile。
 *
 * **本模块导出：**
 * - `schedule(run)`：将任务加入队列，微任务中执行
 * - `unschedule(run)`：从队列移除任务（如 effect dispose 时）
 * - **步骤 6**：`setViewSchedulerFocusRestoreEnabled` / `getViewSchedulerFocusRestoreEnabled` —— `flushQueue` 首尾快照/恢复焦点（**默认关**，仅显式 `true` 开启）
 * - **IME**：`schedule` 首次执行时在 `document` 上安装 `compositionstart` / `compositionend`，维护 `KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH`；`vnode-mount` 受控 `value` 在组字期对活动文本控件跳过回写。
 * - **组字期推迟 flush（可选）**：`KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING` 为严格 `true` 且 composition 深度大于 0 时，以微任务链推迟 `flushQueue` 直至深度归零；默认关闭，需在入口 `setGlobal(KEY, true)` 开启。
 * - **`batch(fn)`**（）：`fn` 执行期间 `schedule` 仅记入推迟表，**最外层** batch 结束后再并入主队列并安排一次 flush，避免块内出现「已调度 effect 抢跑」的中间波次。
 * - **`createRenderEffect`（）**：由 `markRenderEffectRun` 标记的 computation 在依赖变更时走 `notifyEffectSubscriber`：**非 batch** 时 **同步** `run()`；**batch 内** 写入则推迟到 **最外层 batch 结束** 后先同步排空 render 推迟集，再并入普通微任务队列。
 * - **`flushScheduler()`**：**同步**循环排空主队列（直调 `flushQueue`），用于测试或与 React 等 系「立即跑完 pending effect」习惯对齐；**绕过**组字期 `DEFER_FLUSH` 微任务推迟；**勿在** `batch(fn)` 块内指望清空推迟表（见函数注释）。**不**排空 render 的 batch 推迟集（仅由 `batch` 最外层 `finally` 处理）。
 */

import {
  KEY_SCHEDULER,
  KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH,
  KEY_VIEW_SCHEDULER_COMPOSITION_LISTENERS_INSTALLED,
  KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
  KEY_VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED,
} from "./constants.ts";
import { getDocument, getGlobal, setGlobal } from "./globals.ts";

/**
 * 当前嵌套的 `batch(fn)` 深度；>0 时 {@link schedule} 不直接入主队列。
 */
let batchDepth = 0;

/**
 * 处于 batch 内时暂存的 effect run，退出最外层 batch 时一次性并入全局调度主队列。
 */
const deferredWhileBatching = new Set<() => void>();

/**
 * `createRenderEffect` 的 run：在 batch 内被 signal/store 通知时暂存于此，**最外层** batch 结束后 **先于** 普通推迟队列同步排空（与同类方案 render effect 相对 `createEffect` 的时序同向）。
 */
const deferredRenderWhileBatching = new Set<() => void>();

/**
 * 标记为「render effect」的 computation（WeakSet，不污染函数对象可枚举属性）。
 */
const renderEffectRunMarks = new WeakSet<() => void>();

/**
 * 将 `run` 登记为 `createRenderEffect` 使用的同步通知路径（由 `effect.ts` 在创建时调用一次即可）。
 *
 * @param run - 与 `createEffect` 相同的内部 `run` 函数引用
 */
export function markRenderEffectRun(run: () => void): void {
  renderEffectRunMarks.add(run);
}

/** 同步执行 render effect 时的嵌套深度，防止病态循环 */
let renderEffectNotifyDepth = 0;

/** 允许的最大同步嵌套深度（含链式 signal 写触发的子 render effect） */
const MAX_RENDER_EFFECT_NOTIFY_DEPTH = 256;

/**
 * Signal / store / proxy 通知订阅者时调用：普通 effect 走 {@link schedule}；**render effect**（已 {@link markRenderEffectRun}）在 **batch 外** 同步 `run()`，在 **batch 内** 进入 render 的 batch 推迟集。
 *
 * @param run - 订阅者（effect 的 `run` 函数）
 */
export function notifyEffectSubscriber(run: () => void): void {
  if (!renderEffectRunMarks.has(run)) {
    schedule(run);
    return;
  }
  if (batchDepth > 0) {
    deferredRenderWhileBatching.add(run);
    return;
  }
  renderEffectNotifyDepth++;
  if (renderEffectNotifyDepth > MAX_RENDER_EFFECT_NOTIFY_DEPTH) {
    renderEffectNotifyDepth--;
    throw new Error(
      "notifyEffectSubscriber(render): maximum synchronous depth exceeded",
    );
  }
  try {
    run();
  } finally {
    renderEffectNotifyDepth--;
  }
}

/**
 * 最外层 `batch` 结束时调用：将在 batch 内积压的 render effect 按轮同步执行，直至不再产生新的 batch 内积压项。
 */
function flushDeferredRenderWhileBatchingSync(): void {
  let guard = 0;
  while (deferredRenderWhileBatching.size > 0) {
    if (++guard > 10_000) {
      throw new Error(
        "flushDeferredRenderWhileBatchingSync: exceeded maxIterations",
      );
    }
    const slice: (() => void)[] = [...deferredRenderWhileBatching];
    deferredRenderWhileBatching.clear();
    for (let i = 0; i < slice.length; i++) {
      slice[i]!();
    }
  }
}

/**
 * 在 {@link getDocument} 指向的文档上安装一次 composition 监听，维护
 * {@link KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH}（start +1、end -1 夹到 ≥0）。
 * 供受控 `input`/`textarea` 在组字期跳过 `value` 回写，避免打断 IME（与 细粒度行为一致）。
 *
 * 在 {@link schedule} 内惰性调用：无 document（纯 SSR / 非 DOM）时不安装、无开销。
 */
function ensureSchedulerCompositionDepthListeners(): void {
  if (
    getGlobal<boolean>(KEY_VIEW_SCHEDULER_COMPOSITION_LISTENERS_INSTALLED) ===
      true
  ) {
    return;
  }
  const doc = getDocument();
  if (doc == null) return;
  setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, 0);
  setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_LISTENERS_INSTALLED, true);
  doc.addEventListener(
    "compositionstart",
    () => {
      const d = getGlobal<number>(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH) ?? 0;
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, d + 1);
    },
    true,
  );
  /**
   * `compositionend` 用**冒泡**挂在 document 上：在目标控件完成收尾后再减深度，
   * 与 `vnode-mount` 在元素上的 `compositionend` 监听顺序更一致。
   */
  doc.addEventListener(
    "compositionend",
    () => {
      const d = getGlobal<number>(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH) ?? 0;
      setGlobal(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH, Math.max(0, d - 1));
    },
    false,
  );
}

/** `setSelectionRange` 第三参；环境不支持时存空串 */
type FocusRestoreSelectionDirection = "" | "forward" | "backward" | "none";

/** 仅快照 input / textarea / select（可聚焦表单控件） */
type FocusRestoreSnapshot = {
  tagName: "input" | "textarea" | "select";
  id: string;
  name: string;
  /** 仅 input：小写 type，缺省为 text */
  inputType: string;
  /** 仅 select */
  selectMultiple: boolean;
  valueSnapshot: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  /** 文本类 input / textarea 的选区方向，供批末 `setSelectionRange` 第三参 */
  selectionDirection: FocusRestoreSelectionDirection;
  /** 是否尝试恢复选区（文本类 input / textarea） */
  restoreTextSelection: boolean;
};

/**
 * 步骤 6：`flushQueue` 批末是否尝试恢复焦点（与 {@link flushQueue} 内判断一致）。
 * **仅当** global 上该键为严格 `true` 时开启；未设置、`false` 或其它值均为关。
 *
 * 批末恢复时若 `activeElement` 已是匹配节点则**不再** `focus`/`setSelectionRange`，避免每键 flush 打断中文输入法组字。
 * 补救性 `focus` 优先带 `{ preventScroll: true }`，减轻整段替换后视口被滚到输入框的跳动（与常见框架补救一致）。
 *
 * @returns 本 tick 调度 flush 时是否会做快照/恢复
 */
export function getViewSchedulerFocusRestoreEnabled(): boolean {
  return getGlobal<boolean>(KEY_VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED) === true;
}

/**
 * 开关调度器批末焦点恢复。**不能替代**本征 reconcile；仅在整段替换 DOM 等场景作启发式补救（见 ANALYSIS.md §二附 / 步骤 6）。
 * 默认关；业务在 CSR 入口按需 `setViewSchedulerFocusRestoreEnabled(true)`。
 *
 * @param enabled - true 开启；false 关闭
 */
export function setViewSchedulerFocusRestoreEnabled(enabled: boolean): void {
  setGlobal(KEY_VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED, enabled);
}

/**
 * 在 flush 开头捕获 `document.activeElement` 的快照（仅连接在文档内的可编辑表单控件）。
 *
 * @returns 无可恢复目标时为 null
 */
function tryCaptureFocusSnapshot(): FocusRestoreSnapshot | null {
  const doc = getDocument();
  if (doc == null) return null;
  const raw = doc.activeElement;
  /** 不用 `instanceof HTMLElement`：happy-dom 测试下构造函数未必挂在 globalThis */
  if (raw == null || raw.nodeType !== 1) return null;
  const rawEl = raw as Element;
  if (!rawEl.isConnected) return null;

  const tag = rawEl.tagName.toLowerCase();
  if (tag === "textarea") {
    const ta = rawEl as unknown as HTMLTextAreaElement;
    return {
      tagName: "textarea",
      id: ta.id ?? "",
      name: ta.name ?? "",
      inputType: "",
      selectMultiple: false,
      valueSnapshot: ta.value,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
      selectionDirection: readSelectionDirectionForSnapshot(rawEl),
      restoreTextSelection: true,
    };
  }
  if (tag === "input") {
    const inp = rawEl as unknown as HTMLInputElement;
    const t = (inp.type || "text").toLowerCase();
    if (
      t === "hidden" || t === "file" || t === "button" || t === "submit" ||
      t === "reset" || t === "image"
    ) {
      return null;
    }
    const textLike = t === "text" || t === "search" || t === "url" ||
      t === "email" ||
      t === "password" || t === "tel" || t === "number" || t === "" ||
      t === "date" || t === "time" || t === "datetime-local" || t === "month" ||
      t === "week" || t === "color";
    return {
      tagName: "input",
      id: inp.id ?? "",
      name: inp.name ?? "",
      inputType: t,
      selectMultiple: false,
      valueSnapshot: inp.value,
      selectionStart: textLike ? inp.selectionStart : null,
      selectionEnd: textLike ? inp.selectionEnd : null,
      selectionDirection: textLike
        ? readSelectionDirectionForSnapshot(rawEl)
        : "",
      restoreTextSelection: textLike,
    };
  }
  if (tag === "select") {
    const sel = rawEl as unknown as HTMLSelectElement;
    return {
      tagName: "select",
      id: sel.id ?? "",
      name: sel.name ?? "",
      inputType: "",
      selectMultiple: Boolean(sel.multiple),
      valueSnapshot: sel.value,
      selectionStart: null,
      selectionEnd: null,
      selectionDirection: "",
      restoreTextSelection: false,
    };
  }
  return null;
}

/**
 * 判断候选元素是否与快照属同类（标签、input type 或 select multiple）。
 */
function elementMatchesSnapshotKind(
  el: Element,
  snap: FocusRestoreSnapshot,
): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== snap.tagName) return false;
  if (snap.tagName === "input") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    return t === snap.inputType;
  }
  if (snap.tagName === "select") {
    return Boolean((el as HTMLSelectElement).multiple) === snap.selectMultiple;
  }
  return true;
}

/**
 * 按 id → name+同类 → 若多条再用 value 唯一性匹配，查找可恢复焦点的元素。
 *
 * @param doc - 当前文档
 * @param snap - 快照
 */
/** 从 input/textarea/select 元素读取当前 value（无 HTMLElement 依赖） */
function readFormControlValue(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return (el as unknown as HTMLInputElement).value ?? "";
  }
  return "";
}

/**
 * 从本征控件读取 `selectionDirection`，供快照使用；不支持或非标准值时返回空串。
 *
 * @param el - input 或 textarea
 */
function readSelectionDirectionForSnapshot(
  el: Element,
): FocusRestoreSelectionDirection {
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") return "";
  try {
    const ctl = el as unknown as { selectionDirection?: string };
    const d = ctl.selectionDirection;
    if (d === "forward" || d === "backward" || d === "none") return d;
  } catch {
    /* 部分运行时不实现 */
  }
  return "";
}

/**
 * 对可聚焦元素调用 `focus`，优先 `{ preventScroll: true }` 以减少视口跳动；不支持时回退无参 `focus()`。
 *
 * @param el - 恢复目标节点
 */
function focusElementPreferNoScroll(el: Element): void {
  const raw = el as unknown as {
    focus?: (opts?: { preventScroll?: boolean }) => void;
  };
  if (typeof raw.focus !== "function") return;
  try {
    raw.focus({ preventScroll: true });
  } catch {
    try {
      raw.focus();
    } catch {
      /* 忽略 */
    }
  }
}

function findFocusRestoreTarget(
  doc: Document,
  snap: FocusRestoreSnapshot,
): Element | null {
  if (snap.id !== "") {
    const byId = doc.getElementById(snap.id);
    if (byId && elementMatchesSnapshotKind(byId, snap)) {
      return byId;
    }
  }
  const selector = snap.tagName === "input"
    ? "input"
    : snap.tagName === "textarea"
    ? "textarea"
    : "select";
  const list = doc.querySelectorAll(selector);
  /** 与快照同标签 / input.type / select.multiple 的候选 */
  const kindMatches: Element[] = [];
  for (let i = 0; i < list.length; i++) {
    const n = list.item(i);
    if (n.nodeType !== 1) continue;
    const ne = n as Element;
    if (!elementMatchesSnapshotKind(ne, snap)) continue;
    kindMatches.push(ne);
  }

  if (snap.name !== "") {
    const byName: Element[] = [];
    for (const ne of kindMatches) {
      const nm = snap.tagName === "textarea"
        ? (ne as unknown as HTMLTextAreaElement).name ?? ""
        : snap.tagName === "select"
        ? (ne as unknown as HTMLSelectElement).name ?? ""
        : (ne as unknown as HTMLInputElement).name ?? "";
      if (nm === snap.name) byName.push(ne);
    }
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      const byVal = byName.filter((el) =>
        readFormControlValue(el) === snap.valueSnapshot
      );
      if (byVal.length === 1) return byVal[0]!;
    }
    return null;
  }

  /**
   * 无 id、无 name（如手写 `createElement("input")` 未设属性）：仅当 **value 与快照一致且全文档唯一** 时恢复，
   * 避免双搜索框同文案时误聚焦。若仍歧义，业务应设 `id`/`name` 或依赖本征 patch 不换节点（步骤 1～3）。
   */
  const byValOnly = kindMatches.filter((el) =>
    readFormControlValue(el) === snap.valueSnapshot
  );
  if (byValOnly.length === 1) return byValOnly[0]!;
  return null;
}

/**
 * 批处理结束后尝试把焦点移回新树中匹配快照的节点并恢复选区。
 *
 * @param snap - flush 开头捕获的快照
 */
function tryRestoreFocusAfterFlush(snap: FocusRestoreSnapshot): void {
  const doc = getDocument();
  if (doc == null) return;
  const target = findFocusRestoreTarget(doc, snap);
  if (target == null || !target.isConnected) return;

  /**
   * 焦点从未离开目标控件时（例如仅列表 patch、同一 input 仍在组字）：不得再 `focus()` / `setSelectionRange()`。
   * 否则每键一次 `schedule`→`flush` 都会在批末强制改选区，**打断中文 IME 组字**（拼音无法上屏）。
   * 仅当批末 `activeElement` 已不是目标节点时，才做「丢焦后的补救」。
   */
  const current = doc.activeElement;
  if (current != null && current === target) {
    return;
  }

  focusElementPreferNoScroll(target);
  if (!snap.restoreTextSelection) return;
  if (snap.selectionStart == null || snap.selectionEnd == null) return;
  const tag = target.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") return;
  try {
    const ctl = target as unknown as HTMLInputElement | HTMLTextAreaElement;
    const len = ctl.value.length;
    const a = Math.max(0, Math.min(snap.selectionStart, len));
    const b = Math.max(0, Math.min(snap.selectionEnd, len));
    const dir = snap.selectionDirection;
    if (dir === "forward" || dir === "backward" || dir === "none") {
      ctl.setSelectionRange(a, b, dir);
    } else {
      ctl.setSelectionRange(a, b);
    }
  } catch {
    /* 部分 type=number 环境可能抛错，忽略 */
  }
}

type SchedulerState = {
  queue: Set<() => void>;
  queueCopy: (() => void)[];
  scheduled: boolean;
};

/**
 * 校验 globalThis 上已存在的调度器状态是否完整。
 * 若键被误写成 `{}` 等非 View 形态，getGlobalOrDefault 会直接返回它，flush 时读 queueCopy.length 会抛
 * 「Cannot read properties of undefined (reading 'length')」（与文档站 SSR 栈一致）。
 *
 * @param x - 任意值
 * @returns 是否为可用的 SchedulerState
 */
function isValidSchedulerState(x: unknown): x is SchedulerState {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.queue instanceof Set &&
    Array.isArray(o.queueCopy) &&
    typeof o.scheduled === "boolean"
  );
}

/**
 * 创建新的调度器状态并写入 globalThis（替换非法或缺失项）。
 *
 * @returns 新的 SchedulerState
 */
function installFreshSchedulerState(): SchedulerState {
  const fresh: SchedulerState = {
    queue: new Set(),
    queueCopy: [],
    scheduled: false,
  };
  setGlobal(KEY_SCHEDULER, fresh);
  return fresh;
}

/**
 * 获取全局调度器单例；若键已存在但结构不合法则重置，避免 flush 阶段读 undefined.length。
 *
 * @returns 可用的 SchedulerState
 */
function getGlobalSchedulerState(): SchedulerState {
  const existing = getGlobal<unknown>(KEY_SCHEDULER);
  if (isValidSchedulerState(existing)) {
    return existing;
  }
  return installFreshSchedulerState();
}

/**
 * 清空当前队列并依次执行所有任务（在微任务中调用）
 * 使用索引 for 循环替代 for-of，避免迭代器分配，对部分引擎更友好。
 */
function flushQueue(): void {
  const state = getGlobalSchedulerState();
  state.scheduled = false;
  state.queueCopy.length = 0;
  state.queueCopy.push(...state.queue);
  state.queue.clear();
  const copy = state.queueCopy;

  /** 步骤 6：批首快照，批末恢复（见 {@link getViewSchedulerFocusRestoreEnabled}，默认关） */
  const focusSnap = getViewSchedulerFocusRestoreEnabled()
    ? tryCaptureFocusSnapshot()
    : null;

  for (let i = 0; i < copy.length; i++) copy[i]();

  if (focusSnap != null) {
    tryRestoreFocusAfterFlush(focusSnap);
  }
}

/**
 * **同步**排空全局调度 **主队列**：循环调用 {@link flushQueue} 直至 `queue.size === 0` 或达到 `maxIterations`。
 *
 * **与微任务路径的差异：** 不经过 {@link runFlushQueueOrDeferWhileComposing}，因此 **不会** 因
 * `KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING === true` 且组字深度 &gt; 0 而推迟到后续微任务（便于单测确定性；生产环境若在 IME 组字期调用，可能与「组字期不 flush」策略不一致，请慎用）。
 *
 * **`batch(fn)`：** 块执行期间 `schedule` 写入的是 {@link deferredWhileBatching}，**尚未**入主队列，本函数 **不会** 执行这些任务；须待最外层 `batch` 结束并入队后再 `flushScheduler()` 或依赖微任务。
 *
 * @param maxIterations - 防止病态自调度死循环，默认 `10000`；若执行 `maxIterations` 轮后队列仍非空则抛错
 */
export function flushScheduler(maxIterations = 10_000): void {
  for (let i = 0; i < maxIterations; i++) {
    const state = getGlobalSchedulerState();
    if (state.queue.size === 0) return;
    flushQueue();
  }
  if (getGlobalSchedulerState().queue.size > 0) {
    throw new Error(
      "flushScheduler: exceeded maxIterations; possible infinite self-scheduling",
    );
  }
}

/**
 * 在 composition 深度大于 0 且 {@link KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING} 为严格 `true` 时推迟 `flushQueue`，
 * 否则立即 flush。通过连续微任务轮询直至深度归零（**须显式开启**，默认不推迟）。
 */
function runFlushQueueOrDeferWhileComposing(): void {
  const defer = getGlobal<boolean>(
    KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING,
  );
  if (defer === true) {
    const d = getGlobal<number>(KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH) ?? 0;
    if (d > 0) {
      if (typeof globalThis.queueMicrotask !== "undefined") {
        globalThis.queueMicrotask(runFlushQueueOrDeferWhileComposing);
      } else if (typeof Promise !== "undefined") {
        Promise.resolve().then(runFlushQueueOrDeferWhileComposing);
      } else {
        setTimeout(runFlushQueueOrDeferWhileComposing, 0);
      }
      return;
    }
  }
  flushQueue();
}

/**
 * 将 {@link deferredWhileBatching} 并入主队列并安排一次 flush（与 {@link schedule} 尾段语义一致）。
 */
function flushDeferredRunsAfterBatch(): void {
  if (deferredWhileBatching.size === 0) return;
  ensureSchedulerCompositionDepthListeners();
  const state = getGlobalSchedulerState();
  for (const r of deferredWhileBatching) {
    state.queue.add(r);
  }
  deferredWhileBatching.clear();
  if (!state.scheduled) {
    state.scheduled = true;
    if (typeof globalThis.queueMicrotask !== "undefined") {
      globalThis.queueMicrotask(runFlushQueueOrDeferWhileComposing);
    } else if (typeof Promise !== "undefined") {
      Promise.resolve().then(runFlushQueueOrDeferWhileComposing);
    } else {
      setTimeout(runFlushQueueOrDeferWhileComposing, 0);
    }
  }
}

/**
 * 在同步块内批量更新时推迟调度，直至**最外层**调用结束再统一入队（与 `batch` 同向）。
 * 嵌套 batch 时仅在最外层 finally 触发一次 {@link flushDeferredRunsAfterBatch}。
 *
 * @param fn - 可能包含多次 `signal` / `store` 写入或其它 `schedule` 的同步函数
 * @returns `fn()` 的返回值
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushDeferredRenderWhileBatchingSync();
      flushDeferredRunsAfterBatch();
    }
  }
}

/**
 * 将任务加入队列，并确保在本 tick 的微任务中执行 flush
 * 供 signal setter、store set、createEffect 的「下次执行」使用，避免同步重入
 */
export function schedule(run: () => void): void {
  if (batchDepth > 0) {
    deferredWhileBatching.add(run);
    return;
  }
  ensureSchedulerCompositionDepthListeners();
  const state = getGlobalSchedulerState();
  state.queue.add(run);
  if (!state.scheduled) {
    state.scheduled = true;
    if (typeof globalThis.queueMicrotask !== "undefined") {
      globalThis.queueMicrotask(runFlushQueueOrDeferWhileComposing);
    } else if (typeof Promise !== "undefined") {
      Promise.resolve().then(runFlushQueueOrDeferWhileComposing);
    } else {
      setTimeout(runFlushQueueOrDeferWhileComposing, 0);
    }
  }
}

/**
 * 从队列中移除任务（如 effect dispose 时取消尚未执行的 run）
 */
export function unschedule(run: () => void): void {
  deferredWhileBatching.delete(run);
  deferredRenderWhileBatching.delete(run);
  getGlobalSchedulerState().queue.delete(run);
}
