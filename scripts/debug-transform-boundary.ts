/**
 * 调试 boundary：对 compileSource 内部的 transform 单独跑并打印异常栈。
 */
import ts from "typescript";
import { cwd, join, readTextFile } from "@dreamer/runtime-adapter";

const filePath = join(cwd(), "examples/src/views/boundary/index.tsx");
const source = await readTextFile(filePath);
const sourceFile = ts.createSourceFile(
  filePath,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

// 仅触发 visitEachChild，不做我们的 JSX 替换，看是否 baseline 就炸
try {
  const noop = ts.transform(sourceFile, [
    (context) => {
      return (sf: ts.SourceFile) =>
        ts.visitNode(
          sf,
          (node) => ts.visitEachChild(node, (n) => n, context),
        ) as ts.SourceFile;
    },
  ]);
  noop.dispose();
  console.log("noop transform ok");
} catch (e) {
  console.error("noop transform fail", e);
}

// 动态 import 与 compileSource 相同的 visitor 太啰嗦，直接 import compileSource 并临时 monkey patch 不行。
// 从 transform 文件复制最小 visit：只 visitEachChild 不替换
console.log("done");
