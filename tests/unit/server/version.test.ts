/**
 * @fileoverview `version.ts` 中可单测的纯函数与包根解析。
 */
import { describe, expect, it } from "@dreamer/test";
import { join } from "@dreamer/runtime-adapter";
import {
  compareVersions,
  FALLBACK_PLUGINS_VERSION,
  FALLBACK_VIEW_VERSION,
  fromFileUrl as viewFromFileUrl,
  getPackageRoot,
  pickNewer,
  VIEW_VERSION,
} from "../../../src/server/utils/version.ts";

describe("server/utils/version", () => {
  it("fromFileUrl：file URL 应解码为本地路径", () => {
    const url = "file:///tmp/a%20b/view.ts";
    const p = viewFromFileUrl(url);
    expect(p).toContain("a b");
  });

  it("getPackageRoot：应指向 view 包根（含 deno.json）", () => {
    const root = getPackageRoot();
    expect(root).toContain("view");
    const denoJson = join(root, "deno.json");
    expect(denoJson.length).toBeGreaterThan(10);
  });

  it("VIEW_VERSION：应为非空 semver 风格字符串", () => {
    expect(typeof VIEW_VERSION).toBe("string");
    expect(VIEW_VERSION.length).toBeGreaterThan(0);
    expect(VIEW_VERSION).not.toBe(FALLBACK_VIEW_VERSION);
  });

  it("compareVersions：应按 major.minor.patch 比较", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("compareVersions：稳定版应大于同号 prerelease", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
  });

  it("pickNewer：应返回 semver 较新者", () => {
    expect(pickNewer("1.0.0", "1.1.0")).toBe("1.1.0");
    expect(pickNewer("2.0.0", null)).toBe("2.0.0");
    expect(pickNewer(null, "0.1.0")).toBe("0.1.0");
  });

  it("FALLBACK 常量应为默认占位版本", () => {
    expect(FALLBACK_VIEW_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(FALLBACK_PLUGINS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
