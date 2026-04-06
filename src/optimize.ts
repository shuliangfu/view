/**
 * @module optimize
 * @description 构建时源码优化器。
 * 实现模板压缩、静态内容预处理等极致优化。
 */

import type { BuildPlugin } from "@dreamer/esbuild";
import { readFile } from "@dreamer/runtime-adapter";

/**
 * 对源码做轻量字符串级优化：压缩 `template("...")` 内 HTML 空白。
 * @param source 构建产物或源文件文本
 * @returns 替换后的源码
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
 * 返回可在 esbuild 等流水线中注册的插件：对匹配 `filter` 的文件读入后执行 {@link optimize}。
 * @param filter 文件路径正则（如 `/\.tsx?$/`）
 * @returns {@link BuildPlugin}
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
