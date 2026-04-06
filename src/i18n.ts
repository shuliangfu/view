/**
 * @module i18n
 * @description @dreamer/view 框架内置国际化模块。
 */

import { createI18n, type I18n, type TranslationData } from "@dreamer/i18n";
import { getEnv } from "@dreamer/runtime-adapter";

// 静态导入语言文件（构建时内联）
import zhCN from "./locales/zh-CN.json" with { type: "json" };
import zhTW from "./locales/zh-TW.json" with { type: "json" };
import enUS from "./locales/en-US.json" with { type: "json" };
import jaJP from "./locales/ja-JP.json" with { type: "json" };
import koKR from "./locales/ko-KR.json" with { type: "json" };
import ptBR from "./locales/pt-BR.json" with { type: "json" };
import idID from "./locales/id-ID.json" with { type: "json" };
import frFR from "./locales/fr-FR.json" with { type: "json" };
import deDE from "./locales/de-DE.json" with { type: "json" };
import esES from "./locales/es-ES.json" with { type: "json" };

/** 模块作用域的 i18n 实例 */
let viewI18n: I18n | null = null;

const SUPPORTED_LOCALES = [
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
  "pt-BR",
  "id-ID",
  "fr-FR",
  "de-DE",
  "es-ES",
] as const;

const DEFAULT_LOCALE = "en-US";

const LOCALE_DATA: Record<string, TranslationData> = {
  "zh-CN": zhCN as TranslationData,
  "zh-TW": zhTW as TranslationData,
  "en-US": enUS as TranslationData,
  "ja-JP": jaJP as TranslationData,
  "ko-KR": koKR as TranslationData,
  "pt-BR": ptBR as TranslationData,
  "id-ID": idID as TranslationData,
  "fr-FR": frFR as TranslationData,
  "de-DE": deDE as TranslationData,
  "es-ES": esES as TranslationData,
};

/**
 * 检测当前环境语言。
 */
export function detectLocale(): string {
  const langEnv = getEnv("LANGUAGE") || getEnv("LC_ALL") || getEnv("LANG");
  if (!langEnv) return DEFAULT_LOCALE;

  const first = langEnv.split(/[:\s]/)[0]?.trim();
  if (!first) return DEFAULT_LOCALE;

  // 解析 zh_CN.UTF-8 等格式
  const match = first.match(/^([a-z]{2})[-_]([A-Z]{2})/i);
  if (match) {
    const normalized = `${match[1].toLowerCase()}-${match[2].toUpperCase()}`;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(normalized)) {
      return normalized;
    }
  }

  const primary = first.substring(0, 2).toLowerCase();
  if (primary === "zh") return "zh-CN";
  if (primary === "en") return "en-US";

  return DEFAULT_LOCALE;
}

/**
 * 初始化框架 i18n。
 */
function initViewI18n(): void {
  if (viewI18n) return;
  const i18n = createI18n({
    defaultLocale: DEFAULT_LOCALE,
    fallbackBehavior: "default",
    locales: [...SUPPORTED_LOCALES],
    translations: LOCALE_DATA,
  });
  i18n.setLocale(detectLocale());
  viewI18n = i18n;
}

initViewI18n();

/**
 * 翻译函数。
 */
export function $tr(
  key: string,
  params?: Record<string, string | number | boolean>,
): string {
  if (!viewI18n) initViewI18n();
  // @ts-ignore: Internal I18n instance params compatibility
  return viewI18n!.t(key, params);
}

/**
 * 设置当前框架语言。
 */
export function setViewLocale(locale: string) {
  if (!viewI18n) initViewI18n();
  if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    viewI18n!.setLocale(locale);
  }
}

/**
 * 规范化语言代码为 Locale。
 */
export function normalizeLanguageToLocale(lang: string): string {
  const l = lang.toLowerCase().replace("_", "-");

  // 1. 精确匹配繁体中文
  if (l === "zh-tw" || l === "zh-hk" || l === "zh-mo" || l.includes("hant")) {
    return "zh-TW";
  }

  // 2. 匹配简体中文
  if (l.startsWith("zh")) {
    return "zh-CN";
  }

  // 3. 匹配英文
  if (l.startsWith("en")) {
    return "en-US";
  }

  return lang;
}
