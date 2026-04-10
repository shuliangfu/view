/**
 * @module types
 * @description 框架级公共类型：`VNode`、`JSXRenderable`、`InsertValue`、`Switch`/`Match`、`ViewSignalTagged`、`JSXElementType` 等，供运行时与 `jsx` 收窄 `any`。
 *
 * **为何叫 VNode 而不是 Node**
 * - 浏览器全局已有 **`Node`**（DOM 节点接口），若再定义同名「虚拟树」类型会造成混淆与类型冲突。
 * - 本框架中 **`jsx`/`jsxs` 的返回值**是延迟求值的 **Thunk**（`() => …`），文档与适配器（如 `@dreamer/render`）统一用 **`VNode`** 指代该形态。
 */

/**
 * `Match` 描述符上的标记字段名，供 `Switch` 识别（非 DOM，不直接插入文档）。
 * @constant
 */
export const VIEW_MATCH_KEY = "__VIEW_MATCH__" as const;

/**
 * 虚拟节点：`jsx` / `jsxs` 返回的延迟求值函数（Thunk）。
 *
 * 求值后可得到 DOM 节点、文本、数组、嵌套 Thunk 等，与 `insert()` 第二参数 `value` 的语义一致。
 * 组件可声明为 `function App(): VNode`，与 README 中的类型示例对齐。
 *
 * 注意：勿与 DOM 的 `globalThis.Node` 混淆。
 */
export type VNode = () => unknown;

/**
 * `Match` 组件的返回值：`Switch` 按顺序求值 `when` 并择一插入 `children`。
 */
export interface ViewMatchDescriptor {
  [VIEW_MATCH_KEY]: true;
  /** 为真时本 Match 被选中 */
  when: () => unknown;
  /** 要插入的子内容 */
  children: JSXRenderable;
}

/**
 * 组件函数体 **`return` 可出现的 UI 值**：与 `JSX.Element` 对齐，比 `any` 更严、比单用 `VNode` 更全。
 *
 * - **`VNode`**：`jsx` 对原生标签/函数组件外包一层 Thunk 的常见形态。
 * - **`DocumentFragment`**：`Show` / `For` / `Suspense` / `ErrorBoundary` / `Switch` / `Portal` 等控制流组件的返回值。
 * - **`Node`**：`Dynamic`、部分路径下的真实 DOM 节点（如 `HTMLElement`、`Text`）。
 * - **`ViewMatchDescriptor`**：仅 **`Match`** 组件，供父级 **`Switch`** 消费。
 * - **数组**：`Provider` 直接 `return props.children`、或手写多根时的列表。
 * - **原语**：`insert` 可接受的文本等。
 */
export type JSXRenderable =
  | VNode
  | DocumentFragment
  | Node
  | ViewMatchDescriptor
  | string
  | number
  | bigint
  | false
  | null
  | undefined
  | readonly JSXRenderable[]
  | JSXRenderable[];

/**
 * 函数上的可选标记：`createSignal` 返回的 getter/setter 等，供 `insert` 与 thunk 解包区分「响应式 getter」与「普通 VNode Thunk」。
 */
export type ViewSignalTagged = {
  __VIEW_SIGNAL?: true;
};

/**
 * 组件等可通过静态字段声明「透明 Provider」，运行时由 `jsx` 识别。
 */
export type ViewTransparentProviderMeta = {
  __IS_TRANSPARENT_PROVIDER?: true;
};

/**
 * `insert()` 第二参数 `value`：在 {@link JSXRenderable} 之外，兼容 `boolean`（与 `null` 同类清空）、`bigint`、
 * 以及子树数组/类数组；其余值在实现中会 `String(value)` 化为文本节点。
 */
export type InsertValue =
  | JSXRenderable
  | boolean
  | bigint
  | readonly (InsertValue | null | undefined)[]
  | ArrayLike<InsertValue | null | undefined>;

/**
 * `insert()` 第三参数 `current` / 返回值：当前占位 DOM 节点或「尚未插入」。
 */
export type InsertCurrent = Node | null | undefined;

/**
 * `Switch` 子槽：普通可渲染子、`Match` 描述符、或它们的数组（含 Fragment 展开结果）。
 */
export type SwitchChild = JSXRenderable | ViewMatchDescriptor;

/**
 * `Show` / `ErrorBoundary` 等：子节点为静态树或「无参渲染函数」。
 */
export type ViewSlot = JSXRenderable | (() => JSXRenderable);

/**
 * `Show`：条件成立时子节点可为「单参渲染函数」，参数为 `when()` 的真值分支类型。
 */
export type ShowChildren<T> = JSXRenderable | ((item: T) => JSXRenderable);

/**
 * 控制流可读源：**当前值**、**零参 getter**，或 **`createSignal` 解构出的 getter**（可调用且带 `__VIEW_SIGNAL`）。
 * 用于 `Show`/`For`/`Match`/`ErrorBoundary.resetKeys` 等，与 `readAccessor` 配套。
 */
export type MaybeAccessor<T> = T | (() => T);

/**
 * `jsx(type, props)` 的 `type`：宿主标签名，或组件函数。
 *
 * 组件形参不能用单一的 `Record<string, unknown>` 描述：在 `strictFunctionTypes` 下，
 * `(props: { foo: 1 }) => …` 不能赋给 `(props: Record<string, unknown>) => …`（逆变）。
 * 因此此处对 **props 使用 `any`**，具体形状仍由各组件自己的函数类型声明。
 */
export type JSXElementType =
  | string
  // deno-lint-ignore no-explicit-any
  | ((props: any) => JSXRenderable);

/**
 * 对象形式的 `ref`：`{ current: ... }` 由 JSX 运行时填入 DOM；`current` 可选以兼容宽松对象。
 */
export type ViewRefObject<T = unknown> = {
  current?: T | null;
};

/**
 * 由 {@link createRef} 返回的 ref 容器，`current` 始终存在（初始可为 `null`），便于类型收窄。
 */
export type RefObject<T = unknown> = {
  current: T | null;
};
