/**
 * 手写 VNode / runtime 路径的开发期提示：与 `KEY_VIEW_DEV` 配合，减少「看起来像 bug、实为用法边界」的排查成本。
 *
 * @module @dreamer/view/dev-runtime-warn
 */

import { KEY_VIEW_DEV } from "./constants.ts";
import { getGlobal, setGlobal } from "./globals.ts";

/** 已输出的诊断 code，避免刷屏（每 code 仅一次） */
const seenCodes = new Set<string>();

/** 最多记录的不同 code 数，防止异常路径无限增长 */
const MAX_CODES = 64;

/**
 * 是否应输出开发期诊断（`globalThis.__VIEW_DEV__ === true`）。
 */
function devRuntimeWarningsEnabled(): boolean {
  return getGlobal<boolean>(KEY_VIEW_DEV) === true;
}

/**
 * 开启手写 runtime / VNode 路径的开发期 `console.warn`（受控 props、嵌套 style 等）。
 * 可在应用入口调用一次；与 `disableViewRuntimeDevWarnings` 成对使用。
 */
export function enableViewRuntimeDevWarnings(): void {
  setGlobal(KEY_VIEW_DEV, true);
}

/**
 * 关闭由 `enableViewRuntimeDevWarnings` 打开的诊断。
 */
export function disableViewRuntimeDevWarnings(): void {
  setGlobal(KEY_VIEW_DEV, false);
}

/**
 * 在开发开关打开时输出一条 `console.warn`，同一 `code` 只打一次。
 *
 * @param code - 稳定短码，用于去重
 * @param message - 完整说明（不含前缀）
 */
export function viewRuntimeDevWarn(code: string, message: string): void {
  if (!devRuntimeWarningsEnabled()) return;
  if (seenCodes.has(code)) return;
  if (seenCodes.size >= MAX_CODES) return;
  seenCodes.add(code);
  console.warn(`[view/runtime] ${message}`);
}

/**
 * 若 `value`/`checked` 等为多参普通函数，则受控绑定不会生效（与编译器一致）；开发模式下提示误用。
 *
 * @param elTag - 小写标签名
 * @param propName - 属性名，如 value、checked、disabled
 * @param val - props 上的值
 */
export function warnIfMultiArgControlledProp(
  elTag: string,
  propName: string,
  val: unknown,
  isSignalGetter: (x: unknown) => boolean,
): void {
  if (typeof val !== "function") return;
  if (isSignalGetter(val)) return;
  const f = val as (...args: unknown[]) => unknown;
  if (f.length === 0) return;
  viewRuntimeDevWarn(
    `controlled:${propName}:multi-arg`,
    `<${elTag}> ${propName}={…} 为多参函数时，手写 runtime 路径不会按受控 getter 订阅 DOM；请改为无参函数、SignalRef 或 signal getter。若是事件处理请用 onInput/onChange 等。`,
  );
}

/**
 * `style` 对象含嵌套普通对象时，`Object.assign(el.style, …)` 无法展开（非 React/CSS 常规写法）。
 *
 * @param elTag - 小写标签名
 * @param styleObj - 待检查的 style 对象
 */
export function warnIfNestedStyleObject(
  elTag: string,
  styleObj: object,
): void {
  if (!hasNestedPlainObjectInStyle(styleObj)) return;
  viewRuntimeDevWarn(
    "style:nested-object",
    `<${elTag}> style 含嵌套对象，当前实现仅支持一层 camelCase 键（如 marginTop）；请扁平化后再传入。`,
  );
}

/**
 * 判断 style 对象是否含有「值仍为普通对象」的键（数组、DOM 节点不计为嵌套样式问题）。
 *
 * @param o - style 对象
 */
function hasNestedPlainObjectInStyle(o: object): boolean {
  for (const v of Object.values(o)) {
    if (v == null || typeof v !== "object") continue;
    if (Array.isArray(v)) continue;
    if (
      typeof globalThis.Node === "function" && v instanceof globalThis.Node
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * 清空已输出过的诊断 code（仅单元测试使用，避免同文件内多条用例共用去重状态）。
 */
export function resetViewRuntimeDevWarningsForTesting(): void {
  seenCodes.clear();
}
