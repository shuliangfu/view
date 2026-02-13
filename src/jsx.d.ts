/**
 * JSX 固有元素类型：供本包内 TSX（如 route-page.tsx）类型检查使用。
 * 仅用于开发与测试；JSR 发布时通过 deno.json exclude 排除，避免 "modifying global types" 报错。
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: string]: Record<string, unknown>;
    }
  }
}

export {};
