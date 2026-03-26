/**
 * 从源码顶层 `import` 解析 `@dreamer/view/boundary` 中 Suspense / ErrorBoundary 等绑定名，
 * 供 {@link compileSource} 决定对应 JSX 标签的 children 是否编译为 slot getter。
 *
 * @internal 仅由 `transform.ts` 使用；稳定 API 仍以 `@dreamer/view/jsx-compiler` 为准。
 */

import ts from "typescript";

/**
 * 从 `@dreamer/view/boundary` 等路径引入时的**默认**导出名：compileSource 会按 import 解析本地绑定，自动用 `() => slot` 形态传 children（省写 `vSlotGetter`）。
 * 用户自己的组件不要改这里：在 JSX 上写 **`vSlotGetter`**（或 `v-slot-getter`）即可，无需改编译器。
 * 若框架在 boundary 包新增同类组件，可在此加导出名以便与 Suspense/ErrorBoundary 一样零属性开箱。
 */
const SLOT_GETTER_EXPORTS_FROM_BOUNDARY_MODULE: ReadonlySet<string> = new Set([
  "Suspense",
  "ErrorBoundary",
]);

/**
 * 判断模块说明符是否指向 view 的 boundary 入口（支持 jsr:、相对路径等）。
 *
 * @param moduleSpecifier - import from 的字符串字面量文本
 */
function isViewBoundaryModuleSpecifier(moduleSpecifier: string): boolean {
  return (
    moduleSpecifier === "@dreamer/view/boundary" ||
    moduleSpecifier.includes("@dreamer/view/boundary") ||
    /(^|\/)view\/boundary(\.ts)?$/.test(moduleSpecifier) ||
    moduleSpecifier.endsWith("/boundary") ||
    moduleSpecifier.endsWith("/boundary.ts")
  );
}

/**
 * 扫描源文件顶层的 `import { … } from "…boundary…"`，收集应使用 slot-getter children 形态的**本地绑定名**（含 `Suspense as S` 的 `S`）。
 *
 * @param sf - 当前编译的源文件
 * @returns 本地标识符集合；无匹配 import 时为空集（调用方再决定是否回退启发式）
 */
export function collectSlotGetterTagLocalsFromImports(
  sf: ts.SourceFile,
): Set<string> {
  const out = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const ms = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(ms)) continue;
    if (!isViewBoundaryModuleSpecifier(ms.text)) continue;
    const clause = stmt.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      continue;
    }
    for (const el of clause.namedBindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (SLOT_GETTER_EXPORTS_FROM_BOUNDARY_MODULE.has(imported)) {
        out.add(el.name.text);
      }
    }
  }
  return out;
}
