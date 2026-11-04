/**
 * @module @dreamer/view/devtools/overlay-l10n
 * @description Browser-safe zh/en strings for the DEV overlay.
 *
 * Follows `document.documentElement.lang` / `html[lang]` only.
 * **No** import of `src/i18n.ts`, `$tr`, or `@dreamer/runtime-adapter`
 * (those pull `node:*` into the client esbuild graph).
 * No language-switcher UI — change the page lang to relabel.
 */

import en from "./locales/en.json" with { type: "json" };
import zh from "./locales/zh.json" with { type: "json" };

export type OverlayLocaleId = "en" | "zh";

type Dict = Record<string, string>;

const PACKS: Record<OverlayLocaleId, Dict> = {
  en: en as Dict,
  zh: zh as Dict,
};

let current: OverlayLocaleId = "en";

/** Map a BCP-47 / html lang value to overlay en|zh. */
export function resolveOverlayLocale(
  lang: string | null | undefined,
): OverlayLocaleId {
  const raw = (lang ?? "").trim().toLowerCase().replace("_", "-");
  if (!raw) return "en";
  if (raw === "zh" || raw.startsWith("zh-")) return "zh";
  return "en";
}

/** Read page language from `document.documentElement.lang`. */
export function readPageLang(): string {
  try {
    if (typeof document === "undefined") return "";
    return (
      document.documentElement?.lang ||
      document.documentElement?.getAttribute("lang") ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

/** Sync overlay locale from the page lang. Returns the active id. */
export function syncOverlayLocaleFromPage(): OverlayLocaleId {
  current = resolveOverlayLocale(readPageLang());
  return current;
}

export function getOverlayLocale(): OverlayLocaleId {
  return current;
}

/**
 * Translate an overlay key. Params use `{name}` placeholders.
 * Missing keys fall back to English, then the key itself.
 */
export function ot(
  key: string,
  params?: Record<string, string | number | boolean>,
): string {
  const pack = PACKS[current] ?? PACKS.en;
  let text = pack[key] ?? PACKS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
