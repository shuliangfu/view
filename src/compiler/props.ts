/**
 * 编译路径运行时 — Props 工具（mergeProps / splitProps）
 *
 * 与 Solid 对齐：避免解构 props 导致丢响应式；在 JSX 或 memo 内用 props.xxx 建立订阅。
 *
 * @module @dreamer/view/runtime/props
 */

/**
 * 合并多组 props，后者覆盖前者。
 * 若某 key 的值为函数（getter），保留为 getter 以便保持响应式。
 *
 * @param sources - 多组 props 对象
 * @returns 合并后的代理，读 key 时按顺序取最后一个存在的值
 */
export function mergeProps<T extends Record<string, unknown>>(
  ...sources: (T | undefined | null)[]
): T {
  const filtered = sources.filter(
    (s): s is T => s != null && typeof s === "object",
  );
  if (filtered.length === 0) return {} as T;
  if (filtered.length === 1) return filtered[0];

  return new Proxy({} as T, {
    get(_, key: string) {
      for (let i = filtered.length - 1; i >= 0; i--) {
        if (key in filtered[i]) {
          return (filtered[i] as Record<string, unknown>)[key];
        }
      }
      return undefined;
    },
    has(_, key: string) {
      return filtered.some((s) => key in s);
    },
    ownKeys() {
      const keys = new Set<string>();
      for (const s of filtered) {
        for (const k of Object.keys(s)) keys.add(k);
      }
      return [...keys];
    },
  });
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
