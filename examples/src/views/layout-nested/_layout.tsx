/**
 * 多层 layout 演示 — 第一层（相对 views 根下的 layout-nested）
 *
 * 路由扫描会把祖先目录上的 _layout.tsx 串成 layouts 数组；
 * 本页最终顺序：根 _layout → 本文件 → inner/_layout → 页面。
 */

/**
 * 与根布局一致：继续包在全局 Navbar 之内（inheritLayout 默认继承）
 */
export default function LayoutNestedOuter(props: {
  children: any;
  params: Record<string, string>;
  query: Record<string, string>;
}) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-amber-400/80 bg-amber-50/40 p-6 dark:border-amber-500/50 dark:bg-amber-950/20"
      data-demo-layout="layout-nested-outer"
    >
      <p className="mb-4 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
        第一层嵌套：views/layout-nested/_layout.tsx
      </p>
      <div className="min-h-[120px]">{props.children}</div>
    </div>
  );
}
