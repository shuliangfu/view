/**
 * @fileoverview @dreamer/view/compiled 与 @dreamer/view/compiler 核心导出应对齐，防漂移。
 */

import "../dom-setup.ts";
import { describe, expect, it } from "@dreamer/test";
import {
  createRoot as crCompiled,
  insert as insertCompiled,
} from "@dreamer/view/compiled";
import {
  createRoot as crCompiler,
  insert as insertCompiler,
} from "@dreamer/view/compiler";

describe("@dreamer/view/compiled 契约", () => {
  it("compiled 与 compiler 的 insert/createRoot 行为应一致（不同 import 路径可能非同一引用）", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    crCompiler((el) => {
      insertCompiler(el, "a");
    }, a);
    crCompiled((el) => {
      insertCompiled(el, "a");
    }, b);
    expect(a.textContent).toBe("a");
    expect(b.textContent).toBe("a");
  });

  it("compiled 入口应能 createRoot + insert 挂载静态文本", () => {
    const div = document.createElement("div");
    crCompiled((el) => {
      insertCompiled(el, "compiled-ok");
    }, div);
    expect(div.textContent).toBe("compiled-ok");
  });
}, { sanitizeOps: false, sanitizeResources: false });
