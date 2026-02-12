/**
 * @dreamer/view — 轻量响应式模板引擎（主入口仅核心，按需导入减小体积）
 *
 * 主入口仅导出核心 API，保证只做 CSR/SSR/SSG/Hybrid 时主包体积最小。
 * - 核心：createSignal、createEffect、createRoot、render、renderToString、hydrate
 * - JSX：view/jsx-runtime（jsx、jsxs、Fragment），jsxImportSource: "view"
 * - 按需从子路径导入：view/store、view/boundary（Suspense/ErrorBoundary）、view/directive、view/resource、view/context、view/compiler、view/stream
 * - Hybrid 注入脚本：generateHydrationScript（主入口导出，与 hydrate 配套）
 */
export { createSignal, getCurrentEffect, isSignalGetter, setCurrentEffect, } from "./signal.ts";
export { createEffect, createMemo, onCleanup } from "./effect.ts";
export { createRoot, generateHydrationScript, hydrate, render, renderToString, } from "./runtime.ts";
export type { HydrationScriptOptions } from "./runtime.ts";
export type { EffectDispose, Root, SignalGetter, SignalSetter, SignalTuple, VNode, } from "./types.ts";
export { isDOMEnvironment } from "./types.ts";
//# sourceMappingURL=mod.d.ts.map