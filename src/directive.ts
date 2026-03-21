/**
 * 指令系统：内置 v-if/v-else/v-else-if、v-once、v-cloak，以及用户通过 registerDirective 注册的自定义指令。
 *
 * @module @dreamer/view/directive
 * @packageDocumentation
 *
 * **导出类型：** DirectiveBinding、DirectiveHooks
 *
 * **导出函数：** registerDirective、getDirective、directiveNameToCamel、directiveNameToKebab、isDirectiveProp、
 * hasDirective、getDirectiveValue、createBinding、hasStructuralDirective、getVIfValue、getVElseShow、
 * getVElseIfValue、applyDirectives
 *
 * 表单双向绑定：使用 createReactive 或 createSignal，在 input 上写 value={...} + onInput 即可，无需 v-model。
 *
 * @example
 * registerDirective("v-focus", { mounted(el) { (el as HTMLInputElement).focus(); } });
 */

import {
  KEY_DIRECTIVE_MOUNTED_RAN,
  KEY_DIRECTIVE_REGISTRY,
} from "./constants.ts";
import {
  directiveNameToCamel,
  directiveNameToKebab,
} from "./directive-name.ts";
import { getGlobalOrDefault } from "./globals.ts";
import { insert } from "./compiler/insert.ts";
import { isSignalGetter, isSignalRef } from "./signal.ts";
/**
 * 指令绑定：传给指令钩子的参数。
 */
export interface DirectiveBinding<T = unknown> {
  /** 当前绑定值 */
  value: T;
  /** 上一次的绑定值（updated 时可用） */
  oldValue?: T;
  /** 参数，如 v-foo:arg 中的 arg */
  arg?: string;
  /** 修饰符，如 v-foo.mod1.mod2 中的 ['mod1','mod2'] */
  modifiers?: string[];
}

/**
 * 指令钩子：mounted 在元素挂载时调用，updated 在绑定值变化时调用，unmounted 在元素卸载时调用。
 */
export interface DirectiveHooks<T = unknown> {
  mounted?(el: Element, binding: DirectiveBinding<T>): void;
  updated?(el: Element, binding: DirectiveBinding<T>): void;
  unmounted?(el: Element): void;
}

/** 用 globalThis 存 registry，避免打包多份 directive 模块时各用各的 Map，导致懒加载页注册的指令在 applyDirectives 里查不到 */
const registry = getGlobalOrDefault(
  KEY_DIRECTIVE_REGISTRY,
  () => new Map<string, DirectiveHooks>(),
);

/** 记录已在某元素上执行过 mounted 的指令 key，存于 globalThis 与 registry 一致，多份 directive 共享，重渲染时不再重复执行 */
const mountedRanByElement = getGlobalOrDefault(
  KEY_DIRECTIVE_MOUNTED_RAN,
  () => new WeakMap<Element, Set<string>>(),
);

/** 指令名转换由 directive-name 模块实现，此处统一 re-export 以保持 API 稳定 */
export {
  directiveNameToCamel,
  directiveNameToKebab,
} from "./directive-name.ts";

/**
 * 注册自定义指令
 *
 * @param name 指令名，支持 v-xxx 或 vXxx
 * @param hooks mounted / updated / unmounted
 *
 * @example
 * registerDirective("v-focus", {
 *   mounted(el) { (el as HTMLInputElement).focus(); },
 * });
 */
export function registerDirective(name: string, hooks: DirectiveHooks): void {
  const camel = directiveNameToCamel(name);
  registry.set(camel, hooks);
  if (camel !== name) registry.set(name, hooks);
}

/**
 * 根据 prop 名获取已注册的指令（支持 vIf、v-if 等写法）。
 *
 * @param propKey - props 中的键名
 * @returns 指令钩子对象，未注册则返回 undefined
 */
