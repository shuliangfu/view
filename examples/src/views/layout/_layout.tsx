/**
 * layout 目录下的 _layout.tsx：用于测试嵌套布局
 *
 * 访问 /layout 时，本布局会包裹该目录下的页面（如 layout/index.tsx），
 * 与根 _layout 形成嵌套。设为 true 时继承根布局（顶栏）；设为 false 时不继承父级。
 */

import type { VNode } from "@dreamer/view";

interface LayoutProps {
  children: VNode;
}

/** true：继承根 _layout（顶栏）；false：不继承，仅本目录布局 */
// export const inheritLayout = false;

/** 本目录布局：虚线框 + 提示文案，便于确认 _layout 是否生效 */
export default function Layout(props: LayoutProps): VNode {
  return (
    <div className="rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
        layout 目录 _layout 包裹
      </p>
      {props.children}
    </div>
  );
}
