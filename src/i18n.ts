/**
 * @module @dreamer/view/i18n
 *
 * @fileoverview view 包 i18n 桥接（仅服务端/CLI）：使用 $tr + 模块实例，不挂全局；供 CLI 输出与服务端抛错使用。
 *
 * 未传 lang 时按环境变量（LANGUAGE / LC_ALL / LANG）检测语言。默认 en-US。
 * 文案来自 `src/server/locales/*.json`（支持 10 种语言，含 zh-TW）。本模块位于 `src/i18n.ts`。
 */

import {
  createI18n,
  type I18n,
  type TranslationData,
  type TranslationParams,
} from "@dreamer/i18n";
import { getEnv } from "@dreamer/runtime-adapter";
import deDE from "./server/locales/de-DE.json" with { type: "json" };
import enUS from "./server/locales/en-US.json" with { type: "json" };
import esES from "./server/locales/es-ES.json" with { type: "json" };
import frFR from "./server/locales/fr-FR.json" with { type: "json" };
import idID from "./server/locales/id-ID.json" with { type: "json" };
import jaJP from "./server/locales/ja-JP.json" with { type: "json" };
import koKR from "./server/locales/ko-KR.json" with { type: "json" };
import ptBR from "./server/locales/pt-BR.json" with { type: "json" };
import zhCN from "./server/locales/zh-CN.json" with { type: "json" };
import zhTW from "./server/locales/zh-TW.json" with { type: "json" };

/** 支持的 locale（含 zh-TW 共 10 种）；英语使用 en-US */
export type Locale =
  | "de-DE"
  | "en-US"
  | "es-ES"
  | "fr-FR"
  | "id-ID"
  | "ja-JP"
  | "ko-KR"
  | "pt-BR"
  | "zh-CN"
  | "zh-TW";

/** 默认语言（与框架统一为 en-US） */
export const DEFAULT_LOCALE: Locale = "en-US";

/** view 包支持的 locale 列表 */
const VIEW_LOCALES: Locale[] = [
  "de-DE",
  "en-US",
  "es-ES",
  "fr-FR",
  "id-ID",
  "ja-JP",
  "ko-KR",
  "pt-BR",
  "zh-CN",
  "zh-TW",
];

const LOCALE_DATA: Record<string, TranslationData> = {
  "de-DE": deDE as TranslationData,
  "en-US": enUS as TranslationData,
  "es-ES": esES as TranslationData,
  "fr-FR": frFR as TranslationData,
  "id-ID": idID as TranslationData,
  "ja-JP": jaJP as TranslationData,
  "ko-KR": koKR as TranslationData,
  "pt-BR": ptBR as TranslationData,
  "zh-CN": zhCN as TranslationData,
  "zh-TW": zhTW as TranslationData,
};

/** init 时创建的 view cmd 实例，不挂全局，$tr 专用 */
let viewI18n: I18n | null = null;

/**
 * 检测当前语言（服务端/CLI）：使用环境变量 LANGUAGE > LC_ALL > LANG。
 * 无法检测或不在支持列表时返回 en-US。
 */
export function detectLocale(): Locale {
  const langEnv = getEnv("LANGUAGE") || getEnv("LC_ALL") || getEnv("LANG");
  if (!langEnv) return DEFAULT_LOCALE;
  const first = langEnv.split(/[:\s]/)[0]?.trim();
  if (!first) return DEFAULT_LOCALE;
  const match = first.match(/^([a-z]{2})[-_]([A-Z]{2})/i);
  if (match) {
    const normalized = `${match[1].toLowerCase()}-${
      match[2].toUpperCase()
    }` as Locale;
    if (VIEW_LOCALES.includes(normalized)) return normalized;
  }
  const primary = first.substring(0, 2).toLowerCase();
  for (const locale of VIEW_LOCALES) {
    if (locale.startsWith(primary + "-") || locale === primary) return locale;
  }
  return DEFAULT_LOCALE;
}

/** 内部初始化，导入 i18n 时自动执行，不导出 */
function initViewI18n(): void {
  if (viewI18n) return;
  const i18n = createI18n({
    defaultLocale: DEFAULT_LOCALE,
    fallbackBehavior: "default",
    locales: [...VIEW_LOCALES],
    translations: LOCALE_DATA as Record<string, TranslationData>,
  });
  i18n.setLocale(detectLocale());
  viewI18n = i18n;
}

initViewI18n();

export function setViewLocale(locale: Locale): void {
  if (!viewI18n) initViewI18n();
  if (!viewI18n) return;
  viewI18n.setLocale(locale);
}

/**
 * 将配置中的 language 字符串规范为 Locale（含 zh-TW 等），不匹配则返回 null
 */
export function normalizeLanguageToLocale(
  lang: string | undefined,
): Locale | null {
  if (!lang || typeof lang !== "string") return null;
  const trimmed = lang.trim();
  const match = trimmed.match(/^([a-z]{2})[-_]([A-Za-z]{2})/i);
  if (match) {
    const normalized = `${match[1].toLowerCase()}-${
      match[2].toUpperCase()
    }` as Locale;
    return VIEW_LOCALES.includes(normalized) ? normalized : null;
  }
  if (VIEW_LOCALES.includes(trimmed as Locale)) return trimmed as Locale;
  const primary = trimmed.substring(0, 2).toLowerCase();
  for (const locale of VIEW_LOCALES) {
    if (locale.startsWith(primary + "-")) return locale;
  }
  return null;
}

/**
 * 根据 key 取翻译文案。未传 lang 时使用当前 locale；传 lang 时临时切换后恢复。未 init 时返回 key。
 *
 * @param key 文案 key，如 "error.ssrDocument"、"error.mountContainerNotFound"
 * @param params 占位替换，如 { selector: "#root" }
 * @param lang 语言，不传则使用当前 locale
 */
export function $tr(
  key: string,
  params?: Record<string, string | number>,
  lang?: Locale,
): string {
  if (!viewI18n) initViewI18n();
  if (!viewI18n) return key;
  if (lang !== undefined) {
    const prev = viewI18n.getLocale();
    viewI18n.setLocale(lang);
    try {
      return viewI18n.t(key, params as TranslationParams);
    } finally {
      viewI18n.setLocale(prev);
    }
  }
  return viewI18n.t(key, params as TranslationParams);
}
