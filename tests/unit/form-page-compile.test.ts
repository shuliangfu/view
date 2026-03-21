/**
 * 回归：examples form 页经 compileSource 后须产出真实 DOM 结构（含 form 与 insertReactive 子槽），
 * 避免自定义组件 children 未挂或编译退回原始 JSX 导致白屏。
 *
 * 读源码使用 @dreamer/runtime-adapter，兼容 Deno / Bun（禁止直接使用 Deno.readTextFile）。
 */

import { fromFileUrl, readTextFile } from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";
import { compileSource } from "@dreamer/view/jsx-compiler";

/** form 示例页源码路径（相对本测试文件） */
const FORM_PAGE_FILE_URL = new URL(
  "../../examples/src/views/form/index.tsx",
  import.meta.url,
);

describe("form 示例页 compileSource", () => {
  it('应含 createElement("form")、Form( 调用，且不把 <Form 留在产物中', async () => {
    const source = await readTextFile(fromFileUrl(FORM_PAGE_FILE_URL));
    const out = compileSource(source, "form.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toContain('createElement("form")');
    expect(out).toContain("Form(");
    expect(out).not.toMatch(/<\s*Form\b/);
    expect(out).toMatch(/insertReactive\([\s\S]*props\.children/);
  });

  /**
   * PasswordInput 内为 value={props.value}（PropertyAccess），须走 createEffect；
   * 非函数字段须 `unwrapSignalGetterValue(props.value)` 以支持 `SignalRef`，不得 setAttribute 把对象字符串化。
   */
  it("PasswordInput 的 input value 应对 props.value 生成 effect 而非 setAttribute 字符串化函数", async () => {
    const source = await readTextFile(fromFileUrl(FORM_PAGE_FILE_URL));
    const out = compileSource(source, "form.tsx", {
      insertImportPath: "@dreamer/view",
    });
    expect(out).toMatch(
      /typeof\s+props\.value\s*===\s*["']function["']\s*\?\s*props\.value\(\)\s*:\s*unwrapSignalGetterValue\s*\(\s*props\.value\s*\)/,
    );
    expect(out).not.toMatch(/setAttribute\([^)]*value[^)]*props\.value/);
  });
});
