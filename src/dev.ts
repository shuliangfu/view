/**
 * 开发模式入口：与 mod 导出一致，仅将 createRoot 包装为挂载后写入 globalThis.__VIEW_ROOT__，
 * 供 HMR 无感刷新时 unmount 后重载 main。仅用于 dev 构建时通过 alias 替换 @dreamer/view。
 */

import type { Root, VNode } from "./types.ts";
import * as view from "./mod.ts";

const _createRoot = view.createRoot;

/**
 * 包装 createRoot：挂载后把 root 存到 __VIEW_ROOT__，供 __HMR_REFRESH__ 调用 unmount。
 */
function createRoot(fn: () => VNode, container: Element): Root {
  const root = _createRoot(fn, container);
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as { __VIEW_ROOT__?: Root }).__VIEW_ROOT__ = root;
  }
  return root;
}

export const createEffect = view.createEffect;
export const createMemo = view.createMemo;
export const createSignal = view.createSignal;
export const generateHydrationScript = view.generateHydrationScript;
export const getCurrentEffect = view.getCurrentEffect;
export const hydrate = view.hydrate;
export const isDOMEnvironment = view.isDOMEnvironment;
export const isSignalGetter = view.isSignalGetter;
export const onCleanup = view.onCleanup;
export const render = view.render;
export const renderToString = view.renderToString;
export const setCurrentEffect = view.setCurrentEffect;
export { createRoot };
export type {
  EffectDispose,
  Root,
  SignalGetter,
  SignalSetter,
  SignalTuple,
  VNode,
} from "./types.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
