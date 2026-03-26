/**
 * @module @dreamer/view/constants
 * @description
 * 集中管理挂载到 globalThis 的 __VIEW_* 键名，避免各模块硬编码字符串与拼写错误。
 * @internal 仅由 scheduler、signal、context、store、directive、runtime、hmr、route-page、server/core/build 等使用
 *
 * **globalThis 键名一览（统一在此定义，各模块从本文件 import 使用）：**
 * - KEY_SCHEDULER / KEY_CURRENT_EFFECT：调度与 effect
 * - KEY_CONTEXT_* / KEY_PROVIDER_BINDINGS：Context
 * - KEY_STORE_REGISTRY / DEFAULT_STORE_KEY：Store
 * - KEY_DIRECTIVE_REGISTRY：自定义指令
 * - KEY_VIEW_DATA / KEY_VIEW_ROOT：根与 hydrate 数据
 * - KEY_HMR_*：HMR 相关
 */

/** 调度器队列与 scheduled 状态（scheduler.ts） */
export const KEY_SCHEDULER = "__VIEW_SCHEDULER";

/**
 * 为 true 时 `flushQueue` 在批末尝试按 id/name+type+value 启发式恢复上一活跃 `input`/`textarea`/`select` 焦点（步骤 6，默认未设置视为 false）。
 */
export const KEY_VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED =
  "__VIEW_SCHEDULER_FOCUS_RESTORE_ENABLED__";

/**
 * 为严格 `true` 时，组字期间（`KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH` 大于 0）推迟 `flushQueue`，
 * 以微任务链轮询直至深度归零后一次合并 flush。**默认未设置或其它值视为关闭**，避免误设深度导致微任务无法收敛。
 * 与 {@link KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH} 配合，见 scheduler.ts。
 */
export const KEY_VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING =
  "__VIEW_SCHEDULER_DEFER_FLUSH_WHILE_COMPOSING__";

/** 当前文档上 IME 组字会话嵌套深度（compositionstart +1 / compositionend -1），存于 globalThis */
export const KEY_VIEW_SCHEDULER_COMPOSITION_DEPTH =
  "__VIEW_SCHEDULER_COMPOSITION_DEPTH__";

/** 已在 document 上挂载 composition 监听时为 true，避免重复 addEventListener */
export const KEY_VIEW_SCHEDULER_COMPOSITION_LISTENERS_INSTALLED =
  "__VIEW_SCHEDULER_COMPOSITION_LISTENERS_INSTALLED__";

/** 当前正在执行的 effect，用于依赖收集（signal.ts） */
export const KEY_CURRENT_EFFECT = "__VIEW_CURRENT_EFFECT";

/** Context 栈 id -> value[]（context.ts） */
export const KEY_CONTEXT_STACKS = "__VIEW_CONTEXT_STACKS";
/** Context 默认值 id -> defaultValue（context.ts） */
export const KEY_CONTEXT_DEFAULTS = "__VIEW_CONTEXT_DEFAULTS";
/** Provider 组件 -> { id, getValue } 绑定（context.ts） */
export const KEY_PROVIDER_BINDINGS = "__VIEW_PROVIDER_BINDINGS";

/** Store 全局注册表（store.ts） */
export const KEY_STORE_REGISTRY = "__VIEW_STORE_REGISTRY";
/** 默认 store 槽位，getGlobalStore() 无参时使用（store.ts） */
export const DEFAULT_STORE_KEY = "__VIEW_DEFAULT_STORE";

/** 自定义指令全局注册表，存于 globalThis，避免打包多份 directive 时 registry 不共享（directive.ts） */
export const KEY_DIRECTIVE_REGISTRY = "__VIEW_DIRECTIVE_REGISTRY__";
/** 自定义指令「已执行 mounted」记录（WeakMap<Element, Set<key>>），存于 globalThis，多份 directive 共享，保证仅首次执行（directive.ts） */
export const KEY_DIRECTIVE_MOUNTED_RAN = "__VIEW_DIRECTIVE_MOUNTED_RAN__";

/** hydrate 时挂载到 window 的 data 键名默认值（runtime.ts generateHydrationScript） */
export const KEY_VIEW_DATA = "__VIEW_DATA__";

/** HMR 根实例，由 build 注入的 banner 读取用于 unmount（build.ts） */
export const KEY_VIEW_ROOT = "__VIEW_ROOT__";
/** HMR 递增 version 的回调，由 hmr.ts 注册、build 注入的 banner 调用 */
export const KEY_HMR_BUMP = "__VIEW_HMR_BUMP__";
/** HMR 刷新前置 true，route-page 执行时清空路由 chunk 缓存 */
export const KEY_HMR_CLEAR_ROUTE_CACHE = "__VIEW_HMR_CLEAR_ROUTE_CACHE__";
/** HMR 路由 path -> chunk URL 覆盖（build 注入写入，route-page 读取） */
export const KEY_HMR_CHUNK_FOR_PATH = "__VIEW_HMR_CHUNK_FOR_PATH__";

/** 当前处于服务端渲染（renderToString/renderToStream）；与 KEY_VIEW_SSR_DOCUMENT 配合，`getDocument()` 可返回影子 document 或 null */
export const KEY_VIEW_SSR = "__VIEW_SSR__";

/**
 * 浏览器等环境下无法给 `window.document` 赋值时，renderToString 将伪 document 挂在此键；
 * 编译产物与 insert 通过 getActiveDocument() 读取，避免替换全局失败。
 */
export const KEY_VIEW_SSR_DOCUMENT = "__VIEW_SSR_DOCUMENT__";

/** 细粒度水合上下文（runtime/hydrate.ts），insert 与 document 在 hydrate 时委托给该上下文 */
export const KEY_VIEW_HYDRATE = "__VIEW_HYDRATE__";

/** 开发模式：启用 hydration 不匹配告警、忘记 getter 提示等（可由构建或运行时设置） */
export const KEY_VIEW_DEV = "__VIEW_DEV__";

/**
 * 严格 `true` 时，`insertReactive` 在「提交前已有追踪节点」的轮次中累计 patch vs 整段重挂次数，
 * 由 `getIrMetrics`（`compiler/ir-metrics.ts`）读取；默认关。
 */
export const KEY_VIEW_IR_METRICS_ENABLED =
  "__VIEW_INSERT_REACTIVE_METRICS_ENABLED__";

/**
 * `globalThis` 键：根 `_app` 挂载的 Router 实例，供约定式布局等读取当前路径（见 `@dreamer/view/router` 文档）。
 * 主包导出同名常量，避免业务硬编码字符串。
 */
export const KEY_VIEW_ROUTER = "__VIEW_ROUTER__";

/** DOM 占位符 / 标记用 data 属性（dom/element.ts）：keyed 列表包裹节点 */
export const KEYED_WRAPPER_ATTR = "data-view-keyed";
/** v-if 组占位符：一个 placeholder 对应整组 vIf/vElseIf/vElse，patch 时整组共用一个 DOM 槽位 */
export const V_IF_GROUP_ATTR = "data-view-v-if-group";
/** 单 v-if 占位符 */
export const V_IF_ATTR = "data-view-v-if";
/** v-once 已更新一次后打的标记，打上后 patch 不再更新该节点 */
export const V_ONCE_FROZEN_ATTR = "data-view-v-once-frozen";
