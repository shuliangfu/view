/**
 * @fileoverview build.jsx：compiler（compileSource 插件）与 runtime（仅 esbuild JSX）切换
 */

import {
  deleteEnv,
  dirname,
  fromFileUrl,
  join,
  setEnv,
} from "@dreamer/runtime-adapter";
import { describe, expect, it } from "@dreamer/test";
import { toClientConfig } from "../../src/server/core/build.ts";
import { getBuildConfigForMode } from "../../src/server/core/config.ts";

describe("toClientConfig build.jsx", () => {
  /** 包根目录：本文件位于 view/tests/unit */
  const pkgRoot = join(dirname(fromFileUrl(import.meta.url)), "..", "..");
  /** 与 examples 对齐的相对入口/输出 */
  const entry = "examples/src/main.tsx";
  const outDir = "examples/dist";
  const outFile = "main.js";

  /**
   * 从 ClientConfig.plugins 中判断是否注册了 view-root-compile。
   *
   * @param plugins - esbuild 插件列表
   */
  function hasViewRootCompile(
    plugins: ReadonlyArray<{ name?: string }> | undefined,
  ): boolean {
    return (
      plugins?.some((p) =>
        p && typeof p.name === "string" && p.name === "view-root-compile"
      ) ??
        false
    );
  }

  it("jsx 为 compiler 或未设时应包含 view-root-compile 插件", () => {
    const withExplicit = toClientConfig(
      pkgRoot,
      entry,
      outDir,
      outFile,
      { jsx: "compiler", plugins: [] },
      { forProduction: false },
    );
    expect(hasViewRootCompile(withExplicit.plugins)).toBe(true);

    const implicit = toClientConfig(
      pkgRoot,
      entry,
      outDir,
      outFile,
      { plugins: [] },
      { forProduction: false },
    );
    expect(hasViewRootCompile(implicit.plugins)).toBe(true);
  });

  it("jsx 为 runtime 时不应注册 view-root-compile 插件", () => {
    const cfg = toClientConfig(
      pkgRoot,
      entry,
      outDir,
      outFile,
      { jsx: "runtime", plugins: [] },
      { forProduction: false },
    );
    expect(hasViewRootCompile(cfg.plugins)).toBe(false);
  });

  it("生产模式 runtime 时仍可有 optimize 插件且无 view-root-compile", () => {
    const cfg = toClientConfig(
      pkgRoot,
      entry,
      outDir,
      outFile,
      { jsx: "runtime", plugins: [], optimize: true },
      { forProduction: true },
    );
    expect(hasViewRootCompile(cfg.plugins)).toBe(false);
    const names = (cfg.plugins ?? []).map((p) => p.name);
    expect(names.includes("view-optimize")).toBe(true);
  });
});

describe("getBuildConfigForMode 与 VIEW_FORCE_BUILD_JSX", () => {
  it("环境变量为 compiler 时应覆盖 view.config 中的 jsx: runtime", () => {
    setEnv("VIEW_FORCE_BUILD_JSX", "compiler");
    try {
      const dev = getBuildConfigForMode({ build: { jsx: "runtime" } }, "dev");
      expect(dev.jsx).toBe("compiler");
    } finally {
      deleteEnv("VIEW_FORCE_BUILD_JSX");
    }
  });
});
