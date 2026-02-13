/**
 * JSX 运行时子路径入口：供编译器请求 view-jsx-internal/jsx-runtime 时解析。
 * JSR 发布时会把 jsxImportSource 解析为目录再拼上 /jsx-runtime，得到 .../jsx-runtime/jsx-runtime，
 * 本文件保证该路径对应到实际实现 ../jsx-runtime.ts。
 */
export { Fragment, jsx, jsxs } from "../jsx-runtime.ts";
