/**
 * @module mod
 * @description @dreamer/view 框架的主入口模块。
 *
 * **框架整体架构：**
 *
 * **1. Reactivity (响应式系统)**
 * - ✅ signal.ts - 核心 Signal 实现
 * - ✅ effect.ts - 副作用系统
 * - ✅ memo.ts - 记忆化计算
 * - ✅ owner.ts - 所有权和清理机制
 * - ✅ context.ts - 上下文 API
 * - ✅ store.ts - 状态管理
 * - ✅ lifecycle.ts - 生命周期钩子
 *
 * **2. Runtime (运行时)**
 * - ✅ insert.ts - DOM 插入核心引擎
 * - ✅ browser.ts - 浏览器挂载入口 (mount/hydrate)
 * - ✅ suspense.ts - 异步悬挂机制
 * - ✅ control-flow.ts - Show/For/ErrorBoundary 等控制流
 * - ✅ component.ts - lazy/Dynamic 等高级组件
 * - ✅ hydration.ts - SSR 水合
 *
 * **3. Scheduler (调度器)**
 * - ✅ batch.ts - 批量更新优化
 * - ✅ priority.ts - 优先级调度
 *
 * **4. Integrations (集成)**
 * - ✅ resource.ts - 异步数据获取
 * - ✅ router.tsx - 路由系统
 * - ✅ form.ts - 表单处理
 *
 * **5. Compiler (编译器)**
 * - ⚠️  compiler/ 目录 - JSX 转换和优化 (开发中)
 *
 * **使用方式：**
 * import { createSignal, mount, For, Suspense, createPortal } from "@dreamer/view"
 * SSR：`renderToString` / `renderToStream` 等从 `@dreamer/view/ssr` 导入（主入口不打包 happy-dom，避免浏览器构建解析 `node:*`）。
 *
 * **当前状态：** 核心功能完整，测试覆盖较好，但部分高级特性还在优化中。
 */

export * from "./reactivity/context.ts";
export * from "./reactivity/effect.ts";
export * from "./reactivity/lifecycle.ts";
export * from "./reactivity/memo.ts";
/** {@link createMemo} 的别名，与编译器 SSR 模式 `memo` 导入一致。 */
export { createMemo as memo } from "./reactivity/memo.ts";
export * from "./reactivity/owner.ts";
export * from "./reactivity/selector.ts";
export * from "./reactivity/signal.ts";
export * from "./reactivity/store.ts";
export { VIEW_MATCH_KEY } from "./types.ts";
export type {
  InsertCurrent,
  InsertValue,
  JSXElementType,
  JSXRenderable,
  ShowChildren,
  SwitchChild,
  ViewMatchDescriptor,
  ViewRefObject,
  ViewSignalTagged,
  ViewSlot,
  ViewTransparentProviderMeta,
  VNode,
} from "./types.ts";

// Runtime
export * from "./runtime/browser.ts";
export * from "./runtime/component.ts";
export { createRef, getDocument } from "./runtime/dom.ts";
export * from "./runtime/control-flow.ts";
export {
  ErrorBoundary,
  For,
  Index,
  Match,
  Portal,
  Show,
  Switch,
} from "./runtime/control-flow.ts";
export * from "./runtime/hmr.ts";
export * from "./runtime/hydration.ts";
export * from "./runtime/insert.ts";
export { setAttribute, setProperty, spread } from "./runtime/props.ts";
export * from "./runtime/suspense.ts";
export * from "./runtime/template.ts";

/** 命令式 Portal：`createPortal(render, container)`，与声明式 {@link Portal} 互补（弹窗/toast 等） */
export { createPortal, type CreatePortalRoot } from "./runtime/portal.ts";

// Scheduler
export * from "./scheduler/batch.ts";
export * from "./scheduler/priority.ts";

// Integrations
export * from "./integrations/form.ts";
export * from "./integrations/resource.ts";
export {
  createRouter,
  type CreateRouterOptions,
  Link,
  mountWithRouter,
  type RouteConfig,
  type RouteLocation,
  type RouteMatch,
  type Router,
  useRouter,
} from "./integrations/router.tsx";
