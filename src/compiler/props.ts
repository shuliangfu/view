/**
 * 编译路径运行时 — Props 工具（mergeProps / splitProps）
 *
 * 与同类方案 对齐：避免解构 props 导致丢响应式；在 JSX 或 memo 内用 props.xxx 建立订阅。
 *
 * @module @dreamer/view/runtime/props
 */

import { eventBindingFromOnProp } from "./spread-intrinsic.ts";

/**
 * 将各来源上的 `class` / `className` 片段拼成单一字符串（与同类方案 `mergeProps` 对 class 的合并同向）。
 *
 * @param parts - 已 trim 的非空片段
 */
function joinClassParts(parts: string[]): string | undefined {
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}

/**
 * 解析 `class` / `className`：各来源中**仅**字符串、数字、数组（与 `spreadIntrinsicProps` 一致）参与空格拼接；
 * 若任一档为函数或「非数组对象」，则整段按**最后一档有定义的 `className` 或 `class`** 取值（保留响应式 / getter）。
 *
 * @param filtered - 与 {@link mergeProps} 相同的来源列表
 */
function resolveMergedClass(filtered: Record<string, unknown>[]): unknown {
  const stringParts: string[] = [];
  let hasDynamic = false;

  for (let si = 0; si < filtered.length; si++) {
    const src = filtered[si];
    /** 单对象内先 `class` 再 `className`，与常见 JSX 书写顺序一致 */
    for (const ck of ["class", "className"] as const) {
      if (!(ck in src)) continue;
      const v: unknown = (src as Record<string, unknown>)[ck];
      if (v == null || v === false) continue;
      if (typeof v === "string") {
        const tr = v.trim();
        if (tr !== "") stringParts.push(tr);
      } else if (typeof v === "number" || typeof v === "bigint") {
        stringParts.push(String(v));
      } else if (Array.isArray(v)) {
        const joined = v.filter(Boolean).map(String).join(" ").trim();
        if (joined !== "") stringParts.push(joined);
      } else {
        hasDynamic = true;
      }
    }
  }

  if (!hasDynamic) {
    return joinClassParts(stringParts);
  }

  for (let i = filtered.length - 1; i >= 0; i--) {
    const s = filtered[i] as Record<string, unknown>;
    if ("className" in s) {
      const v = s.className;
      if (v != null && v !== false) return v;
    }
    if ("class" in s) {
      const v = s.class;
      if (v != null && v !== false) return v;
    }
  }
  return undefined;
}

/**
 * 判断值是否可作为 `style` 的**静态浅合并**片段（与 `spreadIntrinsicProps` 写入 `CSSStyleDeclaration` 的对象分支一致）。
 *
 * @param v - 任意值
 * @returns 为普通对象（非数组、非 Date、非 DOM Node）时为 true
 */
function isPlainStyleObject(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return false;
  }
  if (typeof globalThis.Node === "function" && v instanceof globalThis.Node) {
    return false;
  }
  if (v instanceof Date) return false;
  return true;
}

/**
 * 合并各来源的 `style`：均为**普通对象**时按来源顺序做**浅合并**（后者覆盖同名 CSS 属性键）；
 * 任一档为函数、字符串或其它非普通对象时，与 `class` 动态分支同向——自后向前取**最后一档有定义**的 `style`（保留 getter / 响应式）。
 *
 * @param filtered - 与 {@link mergeProps} 相同的来源列表
 */
function resolveMergedStyle(filtered: Record<string, unknown>[]): unknown {
  const plainSlices: object[] = [];
  let hasDynamic = false;

  for (let si = 0; si < filtered.length; si++) {
    const src = filtered[si];
    if (!("style" in src)) continue;
    const v: unknown = (src as Record<string, unknown>).style;
    if (v == null || v === false) continue;
    if (isPlainStyleObject(v)) {
      plainSlices.push(v as object);
    } else {
      hasDynamic = true;
    }
  }

  if (!hasDynamic) {
    if (plainSlices.length === 0) return undefined;
    return Object.assign({}, ...plainSlices);
  }

  for (let i = filtered.length - 1; i >= 0; i--) {
    const s = filtered[i] as Record<string, unknown>;
    if (!("style" in s)) continue;
    const v = s.style;
    if (v != null && v !== false) return v;
  }
  return undefined;
}

/**
 * 将多个事件处理函数按来源顺序串成一次调用（`this` 与首参事件对象与 DOM 监听一致）。
 *
 * @param fns - 自 `mergeProps` 第一个参数起至「最后一个含该 key 的来源」之间的全部函数
 */
function mergeEventHandlerList(
  fns: ReadonlyArray<(e: unknown) => void>,
): (this: unknown, e: unknown) => void {
  return function mergedEventHandler(this: unknown, ev: unknown) {
    for (let i = 0; i < fns.length; i++) {
      fns[i]!.call(this, ev);
    }
  };
}

/**
 * 判断 `ref` 值是否为可参与链式合并的**回调 ref** 或 **`{ current }` 对象 ref**（与 `spreadIntrinsicProps` 对 `ref` 的分支一致）。
 *
 * @param v - 任意值
 */
