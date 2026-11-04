/**
 * @module reactivity/signal-value-proxy
 * @description Shared Proxy for Signal-of-object / object values so eager JSX
 * field reads under setup `untrack` still fine-grain via `__VIEW_SIGNAL` thunks
 * (Context `useContext` + component props).
 */

import { getCurrentObserver, untrack } from "./signal.ts";

/**
 * Proxy handler: property access re-reads a Signal getter (or plain object).
 *
 * With component setup under `untrack`, esbuild `react-jsx` evaluates
 * `{user.name}` **before** `jsx()` / `insert`. When there is **no current
 * Observer**, data-field gets return a `__VIEW_SIGNAL` thunk so `insert` /
 * attr `createRenderEffect` can subscribe fine-grained — while setup still
 * does not subscribe the parent insert Effect.
 */
export const signalValueProxyHandler: ProxyHandler<
  object | ((...args: never[]) => unknown)
> = {
  get(target, prop) {
    const readData = (): unknown =>
      typeof target === "function" ? (target as () => unknown)() : target;

    // Symbols / internals: never defer
    if (typeof prop === "symbol") {
      const data = untrack(readData);
      if (data == null) return undefined;
      return Reflect.get(data as object, prop);
    }

    if (!getCurrentObserver()) {
      const data = untrack(readData);
      if (data == null) return undefined;
      const res = Reflect.get(data as object, prop);
      if (typeof res === "function") {
        // Nested Signal field: hand the getter to insert as-is
        if ((res as { __VIEW_SIGNAL?: boolean }).__VIEW_SIGNAL) return res;
        return (res as (...args: unknown[]) => unknown).bind(data);
      }
      // Primitive / plain field from signal-of-object: deferred read for jsx
      const accessor = () => {
        const latest = readData();
        if (latest == null) return undefined;
        return Reflect.get(latest as object, prop);
      };
      (accessor as { __VIEW_SIGNAL?: boolean }).__VIEW_SIGNAL = true;
      return accessor;
    }

    const data = readData();
    if (data == null) return undefined;
    const res = Reflect.get(data as object, prop);
    if (typeof res === "function") {
      if ((res as { __VIEW_SIGNAL?: boolean }).__VIEW_SIGNAL) {
        (res as () => unknown)(); // explicit track
        return res;
      }
      return (res as (...args: unknown[]) => unknown).bind(data);
    }
    return res;
  },
  set(target, prop, val) {
    const data = typeof target === "function"
      ? (target as () => unknown)()
      : target;
    if (data && typeof data === "object") {
      (data as Record<PropertyKey, unknown>)[prop] = val;
      return true;
    }
    return false;
  },
};

function isViewSignal(v: unknown): v is () => unknown {
  return typeof v === "function" &&
    (v as { __VIEW_SIGNAL?: boolean }).__VIEW_SIGNAL === true;
}

/**
 * Wrap a Context / props value the same way `useContext` does:
 * Signal-of-object → Proxy(getter); plain object → Proxy(object);
 * primitive Signal → call (when Observer) or return getter.
 */
export function wrapSignalValue<T>(value: unknown): T {
  if (typeof value === "function") {
    if (isViewSignal(value)) {
      const peeked = untrack(() => value());
      if (
        peeked != null &&
        (typeof peeked === "object" || typeof peeked === "function")
      ) {
        return new Proxy(value, signalValueProxyHandler) as T;
      }
      // Primitive signal: always read (Context `useContext` compat).
      // Props path returns the getter itself via wrapComponentProps.
      return value() as T;
    }
    // Non-signal function (e.g. Resource): leave as-is
    return value as T;
  }

  if (value && (typeof value === "object" || typeof value === "function")) {
    return new Proxy(value as object, signalValueProxyHandler) as T;
  }
  return value as T;
}

/**
 * Shallow-wrap component `props` so Signal / Signal-of-object fields behave
 * like Context Proxy. No-op when no Signal-tagged props (production cheap path).
 */
export function wrapComponentProps<P extends Record<string, unknown>>(
  props: P | null | undefined,
): P {
  if (!props || typeof props !== "object") return props as unknown as P;

  let needs = false;
  for (const key in props) {
    if (key === "children" || key === "key" || key === "ref") continue;
    if (isViewSignal(props[key])) {
      needs = true;
      break;
    }
  }
  if (!needs) return props;

  return new Proxy(props, {
    get(target, prop, receiver) {
      if (
        prop === "children" || prop === "key" || prop === "ref" ||
        typeof prop === "symbol"
      ) {
        return Reflect.get(target, prop, receiver);
      }
      const value = Reflect.get(target, prop, receiver);
      if (isViewSignal(value)) {
        const peeked = untrack(() => value());
        if (
          peeked != null &&
          (typeof peeked === "object" || typeof peeked === "function")
        ) {
          // Signal-of-object → same Proxy as Context (eager {user.name} thunk)
          return new Proxy(value, signalValueProxyHandler);
        }
        // Primitive signal prop: hand getter to insert / attr effects
        return value;
      }
      return value;
    },
  }) as P;
}
