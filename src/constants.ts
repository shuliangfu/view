/**
 * @module @dreamer/view/constants
 * @description
 * 集中管理挂载到 globalThis 的 __VIEW_* 键名，避免各模块硬编码字符串与拼写错误。
 * @internal 仅由 scheduler、signal、context、store、directive、runtime、hmr、route-page、cmd/build 等使用
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

/** DOM 占位符 / 标记用 data 属性（dom/element.ts）：keyed 列表包裹节点 */
export const KEYED_WRAPPER_ATTR = "data-view-keyed";
/** v-if 组占位符：一个 placeholder 对应整组 vIf/vElseIf/vElse，patch 时整组共用一个 DOM 槽位 */
export const V_IF_GROUP_ATTR = "data-view-v-if-group";
/** 单 v-if 占位符 */
export const V_IF_ATTR = "data-view-v-if";
/** v-for 占位符 */
export const V_FOR_ATTR = "data-view-v-for";
/** v-once 已更新一次后打的标记，打上后 patch 不再更新该节点 */
export const V_ONCE_FROZEN_ATTR = "data-view-v-once-frozen";
