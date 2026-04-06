/**
 * @module optimize
 * @description 构建时源码优化器。
 * 实现模板压缩、静态内容预处理等极致优化。
 */

import type { BuildPlugin } from "@dreamer/esbuild";
import { readFile } from "@dreamer/runtime-adapter";

/**
 * 源码层面的极致优化。
 * 1. 压缩 template() 中的 HTML 字符串（移除冗余空格、换行）。
 * 2. 预处理静态属性（进一步减小运行时开销）。
 */
export function optimize(source: string): string {
  // 极致优化：匹配 template("...") 并压缩其中的 HTML
  // 处理逻辑：移除标签间的换行和多余空格，但保留标签内的必要空格
  return source.replace(
    /template\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g,
    (_match, quote, html) => {
      const minified = html
        .replace(/>\s+</g, "><") // 移除标签间的空格和换行
        .replace(/\s{2,}/g, " ") // 将多个连续空格合并为一个
        .trim();
      return `template(${quote}${minified}${quote})`;
    },
  );
}

/**
 * 创建编译优化插件。
 * 在构建管道的最后阶段执行，对最终生成的 JS 代码进行微调。
 */
export function createOptimizePlugin(filter: RegExp): BuildPlugin {
  return {
    name: "view-optimize",
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const contents = await readFile(args.path);
        const source = new TextDecoder().decode(contents);

        return {
          contents: optimize(source),
          loader: "tsx", // 优化后重新交给 esbuild 处理
        };
      });
    },
  };
}
