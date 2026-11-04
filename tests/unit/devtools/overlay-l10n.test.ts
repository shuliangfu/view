/**
 * Browser-safe overlay l10n: follows page lang; never pulls node i18n.
 */
import { describe, expect, it } from "@dreamer/test";
import { resetRegistry } from "../dom-setup.ts";
import {
  getOverlayLocale,
  ot,
  resolveOverlayLocale,
  syncOverlayLocaleFromPage,
} from "../../../src/devtools/overlay-l10n.ts";

describe("overlay-l10n (browser-safe)", () => {
  // ensure happy-dom document via dom-setup side effects
  resetRegistry();
  it("resolveOverlayLocale maps zh* → zh, else en", () => {
    expect(resolveOverlayLocale("zh-CN")).toBe("zh");
    expect(resolveOverlayLocale("zh-TW")).toBe("zh");
    expect(resolveOverlayLocale("zh")).toBe("zh");
    expect(resolveOverlayLocale("en-US")).toBe("en");
    expect(resolveOverlayLocale("fr-FR")).toBe("en");
    expect(resolveOverlayLocale("")).toBe("en");
  });

  it("ot returns zh/en packs after syncOverlayLocaleFromPage", () => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = "zh-CN";
    expect(syncOverlayLocaleFromPage()).toBe("zh");
    expect(getOverlayLocale()).toBe("zh");
    expect(ot("title")).toContain("开发工具");
    document.documentElement.lang = "en-US";
    expect(syncOverlayLocaleFromPage()).toBe("en");
    expect(ot("title")).toContain("View DevTools");
    expect(ot("hmrStatus", { status: ot("hmrConnected") })).toContain(
      "Connected",
    );
    document.documentElement.lang = prev;
  });
});
