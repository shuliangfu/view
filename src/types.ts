/**
 * View 模板引擎 — 公共类型
 *
 * 定义 Signal、Effect、VNode、渲染结果等核心类型，供 signal、effect、jsx-runtime、runtime 等模块使用。
 */

/** Signal 的 getter 函数（无参，返回当前值），用于依赖收集 */
export type SignalGetter<T> = () => T;

/** Signal 的 setter 函数（支持值或 updater 函数） */
export type SignalSetter<T> = (value: T | ((prev: T) => T)) => void;

/** createSignal 返回的元组 [getter, setter] */
export type SignalTuple<T> = [getter: SignalGetter<T>, setter: SignalSetter<T>];

/** Effect 的 dispose 函数，用于取消订阅 */
export type EffectDispose = () => void;

/**
 * VNode 描述符：JSX 编译后的节点描述，供 render / renderToString 消费
 * - type 为字符串时表示原生 DOM 标签
 * - type 为函数时表示组件（接收 props 返回 VNode 或 VNode[]）
 * - type 为 Symbol（如 Fragment）时表示占位/片段，不生成真实节点
 */
export type VNode = {
  type:
    | string
    | symbol
    | ((props: Record<string, unknown>) => VNode | VNode[] | null);
  props: Record<string, unknown>;
  key?: string | number | null;
  children?: VNode[];
};

/** 根实例：render / hydrate 返回的句柄，可 unmount */
export type Root = {
  unmount: () => void;
  /** 挂载的容器元素（仅浏览器环境） */
  container?: Element | null;
};

/**
 * 扩展 Element：挂载指令 unmounted 回调列表及事件等扩展属性，供 dom 层内部使用
 * 集中声明后避免多处 el as unknown as Record<string, unknown> 断言
 */
export interface ElementWithViewData extends Element {
  __viewDirectiveUnmount?: (() => void)[];
  [key: string]: unknown;
}

/** 是否处于浏览器 DOM 环境（用于 SSR 与 CSR 分支） */
export function isDOMEnvironment(): boolean {
  return typeof globalThis !== "undefined" &&
    typeof (globalThis as { document?: unknown }).document !== "undefined";
}
