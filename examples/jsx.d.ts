/**
 * JSX 固有元素类型：供 examples 内 TSX 类型检查使用。
 * 与包根 jsx.d.ts 内容一致，避免 examples 单独打开时因根 deno.json 排除而无法解析。
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: string]: Record<string, unknown>;
    }
  }
}

export {};