export function getDirective(propKey: string): DirectiveHooks | undefined {
  if (!propKey.startsWith("v") && !propKey.startsWith("v-")) return undefined;
  return registry.get(propKey) ??
    registry.get(directiveNameToCamel(propKey)) ??
    registry.get(directiveNameToKebab(propKey));
}

/** 判断是否为指令类 prop 名（内置或已注册） */
const BUILTIN_DIRECTIVE_PROPS = new Set([
  "vIf",
  "v-if",
  "vElse",
  "v-else",
  "vElseIf",
  "v-else-if",
  "vOnce",
  "v-once",
  "vCloak",
  "v-cloak",
]);

/**
 * 判断给定 prop 键名是否为指令类（内置或 v- 开头、或 vXxx 驼峰如 vIf）。
 * 必须排除原生 prop「value」「viewBox」等：仅当第二字符为大写或为 '-' 时才视为指令（如 vIf、v-once），否则 value 会被误判并跳过，导致 input value 无法写回。
 */
export function isDirectiveProp(propKey: string): boolean {
  if (BUILTIN_DIRECTIVE_PROPS.has(propKey)) return true;
  if (propKey.startsWith("v-")) return true;
  // vXxx 驼峰指令：第二字符为大写（vIf），排除 value、viewBox 等
  return propKey.startsWith("v") && propKey.length > 1 &&
    propKey[1] === propKey[1].toUpperCase();
}

/**
 * 判断 props 是否包含指定指令（同时支持 camelCase 与 kebab-case）。
 *
 * @param props - 节点 props
 * @param camelName - 指令驼峰名，如 'vIf'
 * @returns 若包含该指令则为 true
 */
export function hasDirective(
  props: Record<string, unknown>,
  camelName: string,
): boolean {
  if (camelName in props) return true;
  const kebab = directiveNameToKebab(camelName);
  return kebab in props;
}

/**
 * 获取指令绑定的当前值：若为 signal getter 则求值，否则返回原值。
 * 供 dom 层 v-once 冻结及指令应用时使用。
 *
 * @param value - 原始值或 getter
 * @returns 求值后的值
 */
export function getDirectiveValue(value: unknown): unknown {
  if (isSignalGetter(value)) return (value as () => unknown)();
  if (isSignalRef(value)) return value.value;
  return value;
}

/**
 * 从 value/arg/modifiers 构造 DirectiveBinding，供自定义指令使用（编译产物路径下无 applyProps，仅保留 API 供扩展）。
 *
 * @param value - 绑定值（可为 getter，会在此处求值）
 * @param arg - 可选参数
 * @param modifiers - 可选修饰符数组
 * @returns 指令绑定对象
 */
export function createBinding(
  value: unknown,
  arg?: string,
  modifiers?: string[],
): DirectiveBinding {
  return {
    value: getDirectiveValue(value),
    arg,
    modifiers: modifiers ?? [],
  };
}

/**
 * 检查 props 是否包含结构性指令 vIf（需在 createElement 中优先处理）。
 *
 * @param props - 节点 props（hydrate 时组件返回函数会被当作子节点传入，props 可能为 undefined，需防御）
 * @returns "vIf" | null
 */
export function hasStructuralDirective(
  props: Record<string, unknown> | null | undefined,
): "vIf" | null {
  if (props == null || typeof props !== "object") return null;
  if ("vIf" in props || "v-if" in props) return "vIf";
  return null;
}

/**
 * 取 v-if 的当前条件值（支持 getter 求值）。
 * 支持 signal getter 与普通无参函数，在 effect 内读取并订阅。
 *
 * @param props - 节点 props
 * @returns 条件为真则 true
 */
export function getVIfValue(props: Record<string, unknown>): boolean {
  const raw = props["vIf"] ?? props["v-if"];
  if (raw == null) return true;
  const v = typeof raw === "function"
    ? (raw as () => unknown)()
    : getDirectiveValue(raw);
  return Boolean(v);
}

