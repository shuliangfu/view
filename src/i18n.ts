/**
 * @module @dreamer/view/i18n
 *
 * @fileoverview view 包 i18n 桥接（仅服务端/CLI）：使用 @dreamer/i18n 的 $t，供 CLI 输出与服务端抛错使用。
 *
 * 未传 lang 时按环境变量（LANGUAGE / LC_ALL / LANG）检测语言。英语使用 en-US。
 * 文案来自 src/locales/zh-CN.json、en-US.json。
 */

import {
  $i18n,
  getGlobalI18n,
  getI18n,
  type TranslationData,
  type TranslationParams,
} from "@dreamer/i18n";
import { getEnv } from "@dreamer/runtime-adapter";
import zhCN from "./locales/zh-CN.json" with { type: "json" };
import enUS from "./locales/en-US.json" with { type: "json" };

/** 支持的 locale，zh-CN 为默认；英语使用 en-US */
export type Locale = "zh-CN" | "en-US";

/** 默认语言 */
export const DEFAULT_LOCALE: Locale = "zh-CN";

/** view 包支持的 locale 列表 */
const VIEW_LOCALES: Locale[] = ["zh-CN", "en-US"];

let viewTranslationsLoaded = false;

/**
 * 检测当前语言（服务端/CLI）：使用环境变量 LANGUAGE > LC_ALL > LANG。
 * 无法检测或不在支持列表时返回 en-US。
 */
export function detectLocale(): Locale {
  const langEnv = getEnv("LANGUAGE") || getEnv("LC_ALL") || getEnv("LANG");
  if (!langEnv) return "en-US";
  const first = langEnv.split(/[:\s]/)[0]?.trim();
  if (!first) return "en-US";
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
  return "en-US";
}

/**
 * 确保 view 文案已注入到当前使用的 I18n 实例（懒加载，仅执行一次）。
 */
export function ensureViewI18n(): void {
  if (viewTranslationsLoaded) return;
  const i18n = getGlobalI18n() ?? getI18n();
  i18n.loadTranslations("zh-CN", zhCN as TranslationData);
  i18n.loadTranslations("en-US", enUS as TranslationData);
  viewTranslationsLoaded = true;
}

/**
 * 根据 key 取翻译文案。
 *
 * @param key 文案 key，如 "error.ssrDocument"、"error.mountContainerNotFound"
 * @param params 占位替换，如 { selector: "#root" }
 * @param lang 语言，不传则自动检测（浏览器 navigator / 环境变量）
 * @returns 翻译后的字符串
 */
export function $t(
  key: string,
  params?: TranslationParams,
  lang?: Locale,
): string {
  ensureViewI18n();
  const current = $i18n.getLocale();
  const isSupported = (l: string): l is Locale =>
    VIEW_LOCALES.includes(l as Locale);

  if (lang !== undefined) {
    const prev = current;
    $i18n.setLocale(lang);
    try {
      return $i18n.t(key, params);
    } finally {
      $i18n.setLocale(prev);
    }
  }

  const effective: Locale = isSupported(current) ? current : detectLocale();
  $i18n.setLocale(effective);
  return $i18n.t(key, params);
}
