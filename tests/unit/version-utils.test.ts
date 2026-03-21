/**
 * @fileoverview server/utils/version：fromFileUrl、compareVersions、pickNewer（无网络）。
 */

import { describe, expect, it } from "@dreamer/test";
import {
  compareVersions,
  FALLBACK_VIEW_VERSION,
  fromFileUrl,
  getPackageRoot,
  pickNewer,
  VIEW_VERSION,
} from "../../src/server/utils/version.ts";

describe("fromFileUrl", () => {
  it("file: URL 应去掉协议并解码路径", () => {
    const p = fromFileUrl("file:///tmp/x/y");
    expect(p).toContain("tmp");
    expect(p).toContain("x");
    expect(p).toContain("y");
    expect(p.startsWith("file:")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("主版本大者应更大", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
  });

  it("相等应返回 0", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("v 前缀应被规范化", () => {
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
  });
});

describe("pickNewer", () => {
  it("应返回 semver 较新版本", () => {
    expect(pickNewer("1.0.0", "2.0.0")).toBe("2.0.0");
    expect(pickNewer("2.0.0", "1.0.0")).toBe("2.0.0");
  });

  it("一侧为 null 应返回另一侧", () => {
    expect(pickNewer(null, "1.0.0")).toBe("1.0.0");
    expect(pickNewer("1.0.0", null)).toBe("1.0.0");
  });
});

describe("getPackageRoot / VIEW_VERSION", () => {
  it("getPackageRoot 应指向含 deno.json 的 view 包根", async () => {
    const { join, exists } = await import("@dreamer/runtime-adapter");
    const root = getPackageRoot();
    expect(await exists(join(root, "deno.json"))).toBe(true);
  });

  it("VIEW_VERSION 应为非空字符串", () => {
    expect(typeof VIEW_VERSION).toBe("string");
    expect(VIEW_VERSION.length).toBeGreaterThan(0);
    expect(FALLBACK_VIEW_VERSION).toBe("1.0.0");
  });
});
