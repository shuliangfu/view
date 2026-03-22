/**
 * VNode 树调试辅助：与编译产物「可读插入点」互补，便于手写 `jsx` 路径在控制台查看结构。
 *
 * @module @dreamer/view/vnode-debug
 */

import { isEmptyChild, isVNodeLike } from "./dom/shared.ts";
import { isSignalRef } from "./signal.ts";
import type { VNode } from "./types.ts";

/** `formatVNodeForDebug` 的深度与列表截断选项 */
export type FormatVNodeForDebugOptions = {
  /** 最大递归深度，默认 12 */
  maxDepth?: number;
  /** 每层最多展开子节点数，默认 30 */
  maxChildren?: number;
  /** props 中最多列出的键数（不含 children），默认 20 */
  maxPropKeys?: number;
};

/**
 * 将 prop 值压缩为单行说明，避免把函数体或大对象打进日志。
 *
 * @param val - props 上的值
 */
function describePropValue(val: unknown): string {
  if (val == null) return String(val);
  if (typeof val === "function") {
    const n = (val as { name?: string }).name;
    return n ? `fn:${n}` : "fn";
  }
  if (typeof val === "object") {
    if (isSignalRef(val)) return "SignalRef";
    return "object";
  }
  const s = JSON.stringify(val);
  return s === undefined ? String(val) : s;
}

/**
 * 将 VNode（或近似结构）格式化为缩进文本，便于 `console.log` 调试。
 * 不处理循环引用；超过深度或数量会输出省略标记。
 *
 * @param vnode - 根节点或任意子节点
 * @param options - 截断选项
 * @returns 多行字符串
 */
export function formatVNodeForDebug(
  vnode: unknown,
  options?: FormatVNodeForDebugOptions,
): string {
  const maxDepth = options?.maxDepth ?? 12;
  const maxChildren = options?.maxChildren ?? 30;
  const maxPropKeys = options?.maxPropKeys ?? 20;

  /**
   * @param x - 当前节点
   * @param depth - 当前深度
   * @param indent - 行首缩进
   */
  function walk(x: unknown, depth: number, indent: string): string {
    if (depth > maxDepth) return `${indent}…\n`;
    if (isEmptyChild(x)) return `${indent}(empty)\n`;
    if (!isVNodeLike(x)) {
      return `${indent}${String(x)}\n`;
    }
    const v = x as VNode;
    const typeStr = typeof v.type === "symbol"
      ? String(v.type)
      : typeof v.type === "string"
      ? JSON.stringify(v.type)
      : typeof v.type === "function"
      ? `fn:${(v.type as { name?: string }).name || "Component"}`
      : String(v.type);
    let line = `${indent}${typeStr}`;
    if (v.key != null) line += ` key=${JSON.stringify(v.key)}`;
    line += "\n";
    const p = (v.props ?? {}) as Record<string, unknown>;
    const keys = Object.keys(p).filter((k) => k !== "children");
    const shown = keys.slice(0, maxPropKeys);
    for (const k of shown) {
      line += `${indent}  ${k}: ${describePropValue(p[k])}\n`;
    }
    if (keys.length > maxPropKeys) {
      line += `${indent}  … +${keys.length - maxPropKeys} keys\n`;
    }
    const rawChildren = p.children ?? v.children;
    if (rawChildren == null) return line;
    const arr = Array.isArray(rawChildren) ? rawChildren : [rawChildren];
    const slice = arr.slice(0, maxChildren);
    for (const c of slice) {
      line += walk(c, depth + 1, indent + "  ");
    }
    if (arr.length > maxChildren) {
      line += `${indent}  … +${arr.length - maxChildren} children\n`;
    }
    return line;
  }

  return walk(vnode, 0, "").trimEnd();
}
