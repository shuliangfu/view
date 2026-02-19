/**
 * @module @dreamer/view/cmd/i18n
 *
 * @fileoverview view 包 i18n 桥接（仅服务端/CLI）：使用 $tr + 模块实例，不挂全局；供 CLI 输出与服务端抛错使用。
 *
 * 未传 lang 时按环境变量（LANGUAGE / LC_ALL / LANG）检测语言。默认 en-US。
 * 文案来自 src/cmd/locales/zh-CN.json、en-US.json。
 */

import {
  createI18n,
  type I18n,
  type TranslationData,
  type TranslationParams,
} from "@dreamer/i18n";
import { getEnv } from "@dreamer/runtime-adapter";
import zhCN from "./locales/zh-CN.json" with { type: "json" };
import enUS from "./locales/en-US.json" with { type: "json" };

/** 支持的 locale；英语使用 en-US */
export type Locale = "zh-CN" | "en-US";

/** 默认语言（与框架统一为 en-US） */
export const DEFAULT_LOCALE: Locale = "en-US";

/** view 包支持的 locale 列表 */
const VIEW_LOCALES: Locale[] = ["zh-CN", "en-US"];

const LOCALE_DATA: Record<string, TranslationData> = {
  "zh-CN": zhCN as TranslationData,
  "en-US": enUS as TranslationData,
};

/** init 时创建的 view cmd 实例，不挂全局，$tr 专用 */
let viewCmdI18n: I18n | null = null;

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

/**
 * 加载翻译并设置当前 locale。在入口（如 mod）调用一次；不挂全局。
 */
export function initViewI18n(): void {
  if (viewCmdI18n) return;
  const i18n = createI18n({
    defaultLocale: DEFAULT_LOCALE,
    fallbackBehavior: "default",
    locales: [...VIEW_LOCALES],
    translations: LOCALE_DATA as Record<string, TranslationData>,
  });
  i18n.setLocale(detectLocale());
  viewCmdI18n = i18n;
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
  if (!viewCmdI18n) return key;
  if (lang !== undefined) {
    const prev = viewCmdI18n.getLocale();
    viewCmdI18n.setLocale(lang);
    try {
      return viewCmdI18n.t(key, params as TranslationParams);
    } finally {
      viewCmdI18n.setLocale(prev);
    }
  }
  return viewCmdI18n.t(key, params as TranslationParams);
}
