/**
 * View 模板引擎 — 公共类型定义。
 *
 * @module @dreamer/view/types
 * @packageDocumentation
 *
 * 定义 Signal、Effect、VNode、Root、MountOptions 等核心类型，供 signal、effect、jsx-runtime、runtime 等模块使用。
 *
 * **导出类型：** SignalGetter、SignalSetter、SignalTuple、EffectDispose、VNode、MountOptions、Root、ElementWithViewData
 *
 * **导出函数：** isDOMEnvironment
 */

/**
 * Signal 的 getter 函数：无参，返回当前值；在 effect 或模板中调用时会参与依赖收集。
 */
export type SignalGetter<T> = () => T;

/**
 * Signal 的 setter 函数：可传入新值或 updater 函数 (prev => next)。
 */
export type SignalSetter<T> = (value: T | ((prev: T) => T)) => void;

/**
 * createSignal 返回的元组：[getter, setter]。
 */
export type SignalTuple<T> = [getter: SignalGetter<T>, setter: SignalSetter<T>];

/**
 * Effect 的 dispose 函数：调用后取消该 effect 的订阅并执行已登记的 cleanup。
 */
export type EffectDispose = () => void;

/**
 * 虚拟节点描述符：JSX 编译后的节点描述，供 render / renderToString / hydrate 消费。
 */
export type VNode = {
  /**
   * 节点类型：字符串为原生标签名；函数为组件 (props) => VNode | VNode[] | null；Symbol（如 Fragment）为占位/片段
   */
  type:
    | string
    | symbol
    | ((props: Record<string, unknown>) => VNode | VNode[] | null);
  /** 属性与子节点（children 可能在此或单独在 children 字段） */
  props: Record<string, unknown>;
  /** 可选 key，用于列表 diff 时的稳定性 */
  key?: string | number | null;
  /** 子节点列表（部分场景由 type 与 props 推导，此处可显式提供） */
  children?: VNode[];
};

/**
 * mount(container, fn, options?) 的可选配置。
 * - hydrate: true 强制 hydrate，false 强制 render，undefined 时「有子节点则 hydrate 否则 render」
 * - noopIfNotFound: 为 true 且 container 为选择器且查不到元素时不抛错，返回空 Root；默认 false 抛错
 */
export type MountOptions = {
  hydrate?: boolean;
  noopIfNotFound?: boolean;
};

/**
 * 根实例：createRoot / render / hydrate 返回的句柄。
 * 调用 unmount() 可卸载该根并回收其下所有 effect。
 * forceRender() 可强制根 effect 重新执行一次，用于外部路由等非响应式来源驱动整树重算。
 */
export type Root = {
  /** 卸载根并清理所有 effect 与指令 */
  unmount: () => void;
  /** 挂载的 DOM 容器（仅浏览器环境有值） */
  container?: Element | null;
  /** 强制根 effect 重新执行一次（外部路由等场景触发整树重算） */
  forceRender?: () => void;
};

/**
 * 扩展 Element：挂载 View 指令的 unmount 回调等扩展属性，供 dom 层内部使用。
 */
export interface ElementWithViewData extends Element {
  __viewDirectiveUnmount?: (() => void)[];
  [key: string]: unknown;
}

/**
 * 判断当前是否处于浏览器 DOM 环境（存在 document 等）。
 * 用于在 SSR 与 CSR 之间做分支（如 createRoot 在非 DOM 环境直接返回空 Root）。
 *
 * @returns 若 globalThis.document 存在则为 true，否则为 false
 */
export function isDOMEnvironment(): boolean {
  return typeof globalThis !== "undefined" &&
    typeof (globalThis as { document?: unknown }).document !== "undefined";
}
