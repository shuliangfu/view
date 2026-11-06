/**
 * HMR DEV banner must be valid classic-script JS (prepended before ESM imports).
 * Guards against illegal forms like `queue function bootOverlay` that blank the app.
 */
import { describe, expect, it } from "@dreamer/test";
import { getHmrBanner } from "../../../src/server/core/build.ts";

describe("getHmrBanner (DEV DevTools auto-mount)", () => {
  const banner = getHmrBanner({
    rootNotFound: "root",
    containerEmpty: "empty",
    refreshFailed: "fail",
  });

  it("sets VIEW_DEV and schedules bootOverlay without illegal `queue function`", () => {
    expect(banner.includes("VIEW_DEV = true")).toBe(true);
    expect(banner.includes("queue function")).toBe(false);
    expect(banner.includes("void function bootOverlay")).toBe(false);
    expect(/\bfunction bootOverlay\s*\(/.test(banner)).toBe(true);
    expect(banner.includes("queueMicrotask(bootOverlay)")).toBe(true);
  });

  it("parses as a classic script (new Function)", () => {
    expect(() => {
      // Banner is an IIFE; must not throw SyntaxError.
      new Function(banner);
    }).not.toThrow();
  });
});
