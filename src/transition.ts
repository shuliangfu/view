/**
 * 轻量过渡组件：根据 show 控制子节点挂载/卸载，挂载时添加 enter class，卸载前添加 leave class 并等待 duration。不内置动画，由 CSS 配合 class 实现。
 *
 * @module @dreamer/view/transition
 * @packageDocumentation
 *
 * **导出：** Transition 组件、TransitionOptions 类型
 *
 * @example
 * // CSS: .enter { opacity: 0; } .enter-active { transition: opacity 0.2s; opacity: 1; }
 * <Transition show={visible} enter="enter enter-active" leave="leave leave-active" duration={200}>
 *   <div>内容</div>
 * </Transition>
 */

import { createEffect, untrack } from "./effect.ts";
import { createSignal, isSignalRef, type SignalRef } from "./signal.ts";
import type { VNode } from "./types.ts";

/** Transition 组件可选配置：enter/leave 为挂载时与卸载前添加的 class，duration 为 leave 阶段等待毫秒数后卸载 */
export interface TransitionOptions {
  /** 挂载时添加的 class（可多个用空格分隔），配合 CSS transition 实现进入动画 */
  enter?: string;
  /** 卸载前添加的 class，配合 CSS 实现离开动画；添加后等待 duration 再卸载 */
  leave?: string;
  /** leave 阶段持续时间（毫秒），超时后从 DOM 移除；默认 0 即下一帧移除 */
  duration?: number;
  /** 包裹子节点的标签名，默认 "div" */
  tag?: string;
}

type ShowGetter = () => boolean;

/** `show` 可为无参 getter 或 `SignalRef<boolean>`（读 `.value`） */
type ShowProp = ShowGetter | SignalRef<boolean>;

/**
 * 将 children 规范为可挂载子项数组（VNode 或单参挂载函数）。
 * 编译产物常为单参挂载函数 (parent)=>void，若当作无参 getter 调用则 parent 为 undefined，会导致 appendChild 报错。
 */
function normalizeTransitionChildren(
  children:
    | VNode
    | VNode[]
    | (() => VNode | VNode[])
    | ((parent: Node) => void)
    | undefined,
): (VNode | (() => unknown))[] {
  if (children == null) return [];
  if (Array.isArray(children)) return children as (VNode | (() => unknown))[];
  if (typeof children === "function") {
    // 单参为挂载函数，不能无参调用；直接作为单项交给 mount 时传入 parent
    if ((children as (...args: unknown[]) => unknown).length === 1) {
      return [children as () => unknown];
    }
    const v = (children as () => VNode | VNode[])();
    return Array.isArray(v) ? v : v != null ? [v] : [];
  }
  return [children];
}

/**
 * 过渡组件：根据 show 的布尔值决定是否渲染子节点；显示时添加 enter class，隐藏时先添加 leave class、等待 duration 后卸载。
 * 不内置动画实现，具体视觉效果由 CSS（transition/keyframes）配合 enter/leave class 实现。
 * 返回一个 getter 组件，内部读取 phase() 以参与响应式更新。
 *
 * @param props.show - 控制是否显示的 getter，或 `SignalRef<boolean>`（如路由 `getState` 返回的 ref）
 * @param props.enter - 挂载时应用的 class
 * @param props.leave - 卸载前应用的 class
 * @param props.duration - leave 后等待毫秒再卸载，默认 0
 * @param props.tag - 包裹元素的标签，默认 "div"
 * @param props.children - 子节点
 * @returns 无参 getter，返回当前应渲染的 VNode 或 null（phase 为 left 时）
 */
export function Transition(
  props: TransitionOptions & {
    show: ShowProp;
    children?: VNode | VNode[] | (() => VNode | VNode[]);
  },
): () => VNode | null {
  const {
    show: showProp,
    enter = "",
    leave = "",
    duration = 0,
    tag = "div",
    children,
  } = props;

  /** 统一为无参 getter，便于内部只调 `showFn()` */
  const showFn: ShowGetter = isSignalRef(showProp)
    ? () => showProp.value
    : showProp;

  /** 用 show 的初始值初始化 phase；untrack 避免把根 effect 订阅到 show，否则整树重跑会重置状态、点击无效 */
  const phase = createSignal<"entered" | "leaving" | "left">(
    untrack(() => (showFn() ? "entered" : "left")),
  );

  createEffect(() => {
    const visible = showFn();
    if (visible) {
      phase.value = "entered";
    } else {
      // 必须用 untrack 读 phase：否则 phase.value = "leaving" 会让本 effect 因订阅 phase 而立刻重跑，
      // 上一轮 return 的 clearTimeout 会取消 setTimeout，永远无法进入 "left"，隐藏无效果。
      const p = untrack(() => phase.value);
      if (p === "entered") {
        phase.value = "leaving";
        const ms = Math.max(0, duration);
        const id = setTimeout(() => {
          phase.value = "left";
        }, ms);
        return () => clearTimeout(id);
      }
    }
  });

  return (): VNode | null => {
    const p = phase.value;
    if (p === "left") return null;
    const nodes = normalizeTransitionChildren(children);
    const cls = p === "leaving" ? leave : enter;
    // 运行时 mountVNodeTree → normalizeChildren / mountChildItemForVnode 支持 children 中含单参挂载函数
    return {
      type: tag,
      props: { class: cls, children: nodes as VNode[] },
      children: nodes as VNode[],
    };
  };
}
