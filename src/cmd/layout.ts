/**
 * 布局链与 inheritLayout 解析（供路由表 codegen 使用）
 *
 * 负责：从 _layout.tsx 链计算是否继承父级布局、从页面文件读取 export inheritLayout。
 * 通过动态 import 文件拿到导出值，被 routers.ts 调用。
 */

import { existsSync, join, pathToFileUrl } from "@dreamer/runtime-adapter";

/**
 * 从 _layout 文件路径动态 import，读取 inheritLayout 导出（未导出或非 false 视为继承）
 */
export async function readInheritLayoutFromLayoutFile(
  layoutPath: string,
): Promise<boolean> {
  const mod = await import(pathToFileUrl(layoutPath));
  return (mod as { inheritLayout?: boolean }).inheritLayout !== false;
}

/**
 * 从页面文件路径动态 import，读取 inheritLayout 导出；未导出则返回 undefined，由 layout 链决定
 */
export async function readInheritLayoutFromPageFile(
  pagePath: string,
): Promise<boolean | undefined> {
  const mod = await import(pathToFileUrl(pagePath));
  const v = (mod as { inheritLayout?: boolean }).inheritLayout;
  return typeof v === "boolean" ? v : undefined;
}

export interface LayoutChainResult {
  /** 是否继承父级 Layout（根 _layout） */
  inheritLayout: boolean;
  /** 从根到子的 _layout import 路径，供生成 layouts: [ () => import(...), ... ] */
  layoutImportPaths: string[];
}

/**
 * 根据路由文件所在相对目录，从根到该目录收集 _layout.tsx 链，并解析 inheritLayout
 * @param viewsDirAbs views 目录绝对路径
 * @param relativeDir 路由文件所在目录相对 views 的路径，如 ""、"dashboard"、"dashboard/settings"
 * @returns inheritLayout（是否继承父级 Layout）、layoutImportPaths（从根到子的 import 路径，含根）
 */
export async function computeLayoutChain(
  viewsDirAbs: string,
  relativeDir: string,
): Promise<LayoutChainResult> {
  const parts = relativeDir ? relativeDir.replace(/\\/g, "/").split("/") : [];
  const ancestors: string[] = [""];
  for (let i = 0; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i + 1).join("/"));
  }
  let inheritLayout = true;
  const layoutImportPaths: string[] = [];
  for (const dir of ancestors) {
    const layoutPath = join(viewsDirAbs, dir, "_layout.tsx");
    if (!existsSync(layoutPath)) continue;
    const importPath = [
      "..",
      "views",
      dir ? dir + "/_layout.tsx" : "_layout.tsx",
    ]
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/");
    try {
      const inherit = await readInheritLayoutFromLayoutFile(layoutPath);
      if (!inherit) {
        layoutImportPaths.length = 0;
        layoutImportPaths.push(importPath);
        inheritLayout = false;
      } else {
        layoutImportPaths.push(importPath);
      }
    } catch {
      layoutImportPaths.push(importPath);
    }
  }
  return { inheritLayout, layoutImportPaths };
}
