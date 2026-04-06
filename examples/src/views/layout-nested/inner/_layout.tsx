/**
 * 多层 layout 演示 — 第二层（layout-nested/inner 目录）
 *
 * 包在第一层 layout-nested/_layout 之内，再包页面内容。
 */

export default function LayoutNestedInner(props: {
  children: any;
  params: Record<string, string>;
  query: Record<string, string>;
}) {
  return (
    <div
      className="rounded-xl border-2 border-dashed border-sky-500/70 bg-sky-50/50 p-5 dark:border-sky-400/50 dark:bg-sky-950/25"
      data-demo-layout="layout-nested-inner"
    >
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">
        第二层嵌套：views/layout-nested/inner/_layout.tsx
      </p>
      <div className="min-h-[80px]">{props.children}</div>
    </div>
  );
}
