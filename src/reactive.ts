/**
 * 响应式对象：将普通对象变为与 createEffect 联动的 Proxy，适合表单 model 等「单对象、多字段、双向绑定」场景。
 *
 * @module @dreamer/view/reactive
 * @packageDocumentation
 *
 * **导出函数：** createReactive
 *
 * 与 store / signal 区别：不提供 getters/actions/persist（用 store）；不是单值 [get, set]（用 signal）。
 *
 * @example
 * const model = createReactive({ name: "", age: "" });
 * // 表单内：props.model.name = e.target.value 即可双向更新
 */

import { createNestedProxy } from "./proxy.ts";

/**
 * 创建响应式对象（Proxy），读写与 createEffect 联动，适合作为表单 model 等「传一个变量、双向更新」的场景。
 *
 * @typeParam T - 对象形状，需为 Record<string, unknown> 的子类型
 * @param initial - 初始对象（会被浅拷贝，不会直接修改入参）
 * @returns 响应式代理，在 effect 中读取会登记依赖，任意属性赋值会触发订阅更新
 *
 * @example
 * const model = createReactive({ name: "", age: "", sex: "" });
 * <Form model={model} />
 * // 表单内：props.model.name = e.target.value 即可
 */
export function createReactive<T extends Record<string, unknown>>(
  initial: T,
): T {
  const state = { ...initial };
  return createNestedProxy(state, new Set(), new WeakMap());
}