/**
 * 取 v-else 是否应显示：仅当上一个 v-if 为 false 时 v-else 才显示。
 *
 * @param lastVIf - 同一批兄弟中上一个 v-if 的结果
 * @returns 若应显示 v-else 则为 true
 */
export function getVElseShow(lastVIf: boolean): boolean {
  return !lastVIf;
}

/**
 * 取 v-else-if 的当前条件值（支持 getter 求值）。
 *
 * @param props - 节点 props
 * @returns 条件为真则 true
 */
export function getVElseIfValue(props: Record<string, unknown>): boolean {
  const raw = props["vElseIf"] ?? props["v-else-if"];
  if (raw == null) return false;
  const v = typeof raw === "function"
    ? (raw as () => unknown)()
    : getDirectiveValue(raw);
  return Boolean(v);
}

/**
 * 应用自定义指令到元素：对每个指令 prop 调用 mounted，若值为标记 getter 或 `SignalRef` 则用 effect 订阅并调用 updated；
 * 若指令提供 unmounted，通过 registerUnmount 登记，节点从 DOM 移除前会调用。
 *
 * @param el - 目标 DOM 元素
 * @param props - 节点 props（含指令键值）
 * @param effectFn - 创建 effect 的函数（如 createEffect），用于响应式更新
 * @param registerUnmount - 可选，登记指令 unmount 回调的函数（如 registerDirectiveUnmount）
 */
/** v-insert / vInsert：将 getter 作为插入点，仅该节点内容随 signal 更新，不触发整树重跑。与 insert(parent, getter) 语义一致。 */
const V_INSERT_KEYS = new Set(["vInsert", "v-insert"]);

export function applyDirectives(
  el: Element,
  props: Record<string, unknown>,
  effectFn: (fn: () => void) => () => void,
  registerUnmount?: (el: Element, cb: () => void) => void,
): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key") continue;
    // 内置指令由编译产物在 createElement 等路径处理，此处跳过
    if (BUILTIN_DIRECTIVE_PROPS.has(key)) continue;
    // v-insert：传 getter（不求值），在元素下做 insert(el, getter)，仅此处随依赖更新
    if (
      V_INSERT_KEYS.has(key) && typeof value === "function" && registerUnmount
    ) {
      const getter = value as () => string | number | Node | null | undefined;
      const dispose = insert(el, getter);
      if (typeof dispose === "function") registerUnmount(el, dispose);
      continue;
    }
    const directive = getDirective(key);
    if (!directive) continue;
    const binding = createBinding(value);
    if (directive.mounted) {
      let ran = mountedRanByElement.get(el);
      if (ran?.has(key)) continue; // 该元素上此指令已执行过 mounted，跳过（仅首次生效）
      if (!ran) {
        ran = new Set<string>();
        mountedRanByElement.set(el, ran);
      }
      ran.add(key);
      // 延后到微任务执行，确保元素已插入文档且比 setTimeout(0) 更早，利于首屏/更新后指令挂载
      if (typeof globalThis.queueMicrotask !== "undefined") {
        globalThis.queueMicrotask(() => directive.mounted!(el, binding));
      } else {
        globalThis.setTimeout(() => directive.mounted!(el, binding), 0);
      }
    }
    if (directive.updated && (isSignalGetter(value) || isSignalRef(value))) {
      effectFn(() => {
        /** effect 内 createBinding → getDirectiveValue 读 getter / ref.value，建立订阅 */
        const current = createBinding(value);
        directive.updated!(el, current);
      });
    }
    if (directive.unmounted && registerUnmount) {
      registerUnmount(el, () => directive.unmounted!(el));
    }
  }
}

/** 供编译器产物使用：applyDirectives 需传入的卸载登记函数，从 dom 复用以避免编译时解析 @dreamer/view/dom 子路径 */
export { registerDirectiveUnmount } from "./dom.ts";
/** 根节点整棵 removeChild 前应对子树执行，与 RoutePage.replaceChildren 前行为一致 */
export { runDirectiveUnmountOnChildren } from "./dom/unmount.ts";
