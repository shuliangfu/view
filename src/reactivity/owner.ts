/**
 * @module reactivity/owner
 * @description 响应式所有权树 (Ownership Tree) - 管理组件生命周期和清理。
 *
 * **支持的功能：**
 * - ✅ Owner 树结构 (父子关系)
 * - ✅ createRoot() - 创建独立的根作用域
 * - ✅ runWithOwner() - 在指定 Owner 下执行代码
 * - ✅ onCleanup() - 注册清理函数
 * - ✅ onError() - 错误处理
 * - ✅ adoptChild() - 建立父子关系
 * - ✅ cleanNode() - 清理节点及其子树
 * - ✅ 上下文 (contexts) 存储和管理
 *
 * **核心机制：**
 * - 树形结构管理组件层级
 * - 自动清理 (onCleanup)
 * - 错误冒泡 (onError)
 * - 上下文查找 (向上查找 Owner 链)
 *
 * **范围说明：**
 * - 深层 Owner 链查找为当前模型固有成本；可视化与进阶内存策略属开发体验增强项。
 *
 * @usage
 * createRoot((dispose) => {
 *   onCleanup(() => console.log("cleanup"))
 *   return <Component/>
 * })
 */

import { ownerCore } from "./master.ts";
import { cleanupObserver, STATE_DISPOSED } from "./signal.ts";

/** 在节点销毁或 effect 重跑前调用的无参清理回调。 */
export type Disposable = () => void;

/**
 * 响应式所有权树中的节点：承载 `onCleanup`、子 Owner 与上下文映射。
 * @property owner 父节点，`null` 表示根之上无父
 * @property disposables 待执行的清理函数列表
 * @property children 子 Owner 列表
 * @property errorHandlers 错误冒泡处理器
 * @property contexts 按 symbol 存储的上下文 getter
 */
export interface Owner {
  owner: Owner | null;
  disposables: Disposable[] | null;
  children: Owner[] | null;
  errorHandlers?: ((err: unknown) => void)[] | null;
  contexts?: Map<symbol, any> | null;
}

/**
 * 获取当前执行栈上的所有权节点（组件/effect 所在作用域）。
 * @returns 当前 `Owner`，无则 `null`
 */
export function getOwner(): Owner | null {
  return ownerCore.current;
}

/**
 * 切换当前所有权上下文并返回上一个节点。
 * @param owner 要成为当前的 `Owner`，或 `null`
 * @returns 调用前的当前 `Owner`
 */
export function setOwner(owner: Owner | null): Owner | null {
  const prev = ownerCore.current;
  ownerCore.current = owner;
  return prev;
}

/**
 * 创建新的所有权节点，父节点为当前的 `getOwner()`。
 * @returns 新 `Owner` 实例
 */
export function createOwner(): Owner {
  return {
    owner: getOwner(),
    disposables: null,
    children: null,
    contexts: null,
  };
}

/**
 * 在指定 `owner` 上下文中同步执行 `fn`，结束后恢复之前的 Owner。
 * @template T `fn` 的返回类型
 * @param owner 作为 `getOwner()` 使用的节点
 * @param fn 在上下文中执行的函数
 * @returns `fn()` 的返回值
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = setOwner(owner);
  try {
    return fn();
  } finally {
    setOwner(prev);
  }
}

/**
 * 在当前 `Owner` 销毁或 effect 即将重跑时调用 `fn`。
 * @param fn 清理回调
 */
export function onCleanup(fn: Disposable): void {
  const owner = getOwner();
  if (owner) {
    if (owner.disposables === null) owner.disposables = [fn];
    else owner.disposables.push(fn);
  }
}

/**
 * 递归清理子 Owner、执行本节点 `disposables`；可选将自身标为已销毁并断开订阅。
 * @param owner 目标所有权节点
 * @param selfDispose 为 `true` 时同时销毁 `owner` 自身（从父节点移除、标 `STATE_DISPOSED` 等）
 * @returns `void`
 */
export function cleanNode(owner: Owner, selfDispose = false): void {
  // 1. 递归清理子节点（子节点必须彻底销毁）
  if (owner.children) {
    const children = [...owner.children];
    children.forEach((child) => cleanNode(child, true));
    owner.children = null;
  }

  // 2. 运行当前节点的清理函数
  if (owner.disposables) {
    const disposables = [...owner.disposables];
    owner.disposables = null;
    disposables.forEach((d) => d());
  }

  // 3. 如果标记了彻底销毁，则标记状态并断开依赖
  if (selfDispose) {
    if ("state" in (owner as any)) {
      (owner as any).state = STATE_DISPOSED;
    }
    if ("sources" in (owner as any)) {
      cleanupObserver(owner as any);
    }
    // 核心修复：从父节点中移除自身引用，彻底斩断泄露路径
    if (owner.owner && owner.owner.children) {
      const idx = owner.owner.children.indexOf(owner);
      if (idx > -1) owner.owner.children.splice(idx, 1);
    }
  }
}

/**
 * 建立父子关系：`child.owner` 应由调用方另行维护为 `parent` 时与树一致。
 * @param parent 父节点
 * @param child 子节点
 */
export function adoptChild(parent: Owner, child: Owner): void {
  if (parent.children === null) parent.children = [child];
  else if (!parent.children.includes(child)) parent.children.push(child);
}

/**
 * 创建独立根 `Owner` 并执行 `fn`；`dispose` 可释放整棵子树。
 * @template T `fn` 的返回类型
 * @param fn 接收 `dispose` 的初始化函数
 * @returns `fn` 的返回值
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const root = createOwner();
  return runWithOwner(root, () => fn(() => cleanNode(root, true)));
}

/**
 * 在当前 `Owner` 上登记错误处理器，供 `catchError` 冒泡时调用。
 * @param fn 接收错误的回调
 */
export function onError(fn: (err: unknown) => void): void {
  const owner = getOwner();
  if (owner) {
    if (!owner.errorHandlers) owner.errorHandlers = [fn];
    else owner.errorHandlers.push(fn);
  }
}

/**
 * 沿 `Owner` 链向上查找 `onError` 处理器并调用；若无则 `console.error`。
 * @param err 待处理的异常或拒绝值
 */
export function catchError(err: unknown): void {
  let current = getOwner();
  while (current) {
    if (current.errorHandlers && current.errorHandlers.length > 0) {
      // 核心：克隆一份处理器列表，防止执行期间被修改导致死循环
      const handlers = [...current.errorHandlers];
      for (const h of handlers) {
        h(err);
      }
      return;
    }
    current = current.owner;
  }
  // 核心：若没有任何处理器捕获，静默打印并交给全局
  console.error("[@dreamer/view] Uncaught Error:", err);
}
