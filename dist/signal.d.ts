/**
 * View 模板引擎 — Signal（信号）
 *
 * 细粒度响应式单元：getter 读值并登记当前 effect 为依赖，setter 改值并通知所有依赖的 effect 执行。
 * 通知通过调度器异步执行，避免 effect 内「读→写」导致同步重入卡死主线程。
 */
/**
 * 在 effect 执行期间调用，用于将当前 effect 设为「正在执行」以便 signal 的 getter 能登记依赖
 * @internal 由 effect.ts 的 createEffect 使用
 */
export declare function setCurrentEffect(effect: (() => void) | null): void;
/**
 * 获取当前正在执行的 effect
 * @internal
 */
export declare function getCurrentEffect(): (() => void) | null;
/**
 * 创建响应式信号
 *
 * @param initialValue 初始值
 * @returns [getter, setter] 元组：getter 读值并登记依赖，setter 写值并通知依赖
 *
 * @example
 * const [count, setCount] = createSignal(0);
 * createEffect(() => console.log(count())); // 每次 setCount 后都会打印
 * setCount(1);
 */
export declare function createSignal<T>(initialValue: T): [() => T, (value: T | ((prev: T) => T)) => void];
/**
 * 判断一个函数是否为 view 的 signal getter（用于 dom 层区分「需响应式绑定的 prop」与普通函数如事件处理）
 * 通过 getter 上挂载的标记判断。
 */
export declare const SIGNAL_GETTER_MARKER: unique symbol;
/** 给 getter 打标记，供 isSignalGetter 使用 */
export declare function markSignalGetter<T>(getter: () => T): () => T;
export declare function isSignalGetter(fn: unknown): fn is () => unknown;
//# sourceMappingURL=signal.d.ts.map