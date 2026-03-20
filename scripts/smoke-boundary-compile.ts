/**
 * 一次性冒烟：对 examples boundary 跑 compileSource，确认不再退回原始源码。
 */
import { compileSource } from "../src/jsx-compiler/transform.ts";

import { cwd, join } from "@dreamer/runtime-adapter";
const filePath = join(cwd(), "examples/src/views/boundary/index.tsx");
const source = await Deno.readTextFile(filePath);
const out = compileSource(source, filePath, {
  insertImportPath: "@dreamer/view",
});
// 全量 JSX 可能只生成 insertReactive（如 boundary），不一定出现 insert( 调用
const compiled = out !== source &&
  /\binsert(?:Reactive)?\s*\(/.test(out);
if (!compiled) {
  console.error("boundary compile failed or unchanged");
  Deno.exit(1);
}
console.log("boundary compile ok, out length", out.length);
