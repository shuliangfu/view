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

/** 清理函数类型 */
export type Disposable = () => void;

/** 所有权节点 */
export interface Owner {
  owner: Owner | null;
  disposables: Disposable[] | null;
  children: Owner[] | null;
  errorHandlers?: ((err: unknown) => void)[] | null;
  contexts?: Map<symbol, any> | null;
}

/**
 * 获取当前活跃的所有权节点。
 */
export function getOwner(): Owner | null {
  return ownerCore.current;
}

/**
 * 设置当前活跃的所有权节点。
 */
export function setOwner(owner: Owner | null): Owner | null {
  const prev = ownerCore.current;
  ownerCore.current = owner;
  return prev;
}

/**
 * 创建一个 Owner 节点。
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
 * 在指定 Owner 作用域下执行函数。
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
 * 在当前作用域内登记一个清理函数。
 */
export function onCleanup(fn: Disposable): void {
  const owner = getOwner();
  if (owner) {
    if (owner.disposables === null) owner.disposables = [fn];
    else owner.disposables.push(fn);
  }
}

/**
 * 执行并清空当前 Owner 的所有清理函数及子节点。
 * @param owner 目标节点
 * @param selfDispose 是否同时标记自身为已销毁 (默认 false，仅清理子项)
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
 * 将子 Owner 登记到父 Owner。
 */
export function adoptChild(parent: Owner, child: Owner): void {
  if (parent.children === null) parent.children = [child];
  else if (!parent.children.includes(child)) parent.children.push(child);
}

/**
 * 创建一个根所有权节点。
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const root = createOwner();
  return runWithOwner(root, () => fn(() => cleanNode(root, true)));
}

/**
 * 在当前作用域内登记一个错误处理器。
 */
export function onError(fn: (err: unknown) => void): void {
  const owner = getOwner();
  if (owner) {
    if (!owner.errorHandlers) owner.errorHandlers = [fn];
    else owner.errorHandlers.push(fn);
  }
}

/**
 * 冒泡并处理错误。
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
