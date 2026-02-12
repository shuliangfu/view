/**
 * @dreamer/view/reactive — 响应式对象（用于表单 model 等双向绑定）
 *
 * 职责单一：提供 createReactive(initial)，返回可读写、与 createEffect 联动的代理对象。
 * 不放在 store：store 负责完整状态（getters/actions/persist）；不放在 signal：signal 是 [get, set] 元组。
 *
 * 用法：const model = createReactive({ name: "", age: "" }); <Form model={model} />；表单内 model.name = value 即可双向更新。
 */
/**
 * 创建响应式对象（Proxy），读写与 createEffect 联动，适合作为表单 model 等「传一个变量、双向更新」的场景
 *
 * @param initial 初始对象（会被浅拷贝，不会直接修改入参）
 * @returns 响应式代理，在 effect 中读取会登记依赖，任意属性赋值会触发订阅更新
 *
 * @example
 * const model = createReactive({ name: "", age: "", sex: "" });
 * <Form model={model} />
 * // 表单内：props.model.name = e.target.value 即可
 */
export declare function createReactive<T extends Record<string, unknown>>(initial: T): T;
//# sourceMappingURL=reactive.d.ts.map