function isMergeableRefValue(v: unknown): boolean {
  if (typeof v === "function") return true;
  if (v !== null && typeof v === "object" && "current" in v) return true;
  return false;
}

/**
 * 将多档 `ref` 合成单一回调：按来源顺序依次调用函数 ref 或写入对象 ref 的 `current`（同类方案 / React `mergeRefs` 同向）。
 *
 * @param slots - 自第一个含 `ref` 的来源起至最后一档为止的各 `ref` 值（可含 `null`，遍历时跳过）
 */
function mergeRefCallbacksInOrder(
  slots: ReadonlyArray<unknown>,
): (n: Element | null) => void {
  return function mergedRef(n: Element | null) {
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i];
      if (r == null) continue;
      if (typeof r === "function") {
        (r as (node: Element | null) => void)(n);
      } else if (typeof r === "object" && r !== null && "current" in r) {
        (r as { current: Element | null }).current = n;
      }
    }
  };
}

/**
 * 合并各来源的 `ref`：**最后一档为 `null` / `undefined`** 时整键以该值为准（显式清空，与事件「最后一档非函数」同向）；否则若**至少两档**声明了 `ref` 且最后一档仍为可合并的回调或 `{ current }`，则合成**单一回调**；仅一档有 `ref` 时返回该值原样。
 *
 * @param filtered - 与 {@link mergeProps} 相同的来源列表
 */
function resolveMergedRef(filtered: Record<string, unknown>[]): unknown {
  let lastIdx = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if ("ref" in filtered[i]) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx < 0) return undefined;

  const lastVal = (filtered[lastIdx] as Record<string, unknown>).ref;
  if (lastVal === null || lastVal === undefined) {
    return lastVal;
  }

  const slots: unknown[] = [];
  for (let i = 0; i <= lastIdx; i++) {
    if (!("ref" in filtered[i])) continue;
    slots.push((filtered[i] as Record<string, unknown>).ref);
  }
  if (slots.length <= 1) {
    return slots[0];
  }
  if (!isMergeableRefValue(lastVal)) {
    return lastVal;
  }
  return mergeRefCallbacksInOrder(slots);
}

/**
 * 读取合并后的单个 key：普通属性后者覆盖前者；**`class` / `className`** 见 {@link resolveMergedClass}；**`style`** 见 {@link resolveMergedStyle}；**`ref`** 见 {@link resolveMergedRef}；**类 React 事件键**（`onClick`、`onClickCapture` 等，见 `eventBindingFromOnProp`）在**最后一档仍为函数**时，将前面各档中的**同键函数**按顺序合并为一次监听内依次调用（同类方案 `mergeProps` 同向）。若最后一档为非函数，则整键以最后一档为准（可覆盖为 `undefined`）。
 */
