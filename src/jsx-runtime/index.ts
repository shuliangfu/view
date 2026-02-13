/**
 * @module @dreamer/view/jsx-runtime (directory entry)
 * @description
 * 目录入口，供编译器在解析 jsxImportSource + "/jsx-runtime" 时使用。
 * JSR 发布时模块图构建会请求 .../src/jsx-runtime（无扩展名），
 * 通过本 index 可解析到实际实现 ../jsx-runtime.ts。
 */
export {
  Fragment,
  jsx,
  jsxs,
} from "../jsx-runtime.ts";
