/**
 * 不继承祖先布局的演示用 _layout
 *
 * 源码约定（扫描见 view/src/server/core/layout.ts）：
 * - 在本文件导出 `export const inheritLayout = false` 时，codegen 在计算该目录及子路由的
 *   layouts 链时会 **清空此前累积的祖先 _layout**，并 **只保留当前文件** 这一层。
 * - 因此本路由 **不会** 再套上 views/_layout.tsx（无全局顶栏），也 **不会** 套上
 *   layout-nested/_layout.tsx（无琥珀色外层）。
 *
 * 另：若要在「保留子目录 _layout」的前提下 **仅去掉根布局**，可在 **页面** 上导出
 * `inheritLayout = false`（由 readInheritLayoutFromPageFile 处理，见 routers.ts）。
 */

/** 设为 false：不叠祖先 _layout，本文件即为整页唯一 layout */
export const inheritLayout = false;

/**
 * 独立壳层：自带简单顶栏，便于从无全局导航的页面返回站内
 */
export default function LayoutStandaloneShell(props: {
  children: any;
  params: Record<string, string>;
  query: Record<string, string>;
}) {
  return (
    <div
      className="min-h-screen bg-violet-50 text-slate-900 dark:bg-violet-950/40 dark:text-slate-100"
      data-demo-layout="layout-standalone-no-inherit"
    >
      <header className="border-b border-violet-200/80 bg-white/90 px-4 py-3 dark:border-violet-800/60 dark:bg-violet-950/80">
        <p className="text-xs font-black uppercase tracking-widest text-violet-600 dark:text-violet-300">
          不继承根布局 ·
          views/layout-nested/standalone/_layout.tsx（inheritLayout = false）
        </p>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{props.children}</main>
    </div>
  );
}