function readMergedProp(
  filtered: Record<string, unknown>[],
  key: string,
): unknown {
  if (key === "class" || key === "className") {
    return resolveMergedClass(filtered);
  }
  if (key === "style") {
    return resolveMergedStyle(filtered);
  }
  if (key === "ref") {
    return resolveMergedRef(filtered);
  }

  if (eventBindingFromOnProp(key) != null) {
    let lastIdx = -1;
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (key in filtered[i]) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx >= 0) {
      const lastVal = (filtered[lastIdx] as Record<string, unknown>)[key];
      if (typeof lastVal !== "function") {
        return lastVal;
      }
      const fns: ((e: unknown) => void)[] = [];
      for (let i = 0; i <= lastIdx; i++) {
        if (!(key in filtered[i])) continue;
        const v = (filtered[i] as Record<string, unknown>)[key];
        if (typeof v === "function") {
          fns.push(v as (e: unknown) => void);
        }
      }
      if (fns.length >= 2) return mergeEventHandlerList(fns);
      if (fns.length === 1) return fns[0];
      return lastVal;
    }
  }

  for (let i = filtered.length - 1; i >= 0; i--) {
    if (key in filtered[i]) {
      return (filtered[i] as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

/**
 * 合并多组 props，后者覆盖前者。
 * 若某 key 的值为函数（getter），保留为 getter 以便保持响应式。
 * **`class` / `className`**：多档为字符串/数字/数组时拼成空格分隔的单一 class 字符串（两键读取结果一致）；任一档为函数或非数组对象时改为**最后一档** `className` 或 `class` 生效（保留响应式）。
 * **`style`**：多档均为普通对象时浅合并（后者覆盖同名键）；任一档为函数或非普通对象时以**最后一档有定义**的 `style` 为准（同类方案 `mergeProps` 同向）。
 * **`ref`**：多档为回调或 `{ current }` 时合并为单次挂载时按来源顺序依次执行/赋值；最后一档为 `null`/`undefined` 时整键以该值为准（同类方案 `mergeProps` / `mergeRefs` 同向）。
 * **事件 props**（`on*` / `on*Capture`）：多档均为函数时合并为单次调用内按来源顺序依次执行；最后一档非函数时以最后一档为准。
 *
 * @param sources - 多组 props 对象
 * @returns 合并后的代理，读 key 时按上述规则解析
 */
export function mergeProps<T extends Record<string, unknown>>(
  ...sources: (T | undefined | null)[]
): T {
  const filtered = sources.filter(
    (s): s is T => s != null && typeof s === "object",
  ) as Record<string, unknown>[];
  if (filtered.length === 0) return {} as T;
  if (filtered.length === 1) return filtered[0] as T;

  return new Proxy({} as T, {
    get(_, key: string) {
      return readMergedProp(filtered, key);
    },
    has(_, key: string) {
      return filtered.some((s) => key in s);
    },
    /**
     * 合并来源可能为 `mergeProps` 嵌套或其它 Proxy，`Object.keys` 不可靠，故用 `Reflect.ownKeys` 收集字符串键。
     */
    ownKeys() {
      const keys = new Set<string>();
      for (const s of filtered) {
        for (const k of Reflect.ownKeys(s)) {
          if (typeof k === "string") keys.add(k);
        }
      }
      return [...keys];
    },
    /**
     * 无此 trap 时 `Object.keys`、`{ ...proxy }`、`normalizeProps` 的解构展开会拿不到键（目标空对象无属性描述符）。
     */
    getOwnPropertyDescriptor(_, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      if (!filtered.some((s) => prop in s)) return undefined;
      return {
        enumerable: true,
        configurable: true,
        writable: true,
        value: readMergedProp(filtered, prop),
      } as PropertyDescriptor;
    },
  });
}

/**
 * 将多个 ref（回调或带 `current` 的对象）合并为**单一回调**，顺序与参数列表一致；`null` / `undefined` 占位会被跳过（同类方案 / React `mergeRefs` 同向）。
 * 与 {@link mergeProps} 内对 `ref` 的多档合并语义一致，便于手写 `ref={mergeRefs(a, b)}` 而无需先合成 props 对象。
 *
 * @param refs - 任意个 ref
 * @returns 挂载/卸载时依次转发；无任何有效 ref 时为空操作
 */
export function mergeRefs(
  ...refs: unknown[]
): (n: Element | null) => void {
  const slots = refs;
  let nonNullCount = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] != null) nonNullCount++;
  }
  if (nonNullCount === 0) {
    return function mergeRefsNoop() {
      /* 无 ref 时不做操作 */
    };
  }
  if (nonNullCount === 1) {
    let only: unknown;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] != null) {
        only = slots[i];
        break;
      }
    }
    if (typeof only === "function") {
      return only as (n: Element | null) => void;
    }
    if (
      only !== null && typeof only === "object" && "current" in only
    ) {
      const box = only as { current: Element | null };
      return function mergeRefsSingleObject(n: Element | null) {
        box.current = n;
      };
    }
    return function mergeRefsUnknownNoop() {
      /* 非函数非对象 ref 时忽略 */
    };
  }
  return mergeRefCallbacksInOrder(slots);
}

/**
 * **默认 props**：`mergeProps(defaults, …sources)` 的语义化别名，**靠后的来源覆盖靠前**（与同类方案 组件默认属性书写习惯一致）。
 *
 * @param defaults - 默认键值
 * @param sources - 可选的多组覆盖对象（可含 `null` / `undefined`，与 {@link mergeProps} 相同）
 */
export function defaultProps<D extends Record<string, unknown>>(
  defaults: D,
  ...sources: (Record<string, unknown> | undefined | null)[]
): D {
  return mergeProps(defaults, ...sources) as D;
}

/**
 * 按 key 数组将 props 拆成多份，避免解构丢响应式。
 * 返回 [part1, part2, ..., rest]，partN 含对应 keys 中的 key，rest 含剩余 key。
 *
 * @param props - 原始 props（可为代理）
 * @param keyArrays - 每组要拆出的 key 数组
 * @returns 拆开后的对象数组，最后一项为 rest
 *
 * @example
 * const [local, rest] = splitProps(props, ['class', 'style']);
 * // local 只有 class、style；rest 为其余 key
 */
export function splitProps<T extends Record<string, unknown>>(
  props: T,
  ...keyArrays: (keyof T)[][]
): [...Record<string, unknown>[], Record<string, unknown>] {
  const keySets = keyArrays.map((arr) => new Set(arr as string[]));

  const result: Record<string, unknown>[] = keySets.map(() => ({}));
  const rest: Record<string, unknown> = {};

  const keys = Reflect.ownKeys(props).filter((k): k is string =>
    typeof k === "string"
  );
  for (const key of keys) {
    const val = (props as Record<string, unknown>)[key];
    let placed = false;
    for (let i = 0; i < keySets.length; i++) {
      if (keySets[i].has(key)) {
        (result[i] as Record<string, unknown>)[key] = val;
        placed = true;
        break;
      }
    }
    if (!placed) rest[key] = val;
  }

  return [...result, rest];
}
