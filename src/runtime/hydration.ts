/**
 * @module runtime/hydration
 * @description 客户端水合 (Hydration) 逻辑 - 将 SSR 静态 HTML 变为交互式应用。
 *
 * **支持的功能：**
 * - ✅ internalHydrate() - 内部水合逻辑
 * - ✅ walk() - DOM 树遍历
 * - ✅ 绑定映射 (bindingMap) 管理
 * - ✅ mismatch 诊断（warn / onMismatch；VIEW_DEV 默认 warn）
 * - ✅ assertMismatch / remount 策略由 `hydrate` 消费（本模块记录 mismatches）
 *
 * @usage
 * internalHydrate(rootElement, bindings)
 * internalHydrate(rootElement, bindings, { warnMismatch: true })
 */

import { walk } from "./template.ts";

/**
 * 水合阶段全局状态：绑定 id → 真实 DOM 节点。
 */
export interface HydrationContext {
  bindingMap: Map<string, Node>;
  active: boolean;
  mismatches: HydrationMismatch[];
}

/** 单条绑定路径解析失败信息 */
export interface HydrationMismatch {
  id: string;
  path: number[];
  reason: "not_found" | "walk_error";
  error?: unknown;
}

/**
 * 绑定错位后的恢复策略（默认 `continue`：继续水合，缺失绑定走客户端新建）。
 * - `continue`：仅记录，不中断
 * - `assert`：有 mismatch 时抛错（CI / 严格模式）
 * - `remount`：放弃绑定表，清空容器后按 CSR `mount` 语义重挂（由 `hydrate` 执行）
 */
export type HydrationMismatchMode = "continue" | "assert" | "remount";

/**
 * `internalHydrate` / `hydrate` 可选选项（加法，不影响既有 bindings 数组参数）。
 */
export interface HydrateOptions {
  /** 编译器生成的绑定表；与 `hydrate(fn, el, bindings)` 第三参数组等价 */
  bindings?: [number[], string][];
  /**
   * 绑定路径解析失败时是否 `console.warn`。
   * 默认：`globalThis.VIEW_DEV === true` 时开启，生产关闭。
   */
  warnMismatch?: boolean;
  /** 每条 mismatch 回调（可用于上报） */
  onMismatch?: (info: HydrationMismatch) => void;
  /**
   * 错位策略。默认 `continue`。
   * - `assert`：`internalHydrate` 结束后若有 mismatch 则 throw
   * - `remount`：不在此 throw；由 `hydrate` 清空容器并 CSR 重挂
   */
  mismatchMode?: HydrationMismatchMode;
  /**
   * @deprecated 使用 `mismatchMode: "assert"`；二者同时存在时 `mismatchMode` 优先
   */
  assertMismatch?: boolean;
  /**
   * @deprecated 使用 `mismatchMode: "remount"`
   */
  remountOnMismatch?: boolean;
}

let hydrationContext: HydrationContext | null = null;

function shouldWarnMismatch(options?: HydrateOptions): boolean {
  if (options?.warnMismatch === true) return true;
  if (options?.warnMismatch === false) return false;
  return (globalThis as { VIEW_DEV?: boolean }).VIEW_DEV === true;
}

/**
 * 解析错位策略（兼容旧布尔开关）。
 */
export function resolveMismatchMode(
  options?: HydrateOptions,
): HydrationMismatchMode {
  if (options?.mismatchMode) return options.mismatchMode;
  if (options?.assertMismatch) return "assert";
  if (options?.remountOnMismatch) return "remount";
  return "continue";
}

/**
 * 根据 `bindings` 在 `root` 子树上解析节点并写入全局水合上下文。
 * @throws `mismatchMode === "assert"` 且存在 mismatch 时
 */
export function internalHydrate(
  root: Node,
  bindings: [number[], string][] = [],
  options?: HydrateOptions,
): void {
  const map = new Map<string, Node>();
  const mismatches: HydrationMismatch[] = [];
  const warn = shouldWarnMismatch(options);
  const onMismatch = options?.onMismatch;
  const mode = resolveMismatchMode(options);

  for (const [path, id] of bindings) {
    try {
      const node = walk(root, path);
      if (node) {
        map.set(id, node);
      } else {
        const info: HydrationMismatch = {
          id,
          path: path.slice(),
          reason: "not_found",
        };
        mismatches.push(info);
        onMismatch?.(info);
        if (warn) {
          console.warn(
            `[@dreamer/view] hydration mismatch: binding "${id}" path ${
              JSON.stringify(path)
            } not found under root`,
          );
        }
      }
    } catch (error) {
      const info: HydrationMismatch = {
        id,
        path: path.slice(),
        reason: "walk_error",
        error,
      };
      mismatches.push(info);
      onMismatch?.(info);
      if (warn) {
        console.warn(
          `[@dreamer/view] hydration mismatch: binding "${id}" path ${
            JSON.stringify(path)
          } walk failed:`,
          error,
        );
      }
    }
  }

  hydrationContext = {
    bindingMap: map,
    active: true,
    mismatches,
  };

  if (mode === "assert" && mismatches.length > 0) {
    const summary = mismatches
      .map((m) => `${m.id}@${JSON.stringify(m.path)}(${m.reason})`)
      .join(", ");
    throw new Error(
      `[@dreamer/view] hydration assert: ${mismatches.length} mismatch(es): ${summary}`,
    );
  }
}

/**
 * 清除水合上下文，表示水合阶段结束或放弃。
 */
export function stopHydration() {
  hydrationContext = null;
}

/**
 * 在水合激活时从绑定表取已解析的 DOM 节点。
 */
export function useHydratedNode(id: string): Node | undefined {
  if (!hydrationContext?.active) return undefined;
  return hydrationContext.bindingMap.get(id);
}

/**
 * 当前是否存在激活的水合上下文。
 */
export function isHydrating(): boolean {
  return hydrationContext?.active ?? false;
}

/**
 * 最近一次 `internalHydrate` 记录的 mismatch 列表。
 */
export function getHydrationMismatches(): readonly HydrationMismatch[] {
  return hydrationContext?.mismatches ?? [];
}
