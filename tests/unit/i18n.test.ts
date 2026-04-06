/**
 * @fileoverview 框架内置 i18n：`normalizeLanguageToLocale`、`setViewLocale`、`$tr`。
 */
import { describe, expect, it } from "@dreamer/test";
import {
  $tr,
  normalizeLanguageToLocale,
  setViewLocale,
} from "../../src/i18n.ts";

describe("i18n", () => {
  it("normalizeLanguageToLocale：繁体区域应归一到 zh-TW", () => {
    expect(normalizeLanguageToLocale("zh-TW")).toBe("zh-TW");
    expect(normalizeLanguageToLocale("zh-HK")).toBe("zh-TW");
    expect(normalizeLanguageToLocale("zh-hant")).toBe("zh-TW");
  });

  it("normalizeLanguageToLocale：简体与英文前缀", () => {
    expect(normalizeLanguageToLocale("zh_CN")).toBe("zh-CN");
    expect(normalizeLanguageToLocale("en-GB")).toBe("en-US");
  });

  it("normalizeLanguageToLocale：其它语言返回原始 lang 参数", () => {
    expect(normalizeLanguageToLocale("fr")).toBe("fr");
  });

  it("setViewLocale + $tr：切换到 zh-CN 后应返回中文文案", () => {
    setViewLocale("zh-CN");
    const text = $tr("init.template.homeNavTitle");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    setViewLocale("en-US");
  });
});
