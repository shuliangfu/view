/**
 * @module runtime/hmr
 * @description 热模块替换 (HMR) 运行时支持。
 *
 * **支持的功能：**
 * - ✅ HMR 信号管理
 * - ✅ 组件热更新代理
 * - ✅ 状态保持 (更新时不丢失组件状态)
 * - ✅ 开发环境的热重载机制
 *
 * **核心机制：**
 * - 使用 Signal 追踪组件更新
 * - 组件级别代理函数
 * - 注册表 (COMPONENT_REGISTRY) 管理
 * - 渲染效果 (createRenderEffect) 集成
 *
 * **范围说明：**
 * - 与具体打包器的契约由 `view` CLI/插件维护；生产构建应通过摇树剔除 HMR 入口。
 *
 * @usage
 * // 主要由构建工具在开发环境中使用
 * const HotComponent = withHMR("component-id", OriginalComponent)
 */

import { createRenderEffect } from "../reactivity/effect.ts";
import { getInternal } from "../reactivity/master.ts";
import {
  cleanNode,
  getOwner,
  Owner,
  runWithOwner,
} from "../reactivity/owner.ts";
import { createSignal, Signal } from "../reactivity/signal.ts";
import { insert } from "./insert.ts";

type ComponentFn = (props: Record<string, unknown>) => any;

/** 存储组件代理注册信息 */
const COMPONENT_REGISTRY = new Map<string, {
  compSignal: Signal<ComponentFn>;
  proxyFn: (props: Record<string, unknown>) => Node;
}>();

/**
 * 开发态下用信号包裹组件实现热替换；生产环境或未开 `VIEW_DEV` 时原样返回 `Component`。
 * @param id 稳定组件 id（与编译器注入一致）
 * @param Component 原始组件函数
 * @returns 可替换实现的代理组件
 */
export function createHMRProxy(
  id: string,
  Component: ComponentFn,
): ComponentFn {
  // 生产环境安全检测
  if (!(globalThis as any).VIEW_DEV) {
    return Component;
  }

  const registry = COMPONENT_REGISTRY.get(id);

  if (registry) {
    // 【代码热替换】直接更新组件函数，触发所有实例的局部重绘
    // 注意：信号存储的是函数，为了防止被识别为 functional update，需要包装一层
    registry.compSignal.set(() => Component);
    return registry.proxyFn;
  }

  // 第一次加载组件
  // 关键：给 HMR 内部信号一个固定前缀名，避免与组件内部 reset 后的 UID 冲突
  const compSignal = createSignal(Component, `hmr:${id}`) as any as Signal<
    ComponentFn
  >;

  const proxyFn = (props: Record<string, unknown>) => {
    const parentOwner = getOwner();
    const marker = document.createTextNode("");
    const fragment = document.createDocumentFragment();
    fragment.appendChild(marker);

    let currentOwner: Owner | null = null;
    let current: any = undefined;

    // 局部重绘任务
    const render = () => {
      const parent = marker.parentNode || fragment;

      // 1. 销毁旧版本产生的所有 Effect
      if (currentOwner) {
        cleanNode(currentOwner);
      }

      // 2. 在全新的子作用域中执行新代码
      currentOwner = {
        owner: parentOwner,
        disposables: null,
        children: null,
      };

      runWithOwner(currentOwner, () => {
        // 在 HMR 重绘前重置信号 UID，确保新旧版本的信号 ID 能够匹配并复用状态
        const core = getInternal("core", () => ({} as any));
        core.uid = 0;

        const Comp = compSignal();
        const content = Comp(props);

        // 3. 使用 insert 管理更新，它会自动处理旧节点的移除或替换
        current = insert(parent, content, current, marker);
      });
    };

    // 初始化渲染，并建立对代码信号的订阅
    createRenderEffect(render);

    return fragment;
  };

  const newRegistry = { compSignal, proxyFn };
  COMPONENT_REGISTRY.set(id, newRegistry);

  return proxyFn;
}
