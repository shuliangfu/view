/**
 * SSR request cookies are exposed as document.cookie during renderToString.
 */
import { describe, expect, it } from "@dreamer/test";
import {
  renderToString,
  runWithSsrCookies,
} from "../../../src/runtime/server.ts";

describe("runWithSsrCookies", () => {
  it("seeds document.cookie for renderToString", () => {
    const html = runWithSsrCookies(
      "theme=dark; rbac-menus-top-hint=1",
      () =>
        renderToString(() => {
          const cookie =
            (globalThis as { document?: { cookie?: string } }).document
              ?.cookie ?? "";
          return cookie;
        }),
    );
    expect(html).toContain("theme=dark");
    expect(html).toContain("rbac-menus-top-hint=1");
  });

  it("does not leak cookies outside the run", () => {
    runWithSsrCookies(
      "keep=1",
      () =>
        renderToString(() =>
          (globalThis as { document?: { cookie?: string } }).document?.cookie ??
            ""
        ),
    );
    expect(getCookieOutside()).toBe("");
  });
});

function getCookieOutside(): string {
  try {
    return (globalThis as { document?: { cookie?: string } }).document
      ?.cookie ?? "";
  } catch {
    return "";
  }
}
